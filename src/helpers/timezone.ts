import { env } from "../config/env.js";

export type IsoDate = string;

export type JamDinding = string;

export interface WaktuLokal {
  tanggal: IsoDate;
  menitSejakTengahMalam: number;
  jam: number;
  menit: number;
  hari: number;
}

const HARI = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export type NamaHari = (typeof HARI)[number];

const formatterPerZona = new Map<string, Intl.DateTimeFormat>();

function ambilFormatter(zona: string): Intl.DateTimeFormat {
  let formatter = formatterPerZona.get(zona);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: zona,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
      hour12: false,
    });
    formatterPerZona.set(zona, formatter);
  }

  return formatter;
}

export function keWaktuLokal(waktu: Date = new Date()): WaktuLokal {
  const bagian = ambilFormatter(env.TIMEZONE).formatToParts(waktu);

  const ambil = (tipe: string) =>
    bagian.find((b) => b.type === tipe)?.value ?? "";

  const tahun = ambil("year");
  const bulan = ambil("month");
  const hari = ambil("day");

  const jam = Number(ambil("hour")) % 24;
  const menit = Number(ambil("minute"));

  const singkatanHari = ambil("weekday").toLowerCase();
  const indeksHari = HARI.findIndex((h) => h.startsWith(singkatanHari));

  return {
    tanggal: `${tahun}-${bulan}-${hari}`,
    menitSejakTengahMalam: jam * 60 + menit,
    jam,
    menit,
    hari: indeksHari === -1 ? 0 : indeksHari,
  };
}

export function tanggalHariIni(waktu: Date = new Date()): IsoDate {
  return keWaktuLokal(waktu).tanggal;
}

export function jamLokal(waktu: Date): JamDinding {
  const { jam, menit } = keWaktuLokal(waktu);

  return `${String(jam).padStart(2, "0")}:${String(menit).padStart(2, "0")}`;
}

export function menitDariJam(jam: JamDinding): number {
  const [h, m] = jam.split(":").map(Number);

  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) {
    throw new Error(`Format jam tidak valid: ${jam}`);
  }

  return h * 60 + m;
}

export function namaHariDariTanggal(tanggal: IsoDate): NamaHari {
  const [tahun, bulan, hari] = tanggal.split("-").map(Number);

  if (!tahun || !bulan || !hari) {
    throw new Error(`Tanggal tidak valid: ${tanggal}`);
  }

  const indeks = new Date(Date.UTC(tahun, bulan - 1, hari)).getUTCDay();

  return HARI[indeks]!;
}

export function menitKeterlambatan(
  menitDatang: number,
  menitMasuk: number,
): number {
  return Math.max(0, menitDatang - menitMasuk);
}

export function selisihMenit(awal: Date, akhir: Date): number {
  return Math.floor((akhir.getTime() - awal.getTime()) / 60_000);
}

export function rentangTanggal(start: IsoDate, end: IsoDate): IsoDate[] {
  const [ty, tm, td] = start.split("-").map(Number);
  const [ay, am, ad] = end.split("-").map(Number);

  if (!ty || !tm || !td || !ay || !am || !ad) {
    throw new Error(`Rentang tanggal tidak valid: ${start} sampai ${end}`);
  }

  const hasil: IsoDate[] = [];
  const kursor = new Date(Date.UTC(ty, tm - 1, td));
  const akhir = new Date(Date.UTC(ay, am - 1, ad));

  while (kursor.getTime() <= akhir.getTime()) {
    hasil.push(kursor.toISOString().slice(0, 10));
    kursor.setUTCDate(kursor.getUTCDate() + 1);
  }

  return hasil;
}
