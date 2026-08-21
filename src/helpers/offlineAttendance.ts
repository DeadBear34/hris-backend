import {
  jamLokal,
  keWaktuLokal,
  selisihMenit,
  tanggalHariIni,
} from "./timezone.js";

export const TOLERANSI_JAM_PERANGKAT_MENIT = 2;

export const BATAS_SINKRONISASI_MENIT = 6 * 60;

export const BATAS_AWAL_SEBELUM_MASUK_MENIT = 2 * 60;

export function alasanWaktuOfflineDitolak(
  waktuOffline: Date,
  waktuServer: Date,
  menitMasuk: number,
): string | null {
  if (Number.isNaN(waktuOffline.getTime())) {
    return "Waktu absen offline tidak dapat dibaca";
  }

  const jedaMenit = selisihMenit(waktuOffline, waktuServer);

  if (jedaMenit < -TOLERANSI_JAM_PERANGKAT_MENIT) {
    return "Waktu absen offline berada di masa depan, periksa pengaturan jam pada perangkatmu";
  }

  if (jedaMenit > BATAS_SINKRONISASI_MENIT) {
    const jam = BATAS_SINKRONISASI_MENIT / 60;

    return `Absen offline hanya dapat dikirim paling lambat ${jam} jam setelah waktu absennya, hubungi atasanmu untuk mengoreksi absensi ini`;
  }

  if (tanggalHariIni(waktuOffline) !== tanggalHariIni(waktuServer)) {
    return "Absen offline hanya dapat dikirim pada hari yang sama, hubungi atasanmu untuk mengoreksi absensi hari sebelumnya";
  }

  const lokal = keWaktuLokal(waktuOffline);
  const batasPalingAwal = menitMasuk - BATAS_AWAL_SEBELUM_MASUK_MENIT;

  if (lokal.menitSejakTengahMalam < batasPalingAwal) {
    const jam = BATAS_AWAL_SEBELUM_MASUK_MENIT / 60;

    return `Waktu absen offline terlalu jauh sebelum jam masuk, paling awal ${jam} jam sebelumnya`;
  }

  return null;
}

export function susunCatatanOffline(
  waktuOffline: Date,
  waktuServer: Date,
  catatan: string | null,
): string {
  const penanda = `[Absen offline pukul ${jamLokal(waktuOffline)}, diterima server ${jamLokal(waktuServer)}]`;

  return catatan ? `${penanda} ${catatan}` : penanda;
}
