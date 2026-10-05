import { todayInOfficeZone } from "./timezone.js";

export type IsoDate = string;

const SUNDAY = 0;
const SATURDAY = 6;

export function parseIsoDate(date: IsoDate): Date {
  const [year, month, day] = date.split("-").map(Number);

  if (!year || !month || !day) {
    throw new Error(`Invalid date: ${date}`);
  }

  return new Date(Date.UTC(year, month - 1, day));
}

export function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();

  return day === SUNDAY || day === SATURDAY;
}

export function eachDateInRange(start: IsoDate, end: IsoDate): Date[] {
  const first = parseIsoDate(start);
  const last = parseIsoDate(end);
  const result: Date[] = [];

  for (
    let cursor = new Date(first);
    cursor.getTime() <= last.getTime();
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    result.push(new Date(cursor));
  }

  return result;
}

export function countWorkdays(
  start: IsoDate,
  end: IsoDate,
  holidays: IsoDate[] = [],
): number {
  const holidaySet = new Set(holidays);

  return eachDateInRange(start, end).filter(
    (date) => !isWeekend(date) && !holidaySet.has(toIsoDate(date)),
  ).length;
}

// "Hari ini" diambil menurut zona waktu kantor. Tanggal UTC tertinggal sehari
// antara pukul 00.00 dan 07.00 WIB, sehingga cuti yang mulai kemarin masih
// dianggap belum lewat dan jarak pemberitahuan cuti terhitung lebih panjang
export function daysFromToday(date: IsoDate, at: Date = new Date()): number {
  const today = parseIsoDate(todayInOfficeZone(at));
  const target = parseIsoDate(date);

  return Math.round(
    (target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
  );
}

export function isPastDate(date: IsoDate, at: Date = new Date()): boolean {
  return daysFromToday(date, at) < 0;
}
