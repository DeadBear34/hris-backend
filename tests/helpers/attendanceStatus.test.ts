import { describe, it, expect } from "@jest/globals";
import {
  statusLabel,
  requiresCheckIn,
  formatDuration,
  decideArrivalStatus,
  decideDailyMarker,
} from "../../src/helpers/attendanceStatus.js";

describe("statusLabel", () => {
  it("menerjemahkan setiap status ke bahasa Indonesia", () => {
    expect(statusLabel("present")).toBe("hadir");
    expect(statusLabel("late")).toBe("terlambat");
    expect(statusLabel("absent")).toBe("tidak hadir");
    expect(statusLabel("leave")).toBe("cuti");
    expect(statusLabel("holiday")).toBe("libur");
  });
});

describe("butuhJamMasuk", () => {
  it("hanya hadir dan terlambat yang mengharuskan jam masuk", () => {
    expect(requiresCheckIn("present")).toBe(true);
    expect(requiresCheckIn("late")).toBe(true);
  });

  it("status tanpa kehadiran justru tidak boleh memiliki jam masuk", () => {
    expect(requiresCheckIn("absent")).toBe(false);
    expect(requiresCheckIn("leave")).toBe(false);
    expect(requiresCheckIn("holiday")).toBe(false);
  });
});

describe("jamMenit", () => {
  it("menampilkan jam dan menit sekaligus", () => {
    expect(formatDuration(510)).toBe("8 jam 30 menit");
  });

  it("menghilangkan menit ketika pas pada jam bulat", () => {
    expect(formatDuration(540)).toBe("9 jam");
  });

  it("menampilkan menit saja untuk durasi di bawah satu jam", () => {
    expect(formatDuration(45)).toBe("45 menit");
  });

  it("durasi nol tetap terbaca", () => {
    expect(formatDuration(0)).toBe("0 menit");
  });
});

describe("tentukanStatusKedatangan", () => {
  const MASUK = 8 * 60;
  const TOLERANSI = 5;
  const TUTUP = 8 * 60 + 10;

  const putuskan = (hour: number, minute: number) =>
    decideArrivalStatus(hour * 60 + minute, MASUK, TOLERANSI, TUTUP);

  it("datang sebelum jam masuk tetap hadir", () => {
    expect(putuskan(7, 30)).toBe("present");
  });

  it("tepat pada jam masuk hadir", () => {
    expect(putuskan(8, 0)).toBe("present");
  });

  it("tepat pada batas toleransi masih hadir", () => {
    expect(putuskan(8, 5)).toBe("present");
  });

  it("satu menit setelah toleransi menjadi terlambat", () => {
    expect(putuskan(8, 6)).toBe("late");
  });

  it("tepat pada batas absen masih terlambat", () => {
    expect(putuskan(8, 10)).toBe("late");
  });

  it("satu menit setelah batas absen ditolak", () => {
    expect(putuskan(8, 11)).toBe("ditolak");
  });

  it("datang jauh setelah batas absen ditolak", () => {
    expect(putuskan(14, 0)).toBe("ditolak");
  });

  it("tidak menyisakan menit tanpa keputusan sepanjang hari", () => {
    for (let minute = 0; minute < 1440; minute++) {
      const result = decideArrivalStatus(minute, MASUK, TOLERANSI, TUTUP);

      expect(["present", "late", "ditolak"]).toContain(result);
    }
  });

  it("toleransi nol membuat satu menit terlambat langsung terhitung", () => {
    expect(decideArrivalStatus(481, MASUK, 0, TUTUP)).toBe("late");
    expect(decideArrivalStatus(480, MASUK, 0, TUTUP)).toBe("present");
  });
});

describe("tentukanPenandaHarian", () => {
  const state = (
    ubah: Partial<Parameters<typeof decideDailyMarker>[0]>,
  ) =>
    decideDailyMarker({
      alreadyRecorded: false,
      isHoliday: false,
      onLeave: false,
      isWorkday: true,
      ...ubah,
    });

  it("melewati karyawan yang sudah punya absensi", () => {
    expect(state({ alreadyRecorded: true })).toBe("lewati");
  });

  it("absensi yang sudah ada mengalahkan seluruh pertimbangan lain", () => {
    expect(
      state({ alreadyRecorded: true, isHoliday: true, onLeave: true }),
    ).toBe("lewati");
  });

  it("hari libur mengalahkan cuti", () => {
    expect(state({ isHoliday: true, onLeave: true })).toBe("holiday");
  });

  it("cuti mengalahkan tidak hadir", () => {
    expect(state({ onLeave: true })).toBe("leave");
  });

  it("hari kerja tanpa absensi menjadi tidak hadir", () => {
    expect(state({})).toBe("absent");
  });

  it("bukan hari kerja tidak menghasilkan baris apa pun", () => {
    expect(state({ isWorkday: false })).toBe("lewati");
  });

  it("hari libur tetap ditandai walau jatuh di luar hari kerja", () => {
    expect(state({ isHoliday: true, isWorkday: false })).toBe("holiday");
  });

  it("cuti tetap ditandai walau jatuh di luar hari kerja", () => {
    expect(state({ onLeave: true, isWorkday: false })).toBe("leave");
  });

  it("selalu memberi keputusan untuk setiap kombinasi keadaan", () => {
    const value = [false, true];

    for (const alreadyRecorded of value)
      for (const isHoliday of value)
        for (const onLeave of value)
          for (const isWorkday of value) {
            const result = decideDailyMarker({
              sudahAdaAbsensi: alreadyRecorded,
              hariLibur: isHoliday,
              sedangCuti: onLeave,
              hariKerja: isWorkday,
            });

            expect(["holiday", "leave", "absent", "lewati"]).toContain(result);
          }
  });
});
