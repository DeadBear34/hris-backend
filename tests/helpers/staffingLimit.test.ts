import { jest, describe, it, expect, beforeEach } from "@jest/globals";

const mockCount = jest.fn();

jest.unstable_mockModule("../../src/models/leaveRequest.js", () => ({
  countApprovedLeaveByDate: mockCount,
}));

const { findFullDays, staffingLimitError, STAFFING_LIMIT_CODE } =
  await import("../../src/helpers/staffingLimit.js");

const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";

const department = {
  id: "99999999-9999-4999-8999-999999999999",
  name: "Engineering",
  max_concurrent_leave: 2,
};

const DATES = ["2026-11-02", "2026-11-03", "2026-11-04"];

beforeEach(() => {
  jest.clearAllMocks();
});

describe("findFullDays", () => {
  it("tanggal penuh bila rekan yang cuti sudah mencapai batas", async () => {
    mockCount.mockResolvedValue(
      new Map([
        ["2026-11-02", 1],
        ["2026-11-03", 2],
        ["2026-11-04", 3],
      ]) as never,
    );

    const full = await findFullDays(department, EMPLOYEE_ID, DATES);

    expect(full).toEqual([
      { date: "2026-11-03", on_leave: 2 },
      { date: "2026-11-04", on_leave: 3 },
    ]);
  });

  it("tanggal tanpa rekan yang cuti tidak penuh", async () => {
    mockCount.mockResolvedValue(new Map() as never);

    expect(await findFullDays(department, EMPLOYEE_ID, DATES)).toEqual([]);
  });

  it("pemohon sendiri tidak ikut dihitung", async () => {
    mockCount.mockResolvedValue(new Map() as never);

    await findFullDays(department, EMPLOYEE_ID, DATES);

    expect(mockCount).toHaveBeenCalledWith(
      department.id,
      EMPLOYEE_ID,
      DATES,
      undefined,
    );
  });

  it("departemen tanpa batas tidak memeriksa database", async () => {
    const full = await findFullDays(
      { ...department, max_concurrent_leave: null },
      EMPLOYEE_ID,
      DATES,
    );

    expect(full).toEqual([]);
    expect(mockCount).not.toHaveBeenCalled();
  });

  it("tanpa tanggal kerja tidak memeriksa database", async () => {
    expect(await findFullDays(department, EMPLOYEE_ID, [])).toEqual([]);
    expect(mockCount).not.toHaveBeenCalled();
  });

  it("memakai klien transaksi bila diberikan", async () => {
    mockCount.mockResolvedValue(new Map() as never);
    const client = { query: jest.fn() };

    await findFullDays(department, EMPLOYEE_ID, DATES, client as never);

    expect(mockCount).toHaveBeenCalledWith(
      department.id,
      EMPLOYEE_ID,
      DATES,
      client,
    );
  });
});

describe("staffingLimitError", () => {
  const fullDays = [{ date: "2026-11-03", on_leave: 2 }];

  it("409 dengan kode tersendiri dan rincian tanggal", () => {
    const err = staffingLimitError(department, fullDays);

    expect(err.statusCode).toBe(409);
    expect(err.code).toBe(STAFFING_LIMIT_CODE);
    expect(err.details).toEqual({
      department_id: department.id,
      department_name: "Engineering",
      max_concurrent_leave: 2,
      full_dates: fullDays,
      can_override: false,
    });
  });

  it("pesannya menyebut departemen, batas, dan tanggal", () => {
    const err = staffingLimitError(department, fullDays);

    expect(err.message).toBe(
      "Engineering already has the maximum of 2 employees on leave on 2026-11-03",
    );
  });

  it("tanggal yang banyak diringkas", () => {
    const many = [
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
    ].map((date) => ({ date, on_leave: 2 }));

    expect(staffingLimitError(department, many).message).toContain(
      "2026-11-02, 2026-11-03, 2026-11-04 and 2 other days",
    );
  });

  it("menandai bahwa pengguna boleh memaksa setuju", () => {
    const err = staffingLimitError(department, fullDays, true);

    expect((err.details as { can_override: boolean }).can_override).toBe(true);
  });
});
