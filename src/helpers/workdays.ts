export type IsoDate = string;

const HARI_MINGGU = 0;
const HARI_SABTU = 6;

export function parseIsoDate(date: IsoDate): Date {
  const [year, month, day] = date.split("-").map(Number);

  if (!year || !month || !day) {
    throw new Error(`Tanggal tidak valid: ${date}`);
  }

  return new Date(Date.UTC(year, month - 1, day));
}

export function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();

  return day === HARI_MINGGU || day === HARI_SABTU;
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

export function daysFromToday(date: IsoDate): number {
  const hariIni = parseIsoDate(toIsoDate(new Date()));
  const target = parseIsoDate(date);

  return Math.round(
    (target.getTime() - hariIni.getTime()) / (24 * 60 * 60 * 1000),
  );
}

export function isPastDate(date: IsoDate): boolean {
  return daysFromToday(date) < 0;
}
