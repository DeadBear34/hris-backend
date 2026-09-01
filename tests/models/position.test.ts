import { jest, describe, it, expect, beforeEach } from "@jest/globals";

const mockQuery = jest.fn();

jest.unstable_mockModule("../../src/config/databaseConnection.js", () => ({
  pool: { query: mockQuery, connect: jest.fn() },
}));

const positionModel = await import("../../src/models/position.js");

const POSITION_ID = "44444444-4444-4444-8444-444444444444";

const fakePosition = {
  id: POSITION_ID,
  code: "SWE",
  name: "Software Engineer",
  level: 3,
  is_active: true,
  deleted_at: null,
  created_at: new Date(),
  updated_at: new Date(),
};

describe("findAll", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("mengembalikan seluruh jabatan", async () => {
    mockQuery.mockResolvedValue({ rows: [fakePosition] } as never);

    const rows = await positionModel.findAll();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.code).toBe("SWE");
  });

  it("mengembalikan daftar kosong jika belum ada data", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    const rows = await positionModel.findAll();

    expect(rows).toEqual([]);
  });

  it("mengabaikan jabatan yang sudah dihapus", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await positionModel.findAll();

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("deleted_at IS NULL");
  });

  it("mengurutkan dari level terendah lalu nama", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await positionModel.findAll();

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("ORDER BY level ASC, name ASC");
  });
});

describe("findById", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("mengembalikan jabatan jika ditemukan", async () => {
    mockQuery.mockResolvedValue({ rows: [fakePosition] } as never);

    const position = await positionModel.findById(POSITION_ID);

    expect(position?.id).toBe(POSITION_ID);
  });

  it("mengembalikan null jika tidak ditemukan", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    const position = await positionModel.findById(POSITION_ID);

    expect(position).toBeNull();
  });

  it("mengirim id sebagai parameter", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await positionModel.findById(POSITION_ID);

    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain("$1");
    expect(values).toEqual([POSITION_ID]);
  });
});

describe("findByCode", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("mencari berdasarkan kolom code", async () => {
    mockQuery.mockResolvedValue({ rows: [fakePosition] } as never);

    await positionModel.findByCode("SWE");

    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain("code = $1");
    expect(values).toEqual(["SWE"]);
  });

  it("mengembalikan null jika kode belum dipakai", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    const position = await positionModel.findByCode("BARU");

    expect(position).toBeNull();
  });
});

describe("createPosition", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [fakePosition] } as never);
  });

  it("menyimpan kode, nama, dan level", async () => {
    await positionModel.createPosition({
      code: "SWE",
      name: "Software Engineer",
      level: 3,
    });

    const [, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(values).toEqual(["SWE", "Software Engineer", 3]);
  });

  it("memakai level bawaan jika tidak dikirim", async () => {
    await positionModel.createPosition({
      code: "SWE",
      name: "Software Engineer",
    });

    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain("COALESCE($3::int, 1)");
    expect(values[2]).toBeNull();
  });

  it("mengembalikan jabatan yang baru dibuat", async () => {
    const position = await positionModel.createPosition({
      code: "SWE",
      name: "Software Engineer",
    });

    expect(position.id).toBe(POSITION_ID);
  });

  it("melempar error jika tidak ada baris yang tersimpan", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await expect(
      positionModel.createPosition({ code: "SWE", name: "Software Engineer" }),
    ).rejects.toThrow("Gagal menyimpan jabatan");
  });
});

describe("updatePosition", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [fakePosition] } as never);
  });

  it("hanya memperbarui kolom yang dikirim", async () => {
    await positionModel.updatePosition(POSITION_ID, { level: 5 });

    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain("level = $1");
    expect(sql).not.toContain("name =");
    expect(values).toEqual([5, POSITION_ID]);
  });

  it("mengabaikan kolom yang tidak boleh diubah", async () => {
    await positionModel.updatePosition(POSITION_ID, {
      name: "Senior Engineer",
      id: "lain",
      created_at: new Date(),
    } as never);

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).not.toContain("created_at");
  });

  it("dapat menonaktifkan jabatan", async () => {
    await positionModel.updatePosition(POSITION_ID, { is_active: false });

    const [, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(values).toEqual([false, POSITION_ID]);
  });

  it("selalu memperbarui kolom updated_at", async () => {
    await positionModel.updatePosition(POSITION_ID, { level: 5 });

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("updated_at = now()");
  });

  it("tidak menjalankan UPDATE jika tidak ada perubahan", async () => {
    await positionModel.updatePosition(POSITION_ID, {});

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).not.toContain("UPDATE");
    expect(sql).toContain("SELECT");
  });

  it("mengembalikan null jika jabatan tidak ditemukan", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    const position = await positionModel.updatePosition(POSITION_ID, {
      level: 5,
    });

    expect(position).toBeNull();
  });
});

describe("softDeletePosition", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [fakePosition] } as never);
  });

  it("menandai deleted_at tanpa menghapus baris", async () => {
    await positionModel.softDeletePosition(POSITION_ID);

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("deleted_at = now()");
    expect(sql).not.toContain("DELETE FROM");
  });

  it("sekaligus menonaktifkan jabatan", async () => {
    await positionModel.softDeletePosition(POSITION_ID);

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("is_active = false");
  });

  it("mengembalikan null jika sudah pernah dihapus", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    const position = await positionModel.softDeletePosition(POSITION_ID);

    expect(position).toBeNull();
  });
});

describe("countEmployees", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("menghitung karyawan yang memakai jabatan tersebut", async () => {
    mockQuery.mockResolvedValue({ rows: [{ count: "3" }] } as never);

    const count = await positionModel.countEmployees(POSITION_ID);

    expect(count).toBe(3);
  });

  it("mengembalikan nol jika hasil hitungan kosong", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    const count = await positionModel.countEmployees(POSITION_ID);

    expect(count).toBe(0);
  });

  it("menyaring berdasarkan position_id", async () => {
    mockQuery.mockResolvedValue({ rows: [{ count: "0" }] } as never);

    await positionModel.countEmployees(POSITION_ID);

    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain("position_id = $1::uuid");
    expect(values).toEqual([POSITION_ID]);
  });
});
