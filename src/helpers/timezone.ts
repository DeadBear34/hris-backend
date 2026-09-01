import { env } from "../config/env.js";

export type IsoDate = string;

export type ClockTime = string;

export interface LocalTime {
  date: IsoDate;
  minutesSinceMidnight: number;
  hour: number;
  minute: number;
  day: number;
}

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export type DayName = (typeof DAY_NAMES)[number];

const formatterByZone = new Map<string, Intl.DateTimeFormat>();

function getFormatter(zone: string): Intl.DateTimeFormat {
  let formatter = formatterByZone.get(zone);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
      hour12: false,
    });
    formatterByZone.set(zone, formatter);
  }

  return formatter;
}

export function toLocalTime(at: Date = new Date()): LocalTime {
  const parts = getFormatter(env.TIMEZONE).formatToParts(at);

  const read = (tipe: string) =>
    parts.find((b) => b.type === tipe)?.value ?? "";

  const year = read("year");
  const month = read("month");
  const day = read("day");

  const hour = Number(read("hour")) % 24;
  const minute = Number(read("minute"));

  const dayAbbrev = read("weekday").toLowerCase();
  const dayIndex = DAY_NAMES.findIndex((name) => name.startsWith(dayAbbrev));

  return {
    date: `${year}-${month}-${day}`,
    minutesSinceMidnight: hour * 60 + minute,
    hour,
    minute,
    day: dayIndex === -1 ? 0 : dayIndex,
  };
}

export function todayInOfficeZone(at: Date = new Date()): IsoDate {
  return toLocalTime(at).date;
}

export function clockTimeOf(at: Date): ClockTime {
  const { hour, minute } = toLocalTime(at);

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function minutesFromClockTime(hour: ClockTime): number {
  const [h, m] = hour.split(":").map(Number);

  if (
    h === undefined ||
    m === undefined ||
    Number.isNaN(h) ||
    Number.isNaN(m)
  ) {
    throw new Error(`Format jam tidak valid: ${hour}`);
  }

  return h * 60 + m;
}

export function dayNameOf(date: IsoDate): DayName {
  const [year, month, day] = date.split("-").map(Number);

  if (!year || !month || !day) {
    throw new Error(`Tanggal tidak valid: ${date}`);
  }

  const indeks = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  return DAY_NAMES[indeks]!;
}

export function lateMinutesFrom(
  arrivalMinutes: number,
  startMinutes: number,
): number {
  return Math.max(0, arrivalMinutes - startMinutes);
}

export function minutesBetween(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / 60_000);
}

export function dateRange(start: IsoDate, end: IsoDate): IsoDate[] {
  const [ty, tm, td] = start.split("-").map(Number);
  const [ay, am, ad] = end.split("-").map(Number);

  if (!ty || !tm || !td || !ay || !am || !ad) {
    throw new Error(`Rentang tanggal tidak valid: ${start} sampai ${end}`);
  }

  const result: IsoDate[] = [];
  const cursor = new Date(Date.UTC(ty, tm - 1, td));
  const last = new Date(Date.UTC(ay, am - 1, ad));

  while (cursor.getTime() <= last.getTime()) {
    result.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return result;
}
