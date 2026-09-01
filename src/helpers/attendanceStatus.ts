import type { AttendanceStatus } from "../models/attendance.js";

const LABEL: Record<AttendanceStatus, string> = {
  present: "hadir",
  late: "terlambat",
  absent: "tidak hadir",
  leave: "cuti",
  holiday: "libur",
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

  if (hour === 0) return `${remainder} menit`;
  if (remainder === 0) return `${hour} jam`;

  return `${hour} jam ${remainder} menit`;
}

export type ArrivalOutcome = "present" | "late" | "ditolak";

export function decideArrivalStatus(
  arrivalMinutes: number,
  startMinutes: number,
  toleranceMinutes: number,
  cutoffMinutes: number,
): ArrivalOutcome {
  switch (true) {
    case arrivalMinutes > cutoffMinutes:
      return "ditolak";

    case arrivalMinutes - startMinutes > toleranceMinutes:
      return "late";

    default:
      return "present";
  }
}

export type DailyMarker = "holiday" | "leave" | "absent" | "lewati";

export interface DailyState {
  alreadyRecorded: boolean;
  isHoliday: boolean;
  onLeave: boolean;
  isWorkday: boolean;
}

export function decideDailyMarker(state: DailyState): DailyMarker {
  switch (true) {
    case state.alreadyRecorded:
      return "lewati";

    case state.isHoliday:
      return "holiday";

    case state.onLeave:
      return "leave";

    case !state.isWorkday:
      return "lewati";

    default:
      return "absent";
  }
}
