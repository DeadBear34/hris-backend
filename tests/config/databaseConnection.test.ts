import { jest, describe, it, expect, beforeEach } from "@jest/globals";

const mockQuery = jest.fn();
const recordConfig = jest.fn();

class FakePool {
  query = mockQuery;
  end = jest.fn();

  constructor(config: unknown) {
    recordConfig(config);
  }
}

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
