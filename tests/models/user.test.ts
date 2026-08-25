import { jest, describe, it, expect, beforeEach } from "@jest/globals";

const mockQuery = jest.fn();

jest.unstable_mockModule("../../src/config/databaseConnection.js", () => ({
  pool: { query: mockQuery, connect: jest.fn() },
}));

const userModel = await import("../../src/models/user.js");

const fakeUser = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "ismail@awan.io",
  role: "employee",
  is_active: false,
  terms_accepted_at: new Date(),
  approved_at: null,
  approved_by: null,
  last_login_at: null,
  must_change_password: false,
  deleted_at: null,
  created_at: new Date(),
  updated_at: new Date(),
};

const ADMIN_ID = "99999999-9999-9999-9999-999999999999";

// kolom password sebagai kata utuh, bukan bagian dari must_change_password
const KOLOM_PASSWORD = /(^|[\s,(])password([\s,)]|$)/;

describe("insertUser", () => {
  const fakeDb = { query: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("mengirim parameter dalam urutan yang benar", async () => {
    (fakeDb.query as jest.Mock).mockResolvedValue({
      rows: [fakeUser],
    } as never);

    const waktu = new Date();
    await userModel.insertUser(
      fakeDb as never,
      "ismail@awan.io",
      "hash-argon2",
      "employee",
      waktu,
    );

    const [, values] = (fakeDb.query as jest.Mock).mock.calls[0] as [
      string,
      unknown[],
    ];

    expect(values).toEqual([
      "ismail@awan.io",
      "hash-argon2",
      "employee",
      waktu,
    ]);
  });

  it("tidak mengembalikan kolom password", async () => {
    (fakeDb.query as jest.Mock).mockResolvedValue({
      rows: [fakeUser],
    } as never);

    await userModel.insertUser(
      fakeDb as never,
      "ismail@awan.io",
      "hash-argon2",
      "employee",
      new Date(),
    );

    const [sql] = (fakeDb.query as jest.Mock).mock.calls[0] as [string];
    const returning = sql.split("RETURNING")[1] ?? "";

    expect(returning).not.toMatch(KOLOM_PASSWORD);
  });

  it("memakai parameterized query, bukan interpolasi", async () => {
    (fakeDb.query as jest.Mock).mockResolvedValue({
      rows: [fakeUser],
    } as never);

    await userModel.insertUser(
      fakeDb as never,
      "ismail@awan.io",
      "hash-argon2",
      "employee",
      new Date(),
    );

    const [sql] = (fakeDb.query as jest.Mock).mock.calls[0] as [string];

    expect(sql).toContain("$1");
    expect(sql).not.toContain("ismail@awan.io");
  });

  it("melempar error jika tidak ada baris yang tersimpan", async () => {
    (fakeDb.query as jest.Mock).mockResolvedValue({ rows: [] } as never);

    await expect(
      userModel.insertUser(
        fakeDb as never,
        "ismail@awan.io",
        "hash",
        "employee",
        new Date(),
      ),
    ).rejects.toThrow("Gagal menyimpan user");
  });

  it("dapat dijalankan memakai client transaksi", async () => {
    const client = { query: jest.fn() };
    (client.query as jest.Mock).mockResolvedValue({
      rows: [fakeUser],
    } as never);

    await userModel.insertUser(
      client as never,
      "ismail@awan.io",
      "hash",
      "employee",
      new Date(),
    );

    expect(client.query).toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe("insertUserByAdmin", () => {
  const fakeDb = { query: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("membuat akun yang langsung terverifikasi, disetujui, dan aktif", async () => {
    (fakeDb.query as jest.Mock).mockResolvedValue({
      rows: [{ ...fakeUser, is_active: true, must_change_password: true }],
    } as never);

    await userModel.insertUserByAdmin(
      fakeDb as never,
      "baru@awan.io",
      "hash",
      "employee",
      ADMIN_ID,
    );

    const [sql] = (fakeDb.query as jest.Mock).mock.calls[0] as [string];

    // Hanya daftar kolom yang diisi yang diperiksa, karena klausa RETURNING
    // memuat seluruh nama kolom sehingga pemeriksaan atas keseluruhan teks
    // dapat lolos tanpa kolomnya benar-benar ditulis.
    const kolomDiisi = sql.slice(
      sql.indexOf("(", sql.indexOf("INSERT INTO users")),
      sql.indexOf("VALUES"),
    );

    for (const kolom of [
      "email_verified_at",
      "approved_at",
      "is_active",
      "must_change_password",
    ]) {
      expect(kolomDiisi).toContain(kolom);
    }
  });

  it("akun buatan admin lolos ketiga syarat login tanpa verifikasi email", async () => {
    (fakeDb.query as jest.Mock).mockResolvedValue({
      rows: [fakeUser],
    } as never);

    await userModel.insertUserByAdmin(
      fakeDb as never,
      "baru@awan.io",
      "hash",
      "employee",
      ADMIN_ID,
    );

    const [sql] = (fakeDb.query as jest.Mock).mock.calls[0] as [string];
    const nilai = sql.slice(sql.indexOf("VALUES"), sql.indexOf("RETURNING"));

    // email_verified_at dan approved_at diisi now(), is_active diisi true
    expect(nilai.match(/now\(\)/g)?.length).toBeGreaterThanOrEqual(4);
    expect(nilai).toContain("true");
  });

  it("mencatat siapa yang membuat akun", async () => {
    (fakeDb.query as jest.Mock).mockResolvedValue({
      rows: [fakeUser],
    } as never);

    await userModel.insertUserByAdmin(
      fakeDb as never,
      "baru@awan.io",
      "hash",
      "hr",
      ADMIN_ID,
    );

    const [, values] = (fakeDb.query as jest.Mock).mock.calls[0] as [
      string,
      unknown[],
    ];

    expect(values).toEqual(["baru@awan.io", "hash", "hr", ADMIN_ID]);
  });

  it("melempar error jika gagal menyimpan", async () => {
    (fakeDb.query as jest.Mock).mockResolvedValue({ rows: [] } as never);

    await expect(
      userModel.insertUserByAdmin(
        fakeDb as never,
        "baru@awan.io",
        "hash",
        "employee",
        ADMIN_ID,
      ),
    ).rejects.toThrow("Gagal menyimpan akun");
  });
});

describe("findByEmail", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("mengembalikan user jika ditemukan", async () => {
    mockQuery.mockResolvedValue({
      rows: [{ ...fakeUser, password: "hash" }],
    } as never);

    const user = await userModel.findByEmail("ismail@awan.io");

    expect(user?.email).toBe("ismail@awan.io");
  });

  it("mengembalikan null jika tidak ditemukan", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    const user = await userModel.findByEmail("tidakada@awan.io");

    expect(user).toBeNull();
  });

  it("mengirim email sebagai parameter, bukan disisipkan ke SQL", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await userModel.findByEmail("ismail@awan.io");

    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain("$1");
    expect(values).toEqual(["ismail@awan.io"]);
  });

  it("mengambil kolom password untuk keperluan verifikasi login", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await userModel.findByEmail("ismail@awan.io");

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("SELECT *");
  });

  it("mengabaikan user yang sudah dihapus", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await userModel.findByEmail("ismail@awan.io");

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("deleted_at IS NULL");
  });
});

describe("findById", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("mengembalikan user jika ditemukan", async () => {
    mockQuery.mockResolvedValue({ rows: [fakeUser] } as never);

    const user = await userModel.findById(fakeUser.id);

    expect(user?.id).toBe(fakeUser.id);
  });

  it("mengembalikan null jika tidak ditemukan", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    const user = await userModel.findById("id-tidak-ada");

    expect(user).toBeNull();
  });

  it("tidak mengambil kolom password", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await userModel.findById(fakeUser.id);

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).not.toMatch(KOLOM_PASSWORD);
  });

  it("mengabaikan user yang sudah dihapus", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await userModel.findById(fakeUser.id);

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("deleted_at IS NULL");
  });
});

describe("updateLastLogin", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("memperbarui kolom last_login_at untuk id yang diberikan", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await userModel.updateLastLogin(fakeUser.id);

    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain("last_login_at");
    expect(values).toEqual([fakeUser.id]);
  });
});

describe("updatePassword", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("menyimpan password baru beserta id", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await userModel.updatePassword(fakeUser.id, "hash-baru");

    const [, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(values).toEqual([fakeUser.id, "hash-baru"]);
  });

  it("mematikan penanda must_change_password", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await userModel.updatePassword(fakeUser.id, "hash-baru");

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("must_change_password = false");
  });

  it("mencatat waktu perubahan password untuk membatalkan sesi lama", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await userModel.updatePassword(fakeUser.id, "hash-baru");

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("password_changed_at = now()");
  });
});

describe("setEmailVerified", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({
      rows: [{ ...fakeUser, email_verified_at: new Date() }],
    } as never);
  });

  it("mengisi kolom email_verified_at", async () => {
    await userModel.setEmailVerified(fakeUser.id);

    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain("email_verified_at = now()");
    expect(values).toEqual([fakeUser.id]);
  });

  it("tidak menandai ulang email yang sudah terverifikasi", async () => {
    await userModel.setEmailVerified(fakeUser.id);

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("email_verified_at IS NULL");
  });

  it("tidak mengembalikan kolom password", async () => {
    await userModel.setEmailVerified(fakeUser.id);

    const [sql] = mockQuery.mock.calls[0] as [string];
    const returning = sql.split("RETURNING")[1] ?? "";

    expect(returning).not.toMatch(KOLOM_PASSWORD);
  });

  it("mengembalikan null jika user tidak ditemukan", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    const user = await userModel.setEmailVerified(fakeUser.id);

    expect(user).toBeNull();
  });
});

describe("findSessionInfo", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("hanya mengambil kolom yang dibutuhkan pemeriksaan sesi", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await userModel.findSessionInfo(fakeUser.id);

    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain("SELECT id, password_changed_at");
    expect(sql).not.toMatch(KOLOM_PASSWORD);
    expect(values).toEqual([fakeUser.id]);
  });

  it("mengabaikan user yang sudah dihapus", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await userModel.findSessionInfo(fakeUser.id);

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("deleted_at IS NULL");
  });

  it("mengembalikan null jika user tidak ada", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    const sesi = await userModel.findSessionInfo(fakeUser.id);

    expect(sesi).toBeNull();
  });

  it("mengembalikan waktu perubahan password terakhir", async () => {
    const waktu = new Date();
    mockQuery.mockResolvedValue({
      rows: [{ id: fakeUser.id, password_changed_at: waktu }],
    } as never);

    const sesi = await userModel.findSessionInfo(fakeUser.id);

    expect(sesi?.password_changed_at).toBe(waktu);
  });
});

describe("findPending", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] } as never);
  });

  it("hanya menampilkan akun yang emailnya sudah terverifikasi", async () => {
    await userModel.findPending();

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("u.email_verified_at IS NOT NULL");
  });

  it("hanya menampilkan akun yang belum disetujui", async () => {
    await userModel.findPending();

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("u.approved_at IS NULL");
  });

  it("mengabaikan akun yang sudah dihapus", async () => {
    await userModel.findPending();

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("u.deleted_at IS NULL");
  });

  it("tidak mengambil kolom password", async () => {
    await userModel.findPending();

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).not.toMatch(KOLOM_PASSWORD);
  });

  it("mengurutkan dari pendaftar paling lama", async () => {
    await userModel.findPending();

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("ORDER BY u.created_at ASC");
  });
});

describe("approveUser", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("mengaktifkan akun dan mencatat penyetujunya", async () => {
    mockQuery.mockResolvedValue({
      rows: [{ ...fakeUser, is_active: true }],
    } as never);

    await userModel.approveUser(fakeUser.id, ADMIN_ID);

    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain("is_active = true");
    expect(sql).toContain("approved_at = now()");
    expect(values).toEqual([fakeUser.id, ADMIN_ID]);
  });

  it("mengembalikan null jika user tidak ditemukan", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    const user = await userModel.approveUser("id-tidak-ada", ADMIN_ID);

    expect(user).toBeNull();
  });
});

describe("setUserActive", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("mengirim nilai is_active sebagai parameter", async () => {
    mockQuery.mockResolvedValue({ rows: [fakeUser] } as never);

    await userModel.setUserActive(fakeUser.id, false);

    const [, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(values).toEqual([fakeUser.id, false]);
  });
});

describe("softDeleteUser", () => {
  const fakeDb = { query: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("menandai deleted_at tanpa menghapus baris", async () => {
    (fakeDb.query as jest.Mock).mockResolvedValue({ rows: [] } as never);

    await userModel.softDeleteUser(fakeDb as never, fakeUser.id);

    const [sql] = (fakeDb.query as jest.Mock).mock.calls[0] as [string];

    expect(sql).toContain("deleted_at = now()");
    expect(sql).not.toContain("DELETE FROM");
  });

  it("sekaligus menonaktifkan akun", async () => {
    (fakeDb.query as jest.Mock).mockResolvedValue({ rows: [] } as never);

    await userModel.softDeleteUser(fakeDb as never, fakeUser.id);

    const [sql] = (fakeDb.query as jest.Mock).mock.calls[0] as [string];

    expect(sql).toContain("is_active = false");
  });
});
