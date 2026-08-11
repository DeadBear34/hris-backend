import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from "@jest/globals";

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

const mockEnd = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerError = jest.fn();

jest.unstable_mockModule("../../src/config/databaseConnection.js", () => ({
  pool: {
    connect: jest.fn(() => Promise.resolve(mockClient)),
    query: jest.fn(),
    end: mockEnd,
  },
}));

jest.unstable_mockModule("../../src/config/logger.js", () => ({
  logger: { info: mockLoggerInfo, error: mockLoggerError, warn: jest.fn() },
}));

const DEPARTMENT_ID = "33333333-3333-4333-8333-333333333333";
const POSITION_ID = "44444444-4444-4444-8444-444444444444";

interface Pengaturan {
  adaDepartemen: boolean;
  adaJabatan: boolean;
  emailSudahAda: boolean;
}

const pengaturan: Pengaturan = {
  adaDepartemen: true,
  adaJabatan: true,
  emailSudahAda: false,
};

let nomorKaryawan = 0;

function jawabQuery(sql: string) {
  if (sql.includes("FROM departments")) {
    return {
      rows: pengaturan.adaDepartemen ? [{ id: DEPARTMENT_ID, code: "PM" }] : [],
    };
  }

  if (sql.includes("FROM positions")) {
    return {
      rows: pengaturan.adaJabatan ? [{ id: POSITION_ID, code: "CHIEF" }] : [],
    };
  }

  if (sql.includes("SELECT id FROM users WHERE email")) {
    return { rows: pengaturan.emailSudahAda ? [{ id: "sudah-ada" }] : [] };
  }

  if (sql.includes("INSERT INTO users")) {
    nomorKaryawan += 1;
    return { rows: [{ id: `user-${nomorKaryawan}` }] };
  }

  if (sql.includes("INSERT INTO employees")) {
    return {
      rows: [
        {
          id: `employee-${nomorKaryawan}`,
          employee_number: String(nomorKaryawan).padStart(3, "0"),
        },
      ],
    };
  }

  return { rows: [] };
}

function panggilanSql(): string[] {
  return mockClient.query.mock.calls.map(([sql]) => sql as string);
}

// skrip memanggil seed() saat diimpor tanpa mengekspor promise-nya, jadi
// selesainya ditandai lewat penutupan pool di blok finally
async function tungguSelesai() {
  for (let i = 0; i < 300; i++) {
    if (mockEnd.mock.calls.length > 0) return;
    await new Promise((selesai) => setTimeout(selesai, 10));
  }

  throw new Error("seed tidak selesai tepat waktu");
}

async function jalankanSeed() {
  jest.resetModules();
  await import("../../src/scripts/seed.js");
  await tungguSelesai();
}

beforeEach(() => {
  jest.clearAllMocks();
  nomorKaryawan = 0;
  pengaturan.adaDepartemen = true;
  pengaturan.adaJabatan = true;
  pengaturan.emailSudahAda = false;
  mockClient.query.mockImplementation((sql) =>
    Promise.resolve(jawabQuery(sql as string)),
  );
});

afterEach(() => {
  // skrip menandai kegagalan lewat process.exitCode, jadi harus dibersihkan
  // agar tidak membuat proses jest ikut gagal
  process.exitCode = undefined;
});

describe("seed berhasil", () => {
  it("membungkus seluruh penyisipan dalam satu transaksi", async () => {
    await jalankanSeed();

    expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
    expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
    expect(mockClient.query).not.toHaveBeenCalledWith("ROLLBACK");
  });

  it("membuat akun beserta data karyawannya", async () => {
    await jalankanSeed();

    const sql = panggilanSql();

    expect(sql.some((s) => s.includes("INSERT INTO users"))).toBe(true);
    expect(sql.some((s) => s.includes("INSERT INTO employees"))).toBe(true);
  });

  it("menyimpan password dalam bentuk hash argon2", async () => {
    await jalankanSeed();

    const insertUser = mockClient.query.mock.calls.find(([sql]) =>
      (sql as string).includes("INSERT INTO users"),
    ) as [string, unknown[]];

    const [, values] = insertUser;

    expect(values[1]).not.toBe("Password123");
    expect(String(values[1])).toContain("$argon2id$");
  });

  it("memakai hash yang sama untuk seluruh akun contoh", async () => {
    await jalankanSeed();

    const passwords = mockClient.query.mock.calls
      .filter(([sql]) => (sql as string).includes("INSERT INTO users"))
      .map(([, values]) => (values as unknown[])[1]);

    expect(new Set(passwords).size).toBe(1);
  });

  it("membuat akun contoh yang langsung aktif dan wajib ganti password", async () => {
    await jalankanSeed();

    const insertUser = panggilanSql().find((s) =>
      s.includes("INSERT INTO users"),
    ) as string;

    expect(insertUser).toContain("approved_at");
    expect(insertUser).toContain("must_change_password");
  });

  it("menghubungkan karyawan ke manajernya setelah semua dibuat", async () => {
    await jalankanSeed();

    const updateManajer = panggilanSql().filter((s) =>
      s.includes("SET manager_id"),
    );

    expect(updateManajer.length).toBeGreaterThan(0);
  });

  it("mengembalikan koneksi dan menutup pool setelah selesai", async () => {
    await jalankanSeed();

    expect(mockClient.release).toHaveBeenCalled();
    expect(mockEnd).toHaveBeenCalled();
  });

  it("tidak menandai proses sebagai gagal", async () => {
    await jalankanSeed();

    expect(process.exitCode).toBeUndefined();
  });

  it("mencatat ringkasan hasil seed", async () => {
    await jalankanSeed();

    const pesan = mockLoggerInfo.mock.calls.map(([p]) => String(p));

    expect(pesan).toContain("Seed selesai");
  });
});

describe("seed dijalankan ulang", () => {
  it("melewati akun yang sudah ada tanpa membuat duplikat", async () => {
    pengaturan.emailSudahAda = true;

    await jalankanSeed();

    const sql = panggilanSql();

    expect(sql.some((s) => s.includes("INSERT INTO users"))).toBe(false);
    expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
  });

  it("mencatat akun yang dilewati", async () => {
    pengaturan.emailSudahAda = true;

    await jalankanSeed();

    const pesan = mockLoggerInfo.mock.calls.map(([p]) => String(p));

    expect(pesan.some((p) => p.includes("Dilewati"))).toBe(true);
  });
});

describe("seed gagal", () => {
  it("berhenti jika tabel departemen masih kosong", async () => {
    pengaturan.adaDepartemen = false;

    await jalankanSeed();

    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    expect(mockClient.query).not.toHaveBeenCalledWith("COMMIT");
  });

  it("berhenti jika tabel jabatan masih kosong", async () => {
    pengaturan.adaJabatan = false;

    await jalankanSeed();

    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("tidak menyisipkan data apa pun saat prasyarat belum terpenuhi", async () => {
    pengaturan.adaDepartemen = false;

    await jalankanSeed();

    const sql = panggilanSql();

    expect(sql.some((s) => s.includes("INSERT INTO"))).toBe(false);
  });

  it("menandai proses sebagai gagal", async () => {
    pengaturan.adaDepartemen = false;

    await jalankanSeed();

    expect(process.exitCode).toBe(1);
  });

  it("mencatat penyebab kegagalan", async () => {
    pengaturan.adaDepartemen = false;

    await jalankanSeed();

    expect(mockLoggerError).toHaveBeenCalled();
  });

  it("tetap mengembalikan koneksi dan menutup pool", async () => {
    pengaturan.adaDepartemen = false;

    await jalankanSeed();

    expect(mockClient.release).toHaveBeenCalled();
    expect(mockEnd).toHaveBeenCalled();
  });
});
