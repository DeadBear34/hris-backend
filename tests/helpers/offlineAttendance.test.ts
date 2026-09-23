import { describe, it, expect } from "@jest/globals";
import {
  rejectionReasonForOfflineTime,
  buildOfflineNote,
  MAX_SYNC_DELAY_MINUTES,
} from "../../src/helpers/offlineAttendance.js";

const START_MINUTES = 8 * 60;

const wib = (date: string, hour: string) =>
  new Date(`${date}T${hour}:00+07:00`);

const rejectionFor = (offline: Date, server: Date) =>
  rejectionReasonForOfflineTime(offline, server, START_MINUTES);

describe("alasanWaktuOfflineDitolak", () => {
  it("menerima absen offline yang disinkronkan tak lama setelahnya", () => {
    expect(
      rejectionFor(wib("2026-08-20", "07:55"), wib("2026-08-20", "09:12")),
    ).toBeNull();
  });

  it("menerima sinkronisasi yang datang seketika", () => {
    expect(
      rejectionFor(wib("2026-08-20", "07:55"), wib("2026-08-20", "07:55")),
    ).toBeNull();
  });

  it("menerima selisih jam perangkat yang sedikit mendahului server", () => {
    expect(
      rejectionFor(wib("2026-08-20", "08:01"), wib("2026-08-20", "08:00")),
    ).toBeNull();
  });

  it("menolak waktu absen yang berada di masa depan", () => {
    const reason = rejectionFor(
      wib("2026-08-20", "08:30"),
      wib("2026-08-20", "08:00"),
    );

    expect(reason).toContain("in the future");
  });

  it("menolak waktu yang tidak dapat dibaca", () => {
    const reason = rejectionReasonForOfflineTime(
      new Date("bukan tanggal"),
      wib("2026-08-20", "08:00"),
      START_MINUTES,
    );

    expect(reason).toContain("could not be read");
  });

  it("menerima sinkronisasi tepat pada batas jeda", () => {
    const offline = wib("2026-08-20", "08:00");
    const server = new Date(
      offline.getTime() + MAX_SYNC_DELAY_MINUTES * 60_000,
    );

    expect(rejectionFor(offline, server)).toBeNull();
  });

  it("menolak sinkronisasi yang melewati batas jeda", () => {
    const offline = wib("2026-08-20", "08:00");
    const server = new Date(
      offline.getTime() + (MAX_SYNC_DELAY_MINUTES + 1) * 60_000,
    );

    expect(rejectionFor(offline, server)).toContain("up to");
  });

  it("menolak absen offline yang melewati pergantian hari", () => {
    // jedanya hanya dua jam, tetapi tanggal WIB-nya sudah berbeda
    const reason = rejectionFor(
      wib("2026-08-19", "23:00"),
      wib("2026-08-20", "01:00"),
    );

    expect(reason).toContain("same day");
  });

  it("absen kemarin tertahan batas jeda lebih dulu", () => {
    const reason = rejectionFor(
      wib("2026-08-19", "08:00"),
      wib("2026-08-20", "09:00"),
    );

    expect(reason).toContain("up to");
  });

  it("menolak waktu yang terlalu jauh sebelum jam masuk", () => {
    const reason = rejectionFor(
      wib("2026-08-20", "05:00"),
      wib("2026-08-20", "09:00"),
    );

    expect(reason).toContain("too early");
  });

  it("menerima datang dua jam sebelum jam masuk", () => {
    expect(
      rejectionFor(wib("2026-08-20", "06:00"), wib("2026-08-20", "09:00")),
    ).toBeNull();
  });

  it("membedakan hari memakai zona waktu kantor, bukan UTC", () => {
    // 2026-08-19 22:00 UTC sudah menjadi 2026-08-20 05:00 WIB,
    // jadi keduanya berada pada hari WIB yang sama
    const offline = new Date("2026-08-19T23:00:00Z");
    const server = new Date("2026-08-20T02:00:00Z");

    expect(
      rejectionReasonForOfflineTime(offline, server, START_MINUTES),
    ).toBeNull();
  });
});

describe("susunCatatanOffline", () => {
  it("mencantumkan jam absen dan jam terima server", () => {
    const noteField = buildOfflineNote(
      wib("2026-08-20", "07:55"),
      wib("2026-08-20", "09:12"),
      null,
    );

    expect(noteField).toBe(
      "[Offline attendance at 07:55, received by server at 09:12]",
    );
  });

  it("mempertahankan catatan asli karyawan", () => {
    const noteField = buildOfflineNote(
      wib("2026-08-20", "07:55"),
      wib("2026-08-20", "09:12"),
      "Jaringan kantor mati",
    );

    expect(noteField).toContain("Jaringan kantor mati");
    expect(noteField.startsWith("[Offline attendance")).toBe(true);
  });
});
