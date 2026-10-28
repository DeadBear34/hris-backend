import * as attendanceModel from "../models/attendance.js";
import * as workScheduleModel from "../models/workSchedule.js";
import * as holidayModel from "../models/holiday.js";
import { isWorkingDay } from "../models/workSchedule.js";
import type { WorkSchedule } from "../models/workSchedule.js";
import { BadRequest } from "./appError.js";
import { plural } from "./plural.js";
import { withTransaction } from "./transaction.js";
import { decideDailyMarker } from "./attendanceStatus.js";
import {
  dayNameOf,
  minutesFromClockTime,
  toLocalTime,
  type DayName,
  type IsoDate,
} from "./timezone.js";

const BATCH_SIZE = 500;

interface DayFacts {
  holiday: Awaited<ReturnType<typeof holidayModel.findByDate>>;
  leaveByEmployee: Map<string, string>;
  alreadyRecorded: Set<string>;
  employeeSchedules: Awaited<
    ReturnType<typeof workScheduleModel.resolveForAllActive>
  >;
}

// Semua keadaan hari itu dikumpulkan sekali di depan, supaya keputusan
// per karyawan tidak menyentuh database lagi
async function collectDayFacts(date: IsoDate): Promise<DayFacts> {
  const [holiday, approvedLeaves, recorded, employeeSchedules] =
    await Promise.all([
      holidayModel.findByDate(date),
      attendanceModel.findApprovedLeaveOn(date),
      attendanceModel.findEmployeeIdsOnDate(date),
      workScheduleModel.resolveForAllActive(),
    ]);

  return {
    holiday,
    leaveByEmployee: new Map(
      approvedLeaves.map((row) => [row.employee_id, row.leave_request_id]),
    ),
    alreadyRecorded: new Set(recorded),
    employeeSchedules,
  };
}

// Batas absen masuk dianggap lewat dengan aturan yang sama seperti
// decideArrivalStatus: tepat pada menit batas masih boleh absen.
// nowMinutes null berarti harinya sudah lewat seluruhnya
function checkInStillOpen(
  schedule: WorkSchedule,
  nowMinutes: number | null,
): boolean {
  if (nowMinutes === null) return false;

  return nowMinutes <= minutesFromClockTime(schedule.absent_cutoff_time);
}

interface BuiltMarkers {
  markers: attendanceModel.MarkerRow[];
  skipped: number;
  pending: number;
}

// Menentukan penanda harian tiap karyawan. skipped dan pending dihitung
// terpisah karena keduanya tidak menghasilkan baris untuk disimpan
function buildMarkers(
  facts: DayFacts,
  date: IsoDate,
  day: DayName,
  nowMinutes: number | null,
): BuiltMarkers {
  const markers: attendanceModel.MarkerRow[] = [];
  let skipped = 0;
  let pending = 0;

  for (const { employee_id, join_date, schedule } of facts.employeeSchedules) {
    const leave_request_id = facts.leaveByEmployee.get(employee_id);

    switch (
      decideDailyMarker({
        alreadyRecorded: facts.alreadyRecorded.has(employee_id),
        notEmployedYet: Boolean(join_date && join_date > date),
        isHoliday: Boolean(facts.holiday),
        onLeave: Boolean(leave_request_id),
        isWorkday: isWorkingDay(schedule, day),
        checkInOpen: checkInStillOpen(schedule, nowMinutes),
      })
    ) {
      case "holiday":
        markers.push({
          employee_id,
          status: "holiday",
          note: facts.holiday?.name ?? null,
        });
        break;

      case "leave":
        markers.push({ employee_id, status: "leave", leave_request_id });
        break;

      case "absent":
        markers.push({ employee_id, status: "absent" });
        break;

      case "pending":
        pending += 1;
        break;

      case "skip":
        skipped += 1;
        break;
    }
  }

  return { markers, skipped, pending };
}

// Ditulis per potongan supaya satu transaksi tidak menahan ribuan baris
// sekaligus. Tiap potongan berdiri sendiri
async function storeMarkers(
  date: IsoDate,
  markers: attendanceModel.MarkerRow[],
): Promise<number> {
  let stored = 0;

  for (let i = 0; i < markers.length; i += BATCH_SIZE) {
    const chunk = markers.slice(i, i + BATCH_SIZE);

    stored += await withTransaction((client) =>
      attendanceModel.insertMarkers(client, date, chunk),
    );
  }

  return stored;
}

function countMarkers(markers: attendanceModel.MarkerRow[]) {
  const count = (status: string) =>
    markers.filter((row) => row.status === status).length;

  return {
    holiday: count("holiday"),
    leave: count("leave"),
    absent: count("absent"),
  };
}

export interface DayClosingResult {
  date: IsoDate;
  is_holiday: boolean;
  holiday_name: string | null;
  created: number;
  skipped: number;
  // karyawan yang batas absen masuknya hari ini belum lewat, jadi belum
  // boleh ditandai tidak hadir
  pending: number;
  marked: { holiday: number; leave: number; absent: number };
}

// Menutup satu hari: karyawan tanpa baris absensi diberi penanda libur, cuti,
// atau tidak hadir. Aman dijalankan berulang karena baris yang sudah ada
// tidak pernah ditimpa. Untuk hari ini, tanda tidak hadir hanya diberikan
// kepada karyawan yang batas absen masuknya sudah lewat
export async function closeDay(
  date: IsoDate,
  now: Date = new Date(),
): Promise<DayClosingResult> {
  const local = toLocalTime(now);

  if (date > local.date) {
    throw BadRequest(`${date} has not happened yet, so it cannot be closed`);
  }

  const nowMinutes = date === local.date ? local.minutesSinceMidnight : null;

  const facts = await collectDayFacts(date);
  const { markers, skipped, pending } = buildMarkers(
    facts,
    date,
    dayNameOf(date),
    nowMinutes,
  );
  const created = await storeMarkers(date, markers);

  return {
    date,
    is_holiday: Boolean(facts.holiday),
    holiday_name: facts.holiday?.name ?? null,
    created,
    skipped,
    pending,
    marked: countMarkers(markers),
  };
}

export function dayClosingSummary(result: DayClosingResult): string {
  return `Day closing for ${result.date}: ${plural(result.created, "row")} created, ${result.skipped} skipped, ${result.pending} still open`;
}
