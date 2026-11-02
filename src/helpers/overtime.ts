import type { WorkSchedule } from "../models/workSchedule.js";
import {
  instantOf,
  minutesBetween,
  minutesFromClockTime,
  type IsoDate,
} from "./timezone.js";

// Lembur adalah menit kerja setelah jam pulang jadwal pada hari absensinya.
// Pulang sebelum jam pulang tidak menghasilkan lembur, dan lembur yang lebih
// pendek dari overtime_min_minutes jadwal tidak dihitung, supaya pulang
// telat beberapa menit karena merapikan meja tidak tercatat sebagai lembur.
// Begitu mencapai batas itu, seluruh menitnya dihitung sejak jam pulang
export function overtimeMinutes(
  attendance_date: IsoDate,
  check_out_at: Date,
  schedule: Pick<WorkSchedule, "end_time" | "overtime_min_minutes">,
): number {
  const scheduledEnd = instantOf(attendance_date, schedule.end_time);
  const minutes = minutesBetween(scheduledEnd, check_out_at);

  if (minutes <= 0) return 0;

  return minutes >= schedule.overtime_min_minutes ? minutes : 0;
}

// Absen pulang lewat tengah malam masih dianggap milik absensi kemarin
// selama jam kerja hari ini belum dimulai. Setelah itu, jam tersebut sudah
// menjadi milik hari kerja yang baru
export function isBeforeShiftStart(
  minutesSinceMidnight: number,
  schedule: Pick<WorkSchedule, "start_time">,
): boolean {
  return minutesSinceMidnight < minutesFromClockTime(schedule.start_time);
}
