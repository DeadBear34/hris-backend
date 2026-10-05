import { jest, describe, it, expect, beforeEach } from "@jest/globals";

const mockClient = { query: jest.fn(), release: jest.fn() };
const mockConnect = jest.fn();
const mockLoggerError = jest.fn();

jest.unstable_mockModule("../../src/config/databaseConnection.js", () => ({
  pool: { connect: mockConnect, query: jest.fn() },
}));

jest.unstable_mockModule("../../src/config/logger.js", () => ({
  logger: { debug: jest.fn(), error: mockLoggerError, warn: jest.fn(), info: jest.fn() },
}));

const { withTransaction } = await import("../../src/helpers/transaction.js");

function sqls(): unknown[] {
  return mockClient.query.mock.calls.map(([sql]) => sql);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockConnect.mockResolvedValue(mockClient as never);
  mockClient.query.mockResolvedValue({ rows: [] } as never);
});

describe("withTransaction", () => {
  it("menjalankan BEGIN lalu COMMIT dan mengembalikan hasil pekerjaan", async () => {
    const result = await withTransaction(async () => "selesai");

    expect(result).toBe("selesai");
    expect(sqls()).toEqual(["BEGIN", "COMMIT"]);
  });

  it("memberikan koneksi transaksi kepada pekerjaan", async () => {
    let received: unknown = null;

    await withTransaction(async (client) => {
      received = client;
    });

    expect(received).toBe(mockClient);
  });

  it("menjalankan ROLLBACK dan meneruskan kesalahan aslinya", async () => {
    await expect(
      withTransaction(async () => {
        throw new Error("gagal menulis");
      }),
    ).rejects.toThrow("gagal menulis");

    expect(sqls()).toEqual(["BEGIN", "ROLLBACK"]);
  });

  it("selalu mengembalikan koneksi ke pool", async () => {
    await withTransaction(async () => null);
    await withTransaction(async () => {
      throw new Error("gagal");
    }).catch(() => undefined);

    expect(mockClient.release).toHaveBeenCalledTimes(2);
  });

  it("mengembalikan koneksi sehat tanpa menandainya rusak", async () => {
    await withTransaction(async () => null);

    expect(mockClient.release).toHaveBeenCalledWith(undefined);
  });

  it("membuang koneksi dari pool bila ROLLBACK ikut gagal", async () => {
    mockClient.query.mockImplementation(async (sql: unknown) => {
      if (sql === "ROLLBACK") throw new Error("koneksi putus");
      return { rows: [] };
    });

    await expect(
      withTransaction(async () => {
        throw new Error("gagal menulis");
      }),
    ).rejects.toThrow("gagal menulis");

    const [broken] = mockClient.release.mock.calls[0] as [unknown];

    expect(broken).toBeInstanceOf(Error);
    expect(mockLoggerError).toHaveBeenCalled();
  });

  it("tidak mengambil koneksi bila pool gagal menyambung", async () => {
    mockConnect.mockRejectedValue(new Error("timeout") as never);

    await expect(withTransaction(async () => null)).rejects.toThrow("timeout");
    expect(mockClient.release).not.toHaveBeenCalled();
  });
});
