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
    return "Waktu absen offline tidak dapat dibaca";
  }

  const delayMinutes = minutesBetween(offlineTime, serverTime);

  if (delayMinutes < -DEVICE_CLOCK_SKEW_MINUTES) {
    return "Waktu absen offline berada di masa depan, periksa pengaturan jam pada perangkatmu";
  }

  if (delayMinutes > MAX_SYNC_DELAY_MINUTES) {
    const hour = MAX_SYNC_DELAY_MINUTES / 60;

    return `Absen offline hanya dapat dikirim paling lambat ${hour} jam setelah waktu absennya, hubungi atasanmu untuk mengoreksi absensi ini`;
  }

  if (todayInOfficeZone(offlineTime) !== todayInOfficeZone(serverTime)) {
    return "Absen offline hanya dapat dikirim pada hari yang sama, hubungi atasanmu untuk mengoreksi absensi hari sebelumnya";
  }

  const local = toLocalTime(offlineTime);
  const earliestAllowed = startMinutes - MAX_EARLY_MINUTES;

  if (local.minutesSinceMidnight < earliestAllowed) {
    const hour = MAX_EARLY_MINUTES / 60;

    return `Waktu absen offline terlalu jauh sebelum jam masuk, paling awal ${hour} jam sebelumnya`;
  }

  return null;
}

export function buildOfflineNote(
  offlineTime: Date,
  serverTime: Date,
  noteField: string | null,
): string {
  const markers = `[Absen offline pukul ${clockTimeOf(offlineTime)}, diterima server ${clockTimeOf(serverTime)}]`;

  return noteField ? `${markers} ${noteField}` : markers;
}
