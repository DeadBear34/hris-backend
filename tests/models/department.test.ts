import { jest, describe, it, expect, beforeEach } from "@jest/globals";

const mockQuery = jest.fn();

jest.unstable_mockModule("../../src/config/databaseConnection.js", () => ({
  pool: { query: mockQuery, connect: jest.fn() },
}));

const departmentModel = await import("../../src/models/department.js");

const DEPARTMENT_ID = "33333333-3333-4333-8333-333333333333";

const fakeDepartment = {
  id: DEPARTMENT_ID,
  code: "IT",
  name: "Teknologi Informasi",
  is_active: true,
  deleted_at: null,
  created_at: new Date(),
  updated_at: new Date(),
};

describe("findAll", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("mengembalikan seluruh departemen", async () => {
    mockQuery.mockResolvedValue({ rows: [fakeDepartment] } as never);

    const rows = await departmentModel.findAll();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.code).toBe("IT");
  });

  it("mengembalikan daftar kosong jika belum ada data", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    const rows = await departmentModel.findAll();

    expect(rows).toEqual([]);
  });

  it("mengabaikan departemen yang sudah dihapus", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await departmentModel.findAll();

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("deleted_at IS NULL");
  });

  it("mengurutkan berdasarkan nama", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await departmentModel.findAll();

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("ORDER BY name ASC");
  });
});

describe("findById", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("mengembalikan departemen jika ditemukan", async () => {
    mockQuery.mockResolvedValue({ rows: [fakeDepartment] } as never);

    const department = await departmentModel.findById(DEPARTMENT_ID);

    expect(department?.id).toBe(DEPARTMENT_ID);
  });

  it("mengembalikan null jika tidak ditemukan", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    const department = await departmentModel.findById(DEPARTMENT_ID);

    expect(department).toBeNull();
  });

  it("mengirim id sebagai parameter", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await departmentModel.findById(DEPARTMENT_ID);

    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain("$1");
    expect(values).toEqual([DEPARTMENT_ID]);
  });
});

describe("findByCode", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("mencari berdasarkan kolom code", async () => {
    mockQuery.mockResolvedValue({ rows: [fakeDepartment] } as never);

    await departmentModel.findByCode("IT");

    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain("code = $1");
    expect(values).toEqual(["IT"]);
  });

  it("mengembalikan null jika kode belum dipakai", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    const department = await departmentModel.findByCode("BARU");

    expect(department).toBeNull();
  });

  it("tidak menganggap kode milik departemen terhapus sebagai duplikat", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await departmentModel.findByCode("IT");

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("deleted_at IS NULL");
  });
});

describe("createDepartment", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("menyimpan kode dan nama", async () => {
    mockQuery.mockResolvedValue({ rows: [fakeDepartment] } as never);

    await departmentModel.createDepartment({
      code: "IT",
      name: "Teknologi Informasi",
    });

    const [, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(values).toEqual(["IT", "Teknologi Informasi"]);
  });

  it("mengembalikan departemen yang baru dibuat", async () => {
    mockQuery.mockResolvedValue({ rows: [fakeDepartment] } as never);

    const department = await departmentModel.createDepartment({
      code: "IT",
      name: "Teknologi Informasi",
    });

    expect(department.id).toBe(DEPARTMENT_ID);
  });

  it("melempar error jika tidak ada baris yang tersimpan", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await expect(
      departmentModel.createDepartment({ code: "IT", name: "Teknologi" }),
    ).rejects.toThrow("Gagal menyimpan departemen");
  });
});

describe("updateDepartment", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [fakeDepartment] } as never);
  });

  it("hanya memperbarui kolom yang dikirim", async () => {
    await departmentModel.updateDepartment(DEPARTMENT_ID, { name: "Keuangan" });

    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain("name = $1");
    expect(sql).not.toContain("code =");
    expect(values).toEqual(["Keuangan", DEPARTMENT_ID]);
  });

  it("mengabaikan kolom yang tidak boleh diubah", async () => {
    await departmentModel.updateDepartment(DEPARTMENT_ID, {
      name: "Keuangan",
      id: "lain",
      created_at: new Date(),
    } as never);

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).not.toContain("created_at");
  });

  it("dapat menonaktifkan departemen", async () => {
    await departmentModel.updateDepartment(DEPARTMENT_ID, { is_active: false });

    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain("is_active = $1");
    expect(values).toEqual([false, DEPARTMENT_ID]);
  });

  it("selalu memperbarui kolom updated_at", async () => {
    await departmentModel.updateDepartment(DEPARTMENT_ID, { name: "Keuangan" });

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("updated_at = now()");
  });

  it("tidak menjalankan UPDATE jika tidak ada perubahan", async () => {
    await departmentModel.updateDepartment(DEPARTMENT_ID, {});

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).not.toContain("UPDATE");
    expect(sql).toContain("SELECT");
  });

  it("mengembalikan null jika departemen tidak ditemukan", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    const department = await departmentModel.updateDepartment(DEPARTMENT_ID, {
      name: "Keuangan",
    });

    expect(department).toBeNull();
  });
});

describe("softDeleteDepartment", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [fakeDepartment] } as never);
  });

  it("menandai deleted_at tanpa menghapus baris", async () => {
    await departmentModel.softDeleteDepartment(DEPARTMENT_ID);

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("deleted_at = now()");
    expect(sql).not.toContain("DELETE FROM");
  });

  it("sekaligus menonaktifkan departemen", async () => {
    await departmentModel.softDeleteDepartment(DEPARTMENT_ID);

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("is_active = false");
  });

  it("mengembalikan null jika sudah pernah dihapus", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    const department =
      await departmentModel.softDeleteDepartment(DEPARTMENT_ID);

    expect(department).toBeNull();
  });
});

describe("countEmployees", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("menghitung karyawan pada departemen tersebut", async () => {
    mockQuery.mockResolvedValue({ rows: [{ count: "7" }] } as never);

    const count = await departmentModel.countEmployees(DEPARTMENT_ID);

    expect(count).toBe(7);
    expect(typeof count).toBe("number");
  });

  it("mengembalikan nol jika hasil hitungan kosong", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    const count = await departmentModel.countEmployees(DEPARTMENT_ID);

    expect(count).toBe(0);
  });

  it("tidak menghitung karyawan yang sudah dihapus", async () => {
    mockQuery.mockResolvedValue({ rows: [{ count: "0" }] } as never);

    await departmentModel.countEmployees(DEPARTMENT_ID);

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("deleted_at IS NULL");
  });
});
