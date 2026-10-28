import { jest, describe, it, expect, beforeEach } from "@jest/globals";

const mockQuery = jest.fn();

jest.unstable_mockModule("../../src/config/databaseConnection.js", () => ({
  pool: { query: mockQuery, connect: jest.fn() },
}));

const orgStructure = await import("../../src/models/orgStructure.js");
const { MAX_TREE_DEPTH } = await import("../../src/helpers/orgConstants.js");

const EMPLOYEE_ID = "11111111-1111-4111-8111-111111111111";
const MANAGER_ID = "22222222-2222-4222-8222-222222222222";
const POSITION_ID = "33333333-3333-4333-8333-333333333333";

function manager(source: "override" | "structure", levels_up = 1) {
  return {
    employee_id: MANAGER_ID,
    full_name: "Tammam Manager Engineering",
    user_id: "44444444-4444-4444-8444-444444444444",
    position_id: POSITION_ID,
    position_name: "Head of Engineering",
    source,
    levels_up,
  };
}

function sqlOf(call: number): string {
  return (mockQuery.mock.calls[call] as [string])[0];
}

function paramsOf(call: number): unknown[] {
  return (mockQuery.mock.calls[call] as [string, unknown[]])[1];
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("findLineManager", () => {
  it("memakai pengecualian manual (manager_id) bila diisi dan atasannya aktif", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [manager("override")] } as never);

    const result = await orgStructure.findLineManager(EMPLOYEE_ID);

    expect(result).toEqual(manager("override"));
    // struktur jabatan tidak perlu ditelusuri lagi
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(sqlOf(0)).toContain("JOIN employees e ON e.id = bawahan.manager_id");
    expect(paramsOf(0)).toEqual([EMPLOYEE_ID]);
  });

  it("menelusuri struktur jabatan bila tidak ada pengecualian manual", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [manager("structure", 2)] } as never);

    const result = await orgStructure.findLineManager(EMPLOYEE_ID);

    expect(result?.source).toBe("structure");
    expect(result?.levels_up).toBe(2);
    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(paramsOf(1)).toEqual([EMPLOYEE_ID, EMPLOYEE_ID, MAX_TREE_DEPTH]);
  });

  it("null bila sampai puncak tidak ada atasan aktif", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    expect(await orgStructure.findLineManager(EMPLOYEE_ID)).toBeNull();
  });

  it("memakai klien transaksi bila diberikan", async () => {
    const client = {
      query: jest.fn(() => Promise.resolve({ rows: [] })),
    };

    await orgStructure.findLineManager(EMPLOYEE_ID, client as never);

    expect(client.query).toHaveBeenCalledTimes(2);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  describe("query struktur jabatan", () => {
    beforeEach(async () => {
      mockQuery.mockResolvedValue({ rows: [] } as never);
      await orgStructure.findLineManager(EMPLOYEE_ID);
    });

    it("naik secara rekursif lewat reports_to_position_id", () => {
      const sql = sqlOf(1);

      expect(sql).toContain("WITH RECURSIVE rantai");
      expect(sql).toContain("JOIN rantai r ON p.id = r.reports_to_position_id");
    });

    it("dibatasi kedalamannya supaya data melingkar tidak berputar tanpa henti", () => {
      expect(sqlOf(1)).toContain("r.tingkat < $3::int");
    });

    // tingkat 0 adalah jabatan karyawan itu sendiri: rekan sejabatan bukan atasan
    it("tidak menganggap rekan sejabatan sebagai atasan", () => {
      expect(sqlOf(1)).toContain("r.tingkat > 0");
    });

    it("tidak pernah memilih karyawan itu sendiri", () => {
      expect(sqlOf(1)).toContain("($2::uuid IS NULL OR e.id <> $2::uuid)");
    });

    it("melewati jabatan kosong dengan memilih tingkat terdekat yang terisi", () => {
      expect(sqlOf(1)).toMatch(/ORDER BY r\.tingkat ASC/);
      expect(sqlOf(1)).toContain("LIMIT 1");
    });

    it("memilih pemegang yang paling lama menjabat bila jabatan diisi beberapa orang", () => {
      expect(sqlOf(1)).toContain("e.join_date ASC, e.created_at ASC");
    });

    it("hanya memilih atasan aktif yang akunnya bisa login", () => {
      for (const call of [0, 1]) {
        const sql = sqlOf(call);

        expect(sql).toContain("e.deleted_at IS NULL AND e.is_active = true");
        expect(sql).toContain("e.employment_status <> 'resigned'");
        expect(sql).toContain("u.is_active = true AND u.deleted_at IS NULL");
      }
    });

    it("mengabaikan jabatan yang sudah dihapus", () => {
      expect(sqlOf(1)).toContain("p.deleted_at IS NULL");
    });
  });
});

describe("countHolders", () => {
  it("menghitung pemegang aktif sebuah jabatan", async () => {
    mockQuery.mockResolvedValue({ rows: [{ count: "3" }] } as never);

    expect(await orgStructure.countHolders(POSITION_ID)).toBe(3);
    expect(sqlOf(0)).toContain("position_id = $1::uuid AND deleted_at IS NULL");
    expect(paramsOf(0)).toEqual([POSITION_ID, null]);
  });

  it("bisa mengecualikan satu karyawan saat ia sedang dipindahkan", async () => {
    mockQuery.mockResolvedValue({ rows: [{ count: "0" }] } as never);

    await orgStructure.countHolders(POSITION_ID, EMPLOYEE_ID);

    expect(sqlOf(0)).toContain("id <> $2::uuid");
    expect(paramsOf(0)).toEqual([POSITION_ID, EMPLOYEE_ID]);
  });
});

describe("loadOrgChart", () => {
  it("mengambil unit, jabatan, dan pemegang yang belum dihapus", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: "u1" }] } as never)
      .mockResolvedValueOnce({ rows: [{ id: "p1" }] } as never)
      .mockResolvedValueOnce({ rows: [{ id: "e1" }] } as never);

    const chart = await orgStructure.loadOrgChart();

    expect(chart).toEqual({
      units: [{ id: "u1" }],
      positions: [{ id: "p1" }],
      holders: [{ id: "e1" }],
    });
    expect(sqlOf(0)).toContain("FROM departments WHERE deleted_at IS NULL");
    expect(sqlOf(1)).toContain("FROM positions WHERE deleted_at IS NULL");
    expect(sqlOf(2)).toContain("position_id IS NOT NULL");
  });
});

describe("findLineManagerForPosition", () => {
  it("berangkat dari jabatan, bukan dari karyawan", async () => {
    mockQuery.mockResolvedValue({ rows: [manager("structure")] } as never);

    const result = await orgStructure.findLineManagerForPosition(POSITION_ID);

    expect(result?.full_name).toBe("Tammam Manager Engineering");
    expect(sqlOf(0)).toContain("WHERE p.id = $1::uuid");
    expect(sqlOf(0)).toContain("r.tingkat > 0");
    expect(paramsOf(0)).toEqual([POSITION_ID, null, MAX_TREE_DEPTH]);
  });

  it("mengecualikan karyawan yang sedang diubah", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await orgStructure.findLineManagerForPosition(POSITION_ID, EMPLOYEE_ID);

    expect(sqlOf(0)).toContain("($2::uuid IS NULL OR e.id <> $2::uuid)");
    expect(paramsOf(0)[1]).toBe(EMPLOYEE_ID);
  });

  it("hanya pemegang aktif yang dihitung, jabatan kosong dilewati", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    const result = await orgStructure.findLineManagerForPosition(POSITION_ID);

    expect(result).toBeNull();
    expect(sqlOf(0)).toContain("e.is_active = true");
    expect(sqlOf(0)).toContain("ORDER BY r.tingkat ASC");
  });
});
