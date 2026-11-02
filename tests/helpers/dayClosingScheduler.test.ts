import { jest, describe, it, expect, beforeEach } from "@jest/globals";

jest.unstable_mockModule("../../src/config/logger.js", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.unstable_mockModule("../../src/helpers/activityLog.js", () => ({
  recordActivity: jest.fn(),
}));

jest.unstable_mockModule("../../src/helpers/dayClosing.js", () => ({
  closeDay: jest.fn(),
  dayClosingSummary: jest.fn(() => "ringkasan"),
}));

const { logger } = await import("../../src/config/logger.js");
const { recordActivity } = await import("../../src/helpers/activityLog.js");
const { closeDay } = await import("../../src/helpers/dayClosing.js");
const { datesToClose, runDayClosing, autoCloseEnabled, startDayClosing } =
  await import("../../src/helpers/dayClosingScheduler.js");

function result(date: string, created: number) {
  return {
    date,
    is_holiday: false,
    holiday_name: null,
    created,
    skipped: 0,
    pending: 0,
    marked: { holiday: 0, leave: 0, absent: created },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (closeDay as jest.Mock).mockImplementation(
    (date) => Promise.resolve(result(date as string, 0)) as never,
  );
});

describe("tanggal yang ditutup", () => {
  it("hari ini beserta beberapa hari sebelumnya, urut dari yang terlama", () => {
    expect(datesToClose("2026-10-28", 3)).toEqual([
      "2026-10-25",
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
    ]);
  });

  it("melewati pergantian bulan dan tahun", () => {
    expect(datesToClose("2027-01-01", 2)).toEqual([
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
    ]);
  });

  it("nol hari ke belakang berarti hanya hari ini", () => {
    expect(datesToClose("2026-10-28", 0)).toEqual(["2026-10-28"]);
  });
});

describe("penutupan hari otomatis", () => {
  it("mati saat pengujian kecuali dinyalakan lewat env", () => {
    expect(autoCloseEnabled()).toBe(false);
    expect(startDayClosing()).toBeNull();
  });

  it("menutup setiap tanggal dengan jam yang sama", async () => {
    const now = new Date("2026-10-28T10:00:00Z");

    await runDayClosing(["2026-10-27", "2026-10-28"], now);

    expect(closeDay).toHaveBeenCalledWith("2026-10-27", now);
    expect(closeDay).toHaveBeenCalledWith("2026-10-28", now);
  });

  it("mencatat aktivitas hanya bila ada baris yang dibuat", async () => {
    (closeDay as jest.Mock)
      .mockResolvedValueOnce(result("2026-10-27", 4) as never)
      .mockResolvedValueOnce(result("2026-10-28", 0) as never);

    await runDayClosing(["2026-10-27", "2026-10-28"]);

    expect(recordActivity).toHaveBeenCalledTimes(1);
    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "attendance.close_day",
        status: "success",
        actor_name: "System",
        metadata: expect.objectContaining({
          date: "2026-10-27",
          trigger: "scheduler",
        }),
      }),
    );
  });

  it("tanggal yang gagal tidak menghentikan tanggal berikutnya", async () => {
    (closeDay as jest.Mock)
      .mockRejectedValueOnce(new Error("koneksi putus") as never)
      .mockResolvedValueOnce(result("2026-10-28", 2) as never);

    const results = await runDayClosing(["2026-10-27", "2026-10-28"]);

    expect(results.map((row) => row.date)).toEqual(["2026-10-28"]);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ date: "2026-10-27" }),
      expect.any(String),
    );
  });

  it("putaran yang datang saat putaran sebelumnya berjalan dilewati", async () => {
    let release!: () => void;
    (closeDay as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(result("2026-10-28", 0));
        }) as never,
    );

    const first = runDayClosing(["2026-10-28"]);
    const second = await runDayClosing(["2026-10-28"]);

    expect(second).toEqual([]);
    expect(closeDay).toHaveBeenCalledTimes(1);

    release();
    await first;

    // setelah selesai, putaran berikutnya berjalan lagi
    await runDayClosing(["2026-10-28"]);
    expect(closeDay).toHaveBeenCalledTimes(2);
  });
});
