import * as leaveRequestModel from "../models/leaveRequest.js";
import type { Department } from "../models/department.js";
import type { Executor } from "../models/user.js";
import { AppError } from "./appError.js";
import { plural } from "./plural.js";

// Kode error tersendiri supaya frontend bisa membedakannya dari bentrok
// pengajuan milik sendiri (CONFLICT dengan conflicting_request_id)
export const STAFFING_LIMIT_CODE = "STAFFING_LIMIT_REACHED";

// Alasan memaksa setuju harus cukup jelas untuk dibaca ulang di log
export const OVERRIDE_NOTE_MIN_LENGTH = 10;

export interface FullDay {
  date: string;
  // rekan satu departemen yang cutinya sudah disetujui pada tanggal ini
  on_leave: number;
}

type LimitedDepartment = Pick<
  Department,
  "id" | "name" | "max_concurrent_leave"
>;

// Tanggal kerja pemohon yang sudah penuh, yaitu jumlah rekan yang sedang
// cuti sudah mencapai batas departemen. Kosong bila departemen tanpa batas
export async function findFullDays(
  department: LimitedDepartment,
  employee_id: string,
  dates: string[],
  db?: Executor,
): Promise<FullDay[]> {
  const limit = department.max_concurrent_leave;
  if (limit === null || limit === undefined || dates.length === 0) return [];

  const counts = await leaveRequestModel.countApprovedLeaveByDate(
    department.id,
    employee_id,
    dates,
    db,
  );

  return dates
    .map((date) => ({ date, on_leave: counts.get(date) ?? 0 }))
    .filter((day) => day.on_leave >= limit);
}

const MAX_DATES_IN_MESSAGE = 3;

function describeDates(dates: string[]): string {
  if (dates.length <= MAX_DATES_IN_MESSAGE) return dates.join(", ");

  const shown = dates.slice(0, MAX_DATES_IN_MESSAGE).join(", ");
  return `${shown} and ${plural(dates.length - MAX_DATES_IN_MESSAGE, "other day")}`;
}

export function staffingLimitError(
  department: LimitedDepartment,
  fullDays: FullDay[],
  canOverride = false,
): AppError {
  const limit = department.max_concurrent_leave ?? 0;

  return new AppError(
    409,
    `${department.name} already has the maximum of ${plural(limit, "employee")} on leave on ${describeDates(fullDays.map((day) => day.date))}`,
    STAFFING_LIMIT_CODE,
    {
      department_id: department.id,
      department_name: department.name,
      max_concurrent_leave: limit,
      full_dates: fullDays,
      // true bila pengguna ini boleh memaksa setuju dengan
      // override_staffing_limit dan alasan di decision_note
      can_override: canOverride,
    },
  );
}
