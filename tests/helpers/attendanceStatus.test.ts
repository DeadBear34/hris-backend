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
    expect(statusLabel("present")).toBe("present");
    expect(statusLabel("late")).toBe("late");
    expect(statusLabel("absent")).toBe("absent");
    expect(statusLabel("leave")).toBe("on leave");
    expect(statusLabel("holiday")).toBe("holiday");
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
    expect(formatDuration(510)).toBe("8 hours 30 minutes");
  });

  it("menghilangkan menit ketika pas pada jam bulat", () => {
    expect(formatDuration(540)).toBe("9 hours");
  });

  it("menampilkan menit saja untuk durasi di bawah satu jam", () => {
    expect(formatDuration(45)).toBe("45 minutes");
  });

  it("durasi nol tetap terbaca", () => {
    expect(formatDuration(0)).toBe("0 minutes");
  });
});

describe("tentukanStatusKedatangan", () => {
  const START_MINUTES = 8 * 60;
  const TOLERANCE = 5;
  const CUTOFF = 8 * 60 + 10;

  const decide = (hour: number, minute: number) =>
    decideArrivalStatus(hour * 60 + minute, START_MINUTES, TOLERANCE, CUTOFF);

  it("datang sebelum jam masuk tetap hadir", () => {
    expect(decide(7, 30)).toBe("present");
  });

  it("tepat pada jam masuk hadir", () => {
    expect(decide(8, 0)).toBe("present");
  });

  it("tepat pada batas toleransi masih hadir", () => {
    expect(decide(8, 5)).toBe("present");
  });

  it("satu menit setelah toleransi menjadi terlambat", () => {
    expect(decide(8, 6)).toBe("late");
  });

  it("tepat pada batas absen masih terlambat", () => {
    expect(decide(8, 10)).toBe("late");
  });

  it("satu menit setelah batas absen ditolak", () => {
    expect(decide(8, 11)).toBe("rejected");
  });

  it("datang jauh setelah batas absen ditolak", () => {
    expect(decide(14, 0)).toBe("rejected");
  });

  it("tidak menyisakan menit tanpa keputusan sepanjang hari", () => {
    for (let minute = 0; minute < 1440; minute++) {
      const result = decideArrivalStatus(
        minute,
        START_MINUTES,
        TOLERANCE,
        CUTOFF,
      );

      expect(["present", "late", "rejected"]).toContain(result);
    }
  });

  it("toleransi nol membuat satu menit terlambat langsung terhitung", () => {
    expect(decideArrivalStatus(481, START_MINUTES, 0, CUTOFF)).toBe("late");
    expect(decideArrivalStatus(480, START_MINUTES, 0, CUTOFF)).toBe("present");
  });
});

describe("tentukanPenandaHarian", () => {
  const state = (overrides: Partial<Parameters<typeof decideDailyMarker>[0]>) =>
    decideDailyMarker({
      alreadyRecorded: false,
      notEmployedYet: false,
      isHoliday: false,
      onLeave: false,
      isWorkday: true,
      checkInOpen: false,
      ...overrides,
    });

  it("melewati karyawan yang sudah punya absensi", () => {
    expect(state({ alreadyRecorded: true })).toBe("skip");
  });

  it("absensi yang sudah ada mengalahkan seluruh pertimbangan lain", () => {
    expect(
      state({ alreadyRecorded: true, isHoliday: true, onLeave: true }),
    ).toBe("skip");
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
    expect(state({ isWorkday: false })).toBe("skip");
  });

  it("hari libur tetap ditandai walau jatuh di luar hari kerja", () => {
    expect(state({ isHoliday: true, isWorkday: false })).toBe("holiday");
  });

  it("cuti tetap ditandai walau jatuh di luar hari kerja", () => {
    expect(state({ onLeave: true, isWorkday: false })).toBe("leave");
  });

  it("karyawan yang belum bergabung tidak ditandai apa pun", () => {
    expect(state({ notEmployedYet: true })).toBe("skip");
    expect(state({ notEmployedYet: true, isHoliday: true })).toBe("skip");
    expect(state({ notEmployedYet: true, onLeave: true })).toBe("skip");
  });

  it("belum ditandai tidak hadir selama batas absen masuk belum lewat", () => {
    expect(state({ checkInOpen: true })).toBe("pending");
  });

  it("libur dan cuti tetap ditandai walau batas absen masuk belum lewat", () => {
    expect(state({ checkInOpen: true, isHoliday: true })).toBe("holiday");
    expect(state({ checkInOpen: true, onLeave: true })).toBe("leave");
  });

  it("bukan hari kerja tetap dilewati walau batas absen masuk belum lewat", () => {
    expect(state({ checkInOpen: true, isWorkday: false })).toBe("skip");
  });

  it("selalu memberi keputusan untuk setiap kombinasi keadaan", () => {
    const value = [false, true];
    const seen = new Set<string>();

    for (const alreadyRecorded of value)
      for (const notEmployedYet of value)
        for (const isHoliday of value)
          for (const onLeave of value)
            for (const isWorkday of value)
              for (const checkInOpen of value) {
                const result = decideDailyMarker({
                  alreadyRecorded,
                  notEmployedYet,
                  isHoliday,
                  onLeave,
                  isWorkday,
                  checkInOpen,
                });

                expect([
                  "holiday",
                  "leave",
                  "absent",
                  "pending",
                  "skip",
                ]).toContain(result);
                seen.add(result);
              }

    expect(seen.size).toBe(5);
  });
});
