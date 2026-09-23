import {
  clockTimeOf,
  toLocalTime,
  minutesBetween,
  todayInOfficeZone,
} from "./timezone.js";

export const DEVICE_CLOCK_SKEW_MINUTES = 2;

export const MAX_SYNC_DELAY_MINUTES = 6 * 60;

export const MAX_EARLY_MINUTES = 2 * 60;

export function rejectionReasonForOfflineTime(
  offlineTime: Date,
  serverTime: Date,
  startMinutes: number,
): string | null {
  if (Number.isNaN(offlineTime.getTime())) {
    return "Offline attendance time could not be read";
  }

  const delayMinutes = minutesBetween(offlineTime, serverTime);

  if (delayMinutes < -DEVICE_CLOCK_SKEW_MINUTES) {
    return "Offline attendance time is in the future, check your device's clock settings";
  }

  if (delayMinutes > MAX_SYNC_DELAY_MINUTES) {
    const hour = MAX_SYNC_DELAY_MINUTES / 60;

    return `Offline attendance can only be sent up to ${hour} hours after it was recorded, contact your manager to correct this attendance`;
  }

  if (todayInOfficeZone(offlineTime) !== todayInOfficeZone(serverTime)) {
    return "Offline attendance can only be sent on the same day, contact your manager to correct a previous day's attendance";
  }

  const local = toLocalTime(offlineTime);
  const earliestAllowed = startMinutes - MAX_EARLY_MINUTES;

  if (local.minutesSinceMidnight < earliestAllowed) {
    const hour = MAX_EARLY_MINUTES / 60;

    return `Offline attendance time is too early, at most ${hour} hours before the start time`;
  }

  return null;
}

export function buildOfflineNote(
  offlineTime: Date,
  serverTime: Date,
  noteField: string | null,
): string {
  const markers = `[Offline attendance at ${clockTimeOf(offlineTime)}, received by server at ${clockTimeOf(serverTime)}]`;

  return noteField ? `${markers} ${noteField}` : markers;
}
