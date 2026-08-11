import { jest, describe, it, expect, beforeEach } from "@jest/globals";

const mockQuery = jest.fn();

jest.unstable_mockModule("../../src/config/databaseConnection.js", () => ({
  pool: { query: mockQuery, connect: jest.fn() },
}));

const tokenModel = await import("../../src/models/verificationToken.js");

const TOKEN_ID = "99999999-9999-4999-8999-999999999999";
const EMAIL = "ismail@awan.io";

const fakeToken = {
  id: TOKEN_ID,
  email: EMAIL,
  purpose: "email_verification",
  token_hash: "$argon2id$hash",
  expires_at: new Date(Date.now() + 600_000),
  consumed_at: null,
  attempts: 0,
  ip_address: "127.0.0.1",
  user_agent: "jest",
  created_at: new Date(),
};

describe("createToken", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [fakeToken] } as never);
  });

  it("mengirim seluruh kolom dalam urutan yang benar", async () => {
    const expires_at = new Date(Date.now() + 600_000);

    await tokenModel.createToken({
      email: EMAIL,
      purpose: "email_verification",
      token_hash: "$argon2id$hash",
      expires_at,
      ip_address: "127.0.0.1",
      user_agent: "jest",
    });

    const [, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(values).toEqual([
      EMAIL,
      "email_verification",
      "$argon2id$hash",
      expires_at,
      "127.0.0.1",
      "jest",
    ]);
  });

  it("memakai cast tipe untuk enum purpose dan waktu kedaluwarsa", async () => {
    await tokenModel.createToken({
      email: EMAIL,
      purpose: "password_reset",
      token_hash: "hash",
      expires_at: new Date(),
    });

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("::token_purpose");
    expect(sql).toContain("::timestamptz");
  });

  it("menyimpan null jika alamat ip dan user agent tidak diketahui", async () => {
    await tokenModel.createToken({
      email: EMAIL,
      purpose: "email_verification",
      token_hash: "hash",
      expires_at: new Date(),
    });

    const [, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(values[4]).toBeNull();
    expect(values[5]).toBeNull();
  });

  it("memakai parameterized query, bukan interpolasi", async () => {
    await tokenModel.createToken({
      email: EMAIL,
      purpose: "email_verification",
      token_hash: "hash",
      expires_at: new Date(),
    });

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("$1");
    expect(sql).not.toContain(EMAIL);
  });

  it("melempar error jika tidak ada baris yang tersimpan", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await expect(
      tokenModel.createToken({
        email: EMAIL,
        purpose: "email_verification",
        token_hash: "hash",
        expires_at: new Date(),
      }),
    ).rejects.toThrow("Gagal menyimpan token verifikasi");
  });
});

describe("findLatest", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("mengambil satu token terbaru untuk email dan purpose", async () => {
    mockQuery.mockResolvedValue({ rows: [fakeToken] } as never);

    await tokenModel.findLatest(EMAIL, "email_verification");

    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain("ORDER BY created_at DESC");
    expect(sql).toContain("LIMIT 1");
    expect(values).toEqual([EMAIL, "email_verification"]);
  });

  it("tidak menyaring token yang sudah terpakai agar penyebabnya bisa dibedakan", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await tokenModel.findLatest(EMAIL, "email_verification");

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).not.toContain("consumed_at IS NULL");
  });

  it("mengembalikan null jika belum pernah ada token", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    const token = await tokenModel.findLatest(EMAIL, "password_reset");

    expect(token).toBeNull();
  });
});

describe("findLatestActive", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] } as never);
  });

  it("hanya mengambil token yang belum terpakai dan belum kedaluwarsa", async () => {
    await tokenModel.findLatestActive(EMAIL, "email_verification");

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("consumed_at IS NULL");
    expect(sql).toContain("expires_at > now()");
  });

  it("mengembalikan null jika tidak ada token aktif", async () => {
    const token = await tokenModel.findLatestActive(EMAIL, "password_reset");

    expect(token).toBeNull();
  });
});

describe("incrementAttempts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({
      rows: [{ ...fakeToken, attempts: 1 }],
    } as never);
  });

  it("menaikkan penghitung berdasarkan nilai di database", async () => {
    await tokenModel.incrementAttempts(TOKEN_ID);

    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain("attempts = attempts + 1");
    expect(sql).toContain("$1::uuid");
    expect(values).toEqual([TOKEN_ID]);
  });

  it("mengembalikan token dengan penghitung terbaru", async () => {
    const token = await tokenModel.incrementAttempts(TOKEN_ID);

    expect(token?.attempts).toBe(1);
  });

  it("mengembalikan null jika token tidak ditemukan", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    const token = await tokenModel.incrementAttempts(TOKEN_ID);

    expect(token).toBeNull();
  });
});

describe("markConsumed", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({
      rows: [{ ...fakeToken, consumed_at: new Date() }],
    } as never);
  });

  it("mengisi consumed_at", async () => {
    await tokenModel.markConsumed(TOKEN_ID);

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("consumed_at = now()");
  });

  it("tidak menandai ulang token yang sudah terpakai", async () => {
    await tokenModel.markConsumed(TOKEN_ID);

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("consumed_at IS NULL");
  });

  it("mengembalikan null jika token sudah pernah dipakai", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    const token = await tokenModel.markConsumed(TOKEN_ID);

    expect(token).toBeNull();
  });
});

describe("invalidateActive", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("mematikan seluruh token aktif untuk email dan purpose", async () => {
    mockQuery.mockResolvedValue({ rowCount: 2 } as never);

    await tokenModel.invalidateActive(EMAIL, "password_reset");

    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain("consumed_at = now()");
    expect(sql).toContain("consumed_at IS NULL");
    expect(values).toEqual([EMAIL, "password_reset"]);
  });

  it("mengembalikan jumlah token yang dibatalkan", async () => {
    mockQuery.mockResolvedValue({ rowCount: 2 } as never);

    const jumlah = await tokenModel.invalidateActive(
      EMAIL,
      "email_verification",
    );

    expect(jumlah).toBe(2);
  });

  it("mengembalikan nol jika tidak ada yang dibatalkan", async () => {
    mockQuery.mockResolvedValue({ rowCount: null } as never);

    const jumlah = await tokenModel.invalidateActive(
      EMAIL,
      "email_verification",
    );

    expect(jumlah).toBe(0);
  });

  it("tidak menyentuh purpose lain", async () => {
    mockQuery.mockResolvedValue({ rowCount: 0 } as never);

    await tokenModel.invalidateActive(EMAIL, "password_reset");

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("purpose = $2::token_purpose");
  });
});
