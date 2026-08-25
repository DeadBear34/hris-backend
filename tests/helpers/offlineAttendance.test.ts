import { describe, it, expect } from "@jest/globals";
import {
  alasanWaktuOfflineDitolak,
  susunCatatanOffline,
  BATAS_SINKRONISASI_MENIT,
} from "../../src/helpers/offlineAttendance.js";

const MENIT_MASUK = 8 * 60;

const wib = (tanggal: string, jam: string) =>
  new Date(`${tanggal}T${jam}:00+07:00`);

const tolak = (offline: Date, server: Date) =>
  alasanWaktuOfflineDitolak(offline, server, MENIT_MASUK);

describe("alasanWaktuOfflineDitolak", () => {
  it("menerima absen offline yang disinkronkan tak lama setelahnya", () => {
    expect(
      tolak(wib("2026-08-20", "07:55"), wib("2026-08-20", "09:12")),
    ).toBeNull();
  });

  it("menerima sinkronisasi yang datang seketika", () => {
    expect(
      tolak(wib("2026-08-20", "07:55"), wib("2026-08-20", "07:55")),
    ).toBeNull();
  });

  it("menerima selisih jam perangkat yang sedikit mendahului server", () => {
    expect(
      tolak(wib("2026-08-20", "08:01"), wib("2026-08-20", "08:00")),
    ).toBeNull();
  });

  it("menolak waktu absen yang berada di masa depan", () => {
    const alasan = tolak(
      wib("2026-08-20", "08:30"),
      wib("2026-08-20", "08:00"),
    );

    expect(alasan).toContain("masa depan");
  });

  it("menolak waktu yang tidak dapat dibaca", () => {
    const alasan = alasanWaktuOfflineDitolak(
      new Date("bukan tanggal"),
      wib("2026-08-20", "08:00"),
      MENIT_MASUK,
    );

    expect(alasan).toContain("tidak dapat dibaca");
  });

  it("menerima sinkronisasi tepat pada batas jeda", () => {
    const offline = wib("2026-08-20", "08:00");
    const server = new Date(
      offline.getTime() + BATAS_SINKRONISASI_MENIT * 60_000,
    );

    expect(tolak(offline, server)).toBeNull();
  });

  it("menolak sinkronisasi yang melewati batas jeda", () => {
    const offline = wib("2026-08-20", "08:00");
    const server = new Date(
      offline.getTime() + (BATAS_SINKRONISASI_MENIT + 1) * 60_000,
    );

    expect(tolak(offline, server)).toContain("paling lambat");
  });

  it("menolak absen offline yang melewati pergantian hari", () => {
    // jedanya hanya dua jam, tetapi tanggal WIB-nya sudah berbeda
    const alasan = tolak(
      wib("2026-08-19", "23:00"),
      wib("2026-08-20", "01:00"),
    );

    expect(alasan).toContain("hari yang sama");
  });

  it("absen kemarin tertahan batas jeda lebih dulu", () => {
    const alasan = tolak(
      wib("2026-08-19", "08:00"),
      wib("2026-08-20", "09:00"),
    );

    expect(alasan).toContain("paling lambat");
  });

  it("menolak waktu yang terlalu jauh sebelum jam masuk", () => {
    const alasan = tolak(
      wib("2026-08-20", "05:00"),
      wib("2026-08-20", "09:00"),
    );

    expect(alasan).toContain("terlalu jauh sebelum jam masuk");
  });

  it("menerima datang dua jam sebelum jam masuk", () => {
    expect(
      tolak(wib("2026-08-20", "06:00"), wib("2026-08-20", "09:00")),
    ).toBeNull();
  });

  it("membedakan hari memakai zona waktu kantor, bukan UTC", () => {
    // 2026-08-19 22:00 UTC sudah menjadi 2026-08-20 05:00 WIB,
    // jadi keduanya berada pada hari WIB yang sama
    const offline = new Date("2026-08-19T23:00:00Z");
    const server = new Date("2026-08-20T02:00:00Z");

    expect(alasanWaktuOfflineDitolak(offline, server, MENIT_MASUK)).toBeNull();
  });
});

describe("susunCatatanOffline", () => {
  it("mencantumkan jam absen dan jam terima server", () => {
    const catatan = susunCatatanOffline(
      wib("2026-08-20", "07:55"),
      wib("2026-08-20", "09:12"),
      null,
    );

    expect(catatan).toBe("[Absen offline pukul 07:55, diterima server 09:12]");
  });

  it("mempertahankan catatan asli karyawan", () => {
    const catatan = susunCatatanOffline(
      wib("2026-08-20", "07:55"),
      wib("2026-08-20", "09:12"),
      "Jaringan kantor mati",
    );

    expect(catatan).toContain("Jaringan kantor mati");
    expect(catatan.startsWith("[Absen offline")).toBe(true);
  });
});
