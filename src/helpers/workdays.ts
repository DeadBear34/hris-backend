export type IsoDate = string;

const HARI_MINGGU = 0;
const HARI_SABTU = 6;

export function parseIsoDate(tanggal: IsoDate): Date {
  const [tahun, bulan, hari] = tanggal.split("-").map(Number);

  if (!tahun || !bulan || !hari) {
    throw new Error(`Tanggal tidak valid: ${tanggal}`);
  }

  return new Date(Date.UTC(tahun, bulan - 1, hari));
}

export function toIsoDate(tanggal: Date): IsoDate {
  return tanggal.toISOString().slice(0, 10);
}

export function isWeekend(tanggal: Date): boolean {
  const hari = tanggal.getUTCDay();

  return hari === HARI_MINGGU || hari === HARI_SABTU;
}

export function eachDateInRange(start: IsoDate, end: IsoDate): Date[] {
  const awal = parseIsoDate(start);
  const akhir = parseIsoDate(end);
  const hasil: Date[] = [];

  for (
    let kursor = new Date(awal);
    kursor.getTime() <= akhir.getTime();
    kursor.setUTCDate(kursor.getUTCDate() + 1)
  ) {
    hasil.push(new Date(kursor));
  }

  return hasil;
}

export function countWorkdays(
  start: IsoDate,
  end: IsoDate,
  holidays: IsoDate[] = [],
): number {
  const libur = new Set(holidays);

  return eachDateInRange(start, end).filter(
    (tanggal) => !isWeekend(tanggal) && !libur.has(toIsoDate(tanggal)),
  ).length;
}

export function daysFromToday(tanggal: IsoDate): number {
  const hariIni = parseIsoDate(toIsoDate(new Date()));
  const target = parseIsoDate(tanggal);

  return Math.round(
    (target.getTime() - hariIni.getTime()) / (24 * 60 * 60 * 1000),
  );
}

export function isPastDate(tanggal: IsoDate): boolean {
  return daysFromToday(tanggal) < 0;
}
