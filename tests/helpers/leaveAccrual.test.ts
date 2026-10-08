import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";

const mockClient = { query: jest.fn(), release: jest.fn() };
const mockHasMissing = jest.fn();
const mockGrant = jest.fn();
const mockLock = jest.fn();

jest.unstable_mockModule("../../src/config/databaseConnection.js", () => ({
  pool: {
    connect: jest.fn(() => Promise.resolve(mockClient)),
    query: jest.fn(),
  },
}));

jest.unstable_mockModule("../../src/models/leaveBalance.js", () => ({
  hasMissingAccruals: mockHasMissing,
  grantAccruals: mockGrant,
  lockEmployeeBalance: mockLock,
}));

const { currentLeaveYear, isAccrualYear, ensureAccruals } = await import(
  "../../src/helpers/leaveAccrual.js"
);

const EMPLOYEE_ID = "33333333-3333-4333-8333-333333333333";

// 1 Januari 2027 pukul 05.00 WIB, masih 31 Desember 2026 menurut UTC
const NEW_YEAR_DAWN_WIB = new Date("2026-12-31T22:00:00Z");

function sqls(): unknown[] {
  return mockClient.query.mock.calls.map(([sql]) => sql);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockClient.query.mockResolvedValue({ rows: [] } as never);
  mockHasMissing.mockResolvedValue(true as never);
  mockGrant.mockResolvedValue(1 as never);
  mockLock.mockResolvedValue(undefined as never);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("currentLeaveYear", () => {
  it("tahun cuti berganti menurut WIB, bukan UTC", () => {
    expect(currentLeaveYear(NEW_YEAR_DAWN_WIB)).toBe(2027);
  });
});

describe("isAccrualYear", () => {
  const at = new Date("2026-06-15T05:00:00Z");

  it("tahun berjalan dan tahun depan boleh diberi jatah", () => {
    expect(isAccrualYear(2026, at)).toBe(true);
    expect(isAccrualYear(2027, at)).toBe(true);
  });

  it("tahun lampau dan terlalu jauh ke depan tidak", () => {
    expect(isAccrualYear(2025, at)).toBe(false);
    expect(isAccrualYear(2028, at)).toBe(false);
  });
});

describe("ensureAccruals", () => {
  const thisYear = currentLeaveYear();

  it("tidak membuka transaksi bila jatah sudah ada", async () => {
    mockHasMissing.mockResolvedValue(false as never);

    await ensureAccruals(EMPLOYEE_ID, thisYear);

    expect(mockGrant).not.toHaveBeenCalled();
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  it("memberi jatah di dalam transaksi setelah baris karyawan dikunci", async () => {
    const order: string[] = [];
    mockLock.mockImplementation(async () => {
      order.push("lock");
    });
    mockGrant.mockImplementation(async () => {
      order.push("grant");
      return 1;
    });

    await ensureAccruals(EMPLOYEE_ID, thisYear);

    expect(sqls()).toEqual(["BEGIN", "COMMIT"]);
    expect(order).toEqual(["lock", "grant"]);
    expect(mockGrant).toHaveBeenCalledWith(mockClient, [EMPLOYEE_ID], thisYear);
  });

  it("tidak membuat jatah untuk tahun yang sudah lewat", async () => {
    await ensureAccruals(EMPLOYEE_ID, thisYear - 1);

    expect(mockHasMissing).not.toHaveBeenCalled();
    expect(mockGrant).not.toHaveBeenCalled();
  });

  it("membatalkan transaksi bila pemberian jatah gagal", async () => {
    mockGrant.mockRejectedValue(new Error("gagal menulis") as never);

    await expect(ensureAccruals(EMPLOYEE_ID, thisYear)).rejects.toThrow(
      "gagal menulis",
    );
    expect(sqls()).toEqual(["BEGIN", "ROLLBACK"]);
  });
});
