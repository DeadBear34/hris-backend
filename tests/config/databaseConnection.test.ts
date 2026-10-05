import { jest, describe, it, expect, beforeEach } from "@jest/globals";

const mockQuery = jest.fn();
const recordConfig = jest.fn();

const poolListeners = new Map<string, (err: Error) => void>();

class FakePool {
  query = mockQuery;
  end = jest.fn();

  constructor(config: unknown) {
    recordConfig(config);
  }

  on(event: string, listener: (err: Error) => void) {
    poolListeners.set(event, listener);
    return this;
  }
}

const mockWarn = jest.fn();

jest.unstable_mockModule("../../src/config/logger.js", () => ({
  logger: { debug: jest.fn(), warn: mockWarn, info: jest.fn(), error: jest.fn() },
}));

const recordTypeParser = jest.fn();

// Pendaftaran parser terjadi sekali saat modul dimuat, jadi panggilannya
// direkam di sini sebelum beforeEach mana pun sempat membersihkan mock
const typeParserCalls: unknown[][] = [];

jest.unstable_mockModule("pg", () => ({
  default: {
    Pool: FakePool,
    types: {
      setTypeParser: (...args: unknown[]) => {
        typeParserCalls.push(args);
        recordTypeParser(...args);
      },
    },
  },
}));

const { pool, testConnection } =
  await import("../../src/config/databaseConnection.js");
const { env } = await import("../../src/config/env.js");

describe("pool", () => {
  it("dibuat memakai DATABASE_URL dari environment", () => {
    const [config] = recordConfig.mock.calls[0] as [
      { connectionString: string },
    ];

    expect(config.connectionString).toBe(env.DATABASE_URL);
  });

  it("hanya membuat satu pool untuk seluruh aplikasi", () => {
    expect(recordConfig).toHaveBeenCalledTimes(1);
    expect(pool).toBeDefined();
  });

  it("membatasi lama menunggu koneksi dan menjaga koneksi tetap hidup", () => {
    const [config] = recordConfig.mock.calls[0] as [
      { connectionTimeoutMillis: number; keepAlive: boolean },
    ];

    expect(config.connectionTimeoutMillis).toBeGreaterThan(0);
    expect(config.keepAlive).toBe(true);
  });

  // Tanpa pendengar, error dari koneksi yang diam membuat proses mati
  it("memasang pendengar error supaya koneksi yang putus tidak mematikan proses", () => {
    const listener = poolListeners.get("error");

    expect(listener).toBeDefined();
    expect(() => listener!(new Error("ECONNRESET"))).not.toThrow();
    expect(mockWarn).toHaveBeenCalled();
  });
});

describe("testConnection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("menjalankan query sederhana ke database", async () => {
    mockQuery.mockResolvedValue({ rows: [{ now: new Date() }] } as never);

    await testConnection();

    expect(mockQuery).toHaveBeenCalledWith("SELECT NOW()");
  });

  it("mengembalikan baris pertama hasil query", async () => {
    const at = new Date();
    mockQuery.mockResolvedValue({ rows: [{ now: at }] } as never);

    const result = await testConnection();

    expect(result).toEqual({ now: at });
  });

  it("meneruskan error jika database tidak dapat dihubungi", async () => {
    mockQuery.mockRejectedValue(new Error("connection refused") as never);

    await expect(testConnection()).rejects.toThrow("connection refused");
  });
});

describe("penanganan kolom bertipe date", () => {
  it("mendaftarkan parser agar tanggal dikembalikan apa adanya", () => {
    expect(typeParserCalls).toHaveLength(1);

    const [oid, parser] = typeParserCalls[0] as [
      number,
      (value: string) => string,
    ];

    // 1082 adalah OID tipe date pada PostgreSQL
    expect(oid).toBe(1082);
    expect(parser("1995-03-15")).toBe("1995-03-15");
  });
});
