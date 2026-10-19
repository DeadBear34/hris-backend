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

  it("mengurutkan per unit, kepala unit lebih dulu, jabatan lama di akhir", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await positionModel.findAll();

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain(
      "ORDER BY d.name ASC NULLS LAST, p.is_unit_head DESC, p.name ASC",
    );
  });

  // nama jabatan hanya unik per unit, jadi unit dan atasannya ikut dikirim
  it("menyertakan nama unit dan nama atasan jabatan", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await positionModel.findAll();

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("d.name AS department_name");
    expect(sql).toContain("s.name AS reports_to_position_name");
    expect(sql).toContain("LEFT JOIN departments d ON d.id = p.department_id");
    expect(sql).toContain(
      "LEFT JOIN positions s ON s.id = p.reports_to_position_id",
    );
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

  // Kode jabatan unik per unit, bukan global
  it("mencari kode di dalam satu unit", async () => {
    mockQuery.mockResolvedValue({ rows: [fakePosition] } as never);

    await positionModel.findByCode(
      "SWE",
      "99999999-9999-4999-8999-999999999999",
    );

    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain("code = $1");
    expect(sql).toContain("department_id IS NOT DISTINCT FROM $2::uuid");
    expect(values).toEqual([
      "SWE",
      "99999999-9999-4999-8999-999999999999",
      null,
    ]);
  });

  it("mengecualikan dirinya sendiri saat dipakai untuk perubahan", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await positionModel.findByCode(
      "SWE",
      "99999999-9999-4999-8999-999999999999",
      "11111111-1111-4111-8111-111111111111",
    );

    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain("id <> $3::uuid");
    expect(values[2]).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("mengembalikan null jika kode belum dipakai", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    const position = await positionModel.findByCode(
      "BARU",
      "99999999-9999-4999-8999-999999999999",
    );

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

    expect(values).toEqual([
      "SWE",
      "Software Engineer",
      3,
      null,
      null,
      null,
      null,
    ]);
  });

  it("menyimpan unit, atasan jabatan, kepala unit, dan kuota kursi", async () => {
    await positionModel.createPosition({
      code: "LEAD",
      name: "Tech Lead",
      department_id: "99999999-9999-4999-8999-999999999999",
      reports_to_position_id: "22222222-2222-4222-8222-222222222222",
      is_unit_head: true,
      max_holders: 1,
    });

    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain("$4::uuid, $5::uuid");
    expect(sql).toContain("COALESCE($6::boolean, false), $7::int");
    expect(values.slice(3)).toEqual([
      "99999999-9999-4999-8999-999999999999",
      "22222222-2222-4222-8222-222222222222",
      true,
      1,
    ]);
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
    ).rejects.toThrow("Failed to save position");
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
    expect(values).toEqual([5, POSITION_ID, null]);
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

    expect(values).toEqual([false, POSITION_ID, null]);
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

describe("findByName", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("membandingkan nama tanpa membedakan huruf besar-kecil dan spasi tepi", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await positionModel.findByName(
      " Engineering ",
      "99999999-9999-4999-8999-999999999999",
    );

    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain("lower(btrim(name)) = lower(btrim($1))");
    expect(sql).toContain("FROM positions");
    expect(sql).toContain("deleted_at IS NULL");
    // nama jabatan unik per unit
    expect(sql).toContain("department_id IS NOT DISTINCT FROM $2::uuid");
    expect(values).toEqual([
      " Engineering ",
      "99999999-9999-4999-8999-999999999999",
      null,
    ]);
  });

  it("mengecualikan dirinya sendiri saat dipakai untuk perubahan", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await positionModel.findByName(
      "Engineering",
      "99999999-9999-4999-8999-999999999999",
      "11111111-1111-4111-8111-111111111111",
    );

    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain("id <> $3::uuid");
    expect(values[2]).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("mengembalikan null bila tidak ada yang sama", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    expect(await positionModel.findByName("Baru")).toBeNull();
  });
});

// ---------------------------------------------------------------
// Hierarki jabatan
// ---------------------------------------------------------------
const UNIT_ID = "99999999-9999-4999-8999-999999999999";
const SUPERIOR_ID = "55555555-5555-4555-8555-555555555555";

function lastQuery(): [string, unknown[]] {
  return mockQuery.mock.calls.at(-1) as [string, unknown[]];
}

describe("isPositionInSubtree", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("menelusuri bawahan secara rekursif dari jabatan itu", async () => {
    mockQuery.mockResolvedValue({ rows: [{ found: true }] } as never);

    const found = await positionModel.isPositionInSubtree(
      POSITION_ID,
      SUPERIOR_ID,
    );

    const [sql, values] = lastQuery();

    expect(found).toBe(true);
    expect(sql).toContain("WITH RECURSIVE cabang");
    expect(sql).toContain("JOIN cabang c ON p.reports_to_position_id = c.id");
    expect(sql).toContain("c.kedalaman < $3::int");
    expect(values).toEqual([POSITION_ID, SUPERIOR_ID, 15]);
  });

  it("false bila calon atasan berada di luar cabangnya", async () => {
    mockQuery.mockResolvedValue({ rows: [{ found: false }] } as never);

    expect(
      await positionModel.isPositionInSubtree(POSITION_ID, SUPERIOR_ID),
    ).toBe(false);
  });
});

describe("depthOf", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("menghitung jumlah tingkat sampai puncak", async () => {
    mockQuery.mockResolvedValue({ rows: [{ depth: 3 }] } as never);

    expect(await positionModel.depthOf(POSITION_ID)).toBe(3);

    const [sql] = lastQuery();

    expect(sql).toContain("JOIN atasan a ON p.id = a.reports_to_position_id");
    expect(sql).toContain("COALESCE(MAX(kedalaman), 0)");
  });

  it("jabatan puncak bernilai 0", async () => {
    mockQuery.mockResolvedValue({ rows: [{ depth: 0 }] } as never);

    expect(await positionModel.depthOf(POSITION_ID)).toBe(0);
  });
});

describe("findRoots", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] } as never);
  });

  // jabatan lama tanpa unit belum masuk struktur, jadi bukan puncak
  it("hanya menghitung jabatan yang sudah punya unit", async () => {
    await positionModel.findRoots();

    const [sql, values] = lastQuery();

    expect(sql).toContain("reports_to_position_id IS NULL");
    expect(sql).toContain("department_id IS NOT NULL");
    expect(values).toEqual([null]);
  });

  it("mengecualikan jabatan yang sedang diubah", async () => {
    await positionModel.findRoots(POSITION_ID);

    expect(lastQuery()[1]).toEqual([POSITION_ID]);
  });
});

describe("findUnitHead", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] } as never);
  });

  it("mencari kepala unit yang belum dihapus", async () => {
    await positionModel.findUnitHead(UNIT_ID, POSITION_ID);

    const [sql, values] = lastQuery();

    expect(sql).toContain("department_id = $1::uuid AND is_unit_head");
    expect(sql).toContain("id <> $2::uuid");
    expect(values).toEqual([UNIT_ID, POSITION_ID]);
  });
});

describe("countDirectReports", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("menghitung jabatan yang melapor langsung", async () => {
    mockQuery.mockResolvedValue({ rows: [{ count: "2" }] } as never);

    expect(await positionModel.countDirectReports(POSITION_ID)).toBe(2);
    expect(lastQuery()[0]).toContain("reports_to_position_id = $1::uuid");
  });
});

describe("syncHolderDepartments", () => {
  it("memindahkan departemen pemegang jabatan ke unit barunya", async () => {
    const client = { query: jest.fn(() => Promise.resolve({ rowCount: 4 })) };

    const moved = await positionModel.syncHolderDepartments(
      client as never,
      POSITION_ID,
      UNIT_ID,
    );

    const [sql, values] = client.query.mock.calls[0] as unknown as [
      string,
      unknown[],
    ];

    expect(moved).toBe(4);
    expect(sql).toContain("SET department_id = $2::uuid");
    expect(sql).toContain("department_id IS DISTINCT FROM $2::uuid");
    expect(values).toEqual([POSITION_ID, UNIT_ID]);
  });
});

describe("updatePosition dengan struktur", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [fakePosition] } as never);
  });

  it("memakai cast untuk kolom hierarki", async () => {
    await positionModel.updatePosition(POSITION_ID, {
      department_id: UNIT_ID,
      reports_to_position_id: SUPERIOR_ID,
      is_unit_head: true,
      max_holders: 2,
    });

    const [sql] = lastQuery();

    expect(sql).toContain("department_id = $1::uuid");
    expect(sql).toContain("reports_to_position_id = $2::uuid");
    expect(sql).toContain("is_unit_head = $3::boolean");
    expect(sql).toContain("max_holders = $4::int");
  });

  it("menjalankan UPDATE lewat klien transaksi bila diberikan", async () => {
    const client = {
      query: jest.fn(() => Promise.resolve({ rows: [fakePosition] })),
    };

    await positionModel.updatePosition(
      POSITION_ID,
      { department_id: UNIT_ID },
      undefined,
      client as never,
    );

    expect(client.query).toHaveBeenCalledTimes(1);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
