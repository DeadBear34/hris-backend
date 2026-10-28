import type { AttendanceStatus } from "../models/attendance.js";
import { plural } from "./plural.js";

const LABEL: Record<AttendanceStatus, string> = {
  present: "present",
  late: "late",
  absent: "absent",
  leave: "on leave",
  holiday: "holiday",
};

export function statusLabel(status: AttendanceStatus): string {
  return LABEL[status];
}

export function requiresCheckIn(status: AttendanceStatus): boolean {
  switch (status) {
    case "present":
    case "late":
      return true;

    case "absent":
    case "leave":
    case "holiday":
      return false;
  }
}

export function formatDuration(minute: number): string {
  const hour = Math.floor(minute / 60);
  const remainder = minute % 60;

  if (hour === 0) return `${plural(remainder, "minute")}`;
  if (remainder === 0) return `${plural(hour, "hour")}`;

  return `${plural(hour, "hour")} ${plural(remainder, "minute")}`;
}

export type ArrivalOutcome = "present" | "late" | "rejected";

export function decideArrivalStatus(
  arrivalMinutes: number,
  startMinutes: number,
  toleranceMinutes: number,
  cutoffMinutes: number,
): ArrivalOutcome {
  switch (true) {
    case arrivalMinutes > cutoffMinutes:
      return "rejected";

    case arrivalMinutes - startMinutes > toleranceMinutes:
      return "late";

    default:
      return "present";
  }
}

export type DailyMarker = "holiday" | "leave" | "absent" | "pending" | "skip";

export interface DailyState {
  alreadyRecorded: boolean;
  // hari itu sebelum tanggal bergabung, jadi belum ada kewajiban absen
  notEmployedYet: boolean;
  isHoliday: boolean;
  onLeave: boolean;
  isWorkday: boolean;
  // batas absen masuk hari ini belum lewat, karyawan masih bisa datang
  checkInOpen: boolean;
}

export function decideDailyMarker(state: DailyState): DailyMarker {
  switch (true) {
    case state.alreadyRecorded:
    case state.notEmployedYet:
      return "skip";

    case state.isHoliday:
      return "holiday";

    case state.onLeave:
      return "leave";

    case !state.isWorkday:
      return "skip";

    case state.checkInOpen:
      return "pending";

    default:
      return "absent";
  }
}
