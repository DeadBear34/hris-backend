import { jest, describe, it, expect, beforeEach } from "@jest/globals";

jest.unstable_mockModule("../../src/models/department.js", () => ({
  findById: jest.fn(),
  isUnitInSubtree: jest.fn(() => Promise.resolve(false)),
  findUnitAncestry: jest.fn(),
}));

jest.unstable_mockModule("../../src/models/position.js", () => ({
  findById: jest.fn(),
  findUnitHead: jest.fn(() => Promise.resolve(null)),
  findRoots: jest.fn(() => Promise.resolve([])),
  isPositionInSubtree: jest.fn(() => Promise.resolve(false)),
  depthOf: jest.fn(() => Promise.resolve(1)),
}));

jest.unstable_mockModule("../../src/models/orgStructure.js", () => ({
  countHolders: jest.fn(() => Promise.resolve(0)),
}));

const departmentModel = await import("../../src/models/department.js");
const positionModel = await import("../../src/models/position.js");
const orgStructure = await import("../../src/models/orgStructure.js");
const {
  assertUnitParent,
  assertUnitMove,
  assertPositionPlacement,
  assertPositionCapacity,
} = await import("../../src/helpers/orgValidation.js");
const { AppError } = await import("../../src/helpers/appError.js");

// Struktur contoh:
//   PT Awan (COMPANY) -> Direktorat Teknologi (TECH) -> Engineering (ENG)
const COMPANY = "c0000000-0000-4000-8000-000000000000";
const TECH = "c1000000-0000-4000-8000-000000000000";
const ENG = "c2000000-0000-4000-8000-000000000000";
const FIN = "c3000000-0000-4000-8000-000000000000";

const units: Record<string, { id: string; name: string }> = {
  [COMPANY]: { id: COMPANY, name: "PT Awan" },
  [TECH]: { id: TECH, name: "Direktorat Teknologi" },
  [ENG]: { id: ENG, name: "Engineering" },
  [FIN]: { id: FIN, name: "Finance" },
};

const ancestry: Record<string, string[]> = {
  [COMPANY]: [COMPANY],
  [TECH]: [TECH, COMPANY],
  [ENG]: [ENG, TECH, COMPANY],
  [FIN]: [FIN, COMPANY],
};

function position(id: string, department_id: string | null, extra = {}) {
  return {
    id,
    code: id.slice(0, 4).toUpperCase(),
    name: `Jabatan ${id.slice(0, 4)}`,
    level: 1,
    department_id,
    reports_to_position_id: null,
    is_unit_head: false,
    max_holders: null,
    is_active: true,
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...extra,
  };
}

const CTO = position("p-cto0", TECH, { is_unit_head: true });
const HEAD_ENG = position("p-head", ENG, { is_unit_head: true });
const HEAD_FIN = position("p-hfin", FIN, { is_unit_head: true });
const SENIOR = position("p-seni", ENG);

const positions: Record<string, ReturnType<typeof position>> = {
  [CTO.id]: CTO,
  [HEAD_ENG.id]: HEAD_ENG,
  [HEAD_FIN.id]: HEAD_FIN,
  [SENIOR.id]: SENIOR,
};

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (err) {
    return err as InstanceType<typeof AppError>;
  }
  throw new Error("seharusnya ditolak");
}

beforeEach(() => {
  jest.clearAllMocks();
  (departmentModel.findById as jest.Mock).mockImplementation(
    async (id: unknown) => (units[id as string] ?? null) as never,
  );
  (departmentModel.findUnitAncestry as jest.Mock).mockImplementation(
    async (id: unknown) => (ancestry[id as string] ?? []) as never,
  );
  (positionModel.findById as jest.Mock).mockImplementation(
    async (id: unknown) => (positions[id as string] ?? null) as never,
  );
  // clearAllMocks tidak mengembalikan nilai bawaan, jadi diatur ulang di sini
  (positionModel.findUnitHead as jest.Mock).mockResolvedValue(null as never);
  (positionModel.isPositionInSubtree as jest.Mock).mockResolvedValue(
    false as never,
  );
  (positionModel.depthOf as jest.Mock).mockResolvedValue(1 as never);
  (departmentModel.isUnitInSubtree as jest.Mock).mockResolvedValue(
    false as never,
  );
  (orgStructure.countHolders as jest.Mock).mockResolvedValue(0 as never);
  // sudah ada jabatan puncak (CEO)
  (positionModel.findRoots as jest.Mock).mockResolvedValue([
    position("p-ceo0", COMPANY, { name: "CEO" }),
  ] as never);
});

describe("V1: induk unit", () => {
  it("unit puncak tanpa induk selalu boleh", async () => {
    await expect(assertUnitParent(null, null)).resolves.toBeUndefined();
  });

  it("menolak induk yang tidak ada", async () => {
    const err = await rejection(
      assertUnitParent(ENG, "ffffffff-ffff-4fff-8fff-ffffffffffff"),
    );

    expect(err.statusCode).toBe(400);
    expect(err.details).toMatchObject({ field: "parent_id" });
  });

  it("menolak unit yang dipindah ke bawah sub-unitnya sendiri", async () => {
    (departmentModel.isUnitInSubtree as jest.Mock).mockResolvedValue(
      true as never,
    );

    const err = await rejection(assertUnitParent(TECH, ENG));

    expect(err.message).toContain("cannot be placed under itself");
    expect(departmentModel.isUnitInSubtree).toHaveBeenCalledWith(TECH, ENG);
  });

  it("unit baru tidak perlu diperiksa lingkarannya", async () => {
    await assertUnitParent(null, TECH);

    expect(departmentModel.isUnitInSubtree).not.toHaveBeenCalled();
  });
});

describe("letak jabatan", () => {
  it("menolak unit yang tidak ada", async () => {
    const err = await rejection(
      assertPositionPlacement({
        positionId: null,
        department_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        reports_to_position_id: HEAD_ENG.id,
        is_unit_head: false,
      }),
    );

    expect(err.details).toMatchObject({ field: "department_id" });
  });

  it("menerima jabatan biasa yang melapor ke kepala unitnya", async () => {
    await expect(
      assertPositionPlacement({
        positionId: null,
        department_id: ENG,
        reports_to_position_id: HEAD_ENG.id,
        is_unit_head: false,
      }),
    ).resolves.toBeUndefined();
  });

  it("menerima kepala unit yang melapor ke kepala unit induk", async () => {
    await expect(
      assertPositionPlacement({
        positionId: HEAD_ENG.id,
        department_id: ENG,
        reports_to_position_id: CTO.id,
        is_unit_head: true,
      }),
    ).resolves.toBeUndefined();
  });

  it("satu unit hanya boleh punya satu kepala", async () => {
    (positionModel.findUnitHead as jest.Mock).mockResolvedValue(
      HEAD_ENG as never,
    );

    const err = await rejection(
      assertPositionPlacement({
        positionId: null,
        department_id: ENG,
        reports_to_position_id: CTO.id,
        is_unit_head: true,
      }),
    );

    expect(err.statusCode).toBe(409);
    expect(err.details).toMatchObject({ field: "is_unit_head" });
  });

  describe("V5: satu jabatan puncak", () => {
    it("menolak jabatan kedua tanpa atasan", async () => {
      const err = await rejection(
        assertPositionPlacement({
          positionId: null,
          department_id: COMPANY,
          reports_to_position_id: null,
          is_unit_head: false,
        }),
      );

      expect(err.message).toContain("only be one top position");
      expect(err.details).toMatchObject({ field: "reports_to_position_id" });
    });

    it("jabatan puncak pertama boleh tanpa atasan", async () => {
      (positionModel.findRoots as jest.Mock).mockResolvedValue([] as never);

      await expect(
        assertPositionPlacement({
          positionId: null,
          department_id: COMPANY,
          reports_to_position_id: null,
          is_unit_head: true,
        }),
      ).resolves.toBeUndefined();
    });
  });

  it("menolak atasan jabatan yang tidak ada", async () => {
    const err = await rejection(
      assertPositionPlacement({
        positionId: null,
        department_id: ENG,
        reports_to_position_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        is_unit_head: false,
      }),
    );

    expect(err.message).toContain("Superior position not found");
  });

  it("V2: menolak jabatan yang melapor ke bawahannya sendiri", async () => {
    (positionModel.isPositionInSubtree as jest.Mock).mockResolvedValue(
      true as never,
    );

    const err = await rejection(
      assertPositionPlacement({
        positionId: HEAD_ENG.id,
        department_id: ENG,
        reports_to_position_id: SENIOR.id,
        is_unit_head: false,
      }),
    );

    expect(err.message).toContain("own subordinate positions");
    expect(positionModel.isPositionInSubtree).toHaveBeenCalledWith(
      HEAD_ENG.id,
      SENIOR.id,
    );
  });

  describe("V3 dan V4: hubungan lintas unit", () => {
    it("jabatan biasa tidak boleh melapor ke jabatan di unit lain", async () => {
      const err = await rejection(
        assertPositionPlacement({
          positionId: null,
          department_id: ENG,
          reports_to_position_id: HEAD_FIN.id,
          is_unit_head: false,
        }),
      );

      expect(err.message).toContain("Only the head of Engineering");
    });

    it("jabatan biasa tidak boleh melapor langsung ke unit induk", async () => {
      const err = await rejection(
        assertPositionPlacement({
          positionId: null,
          department_id: ENG,
          reports_to_position_id: CTO.id,
          is_unit_head: false,
        }),
      );

      expect(err.message).toContain("Only the head of Engineering");
    });

    it("kepala unit tidak boleh melapor ke unit yang bukan induknya", async () => {
      const err = await rejection(
        assertPositionPlacement({
          positionId: HEAD_ENG.id,
          department_id: ENG,
          reports_to_position_id: HEAD_FIN.id,
          is_unit_head: true,
        }),
      );

      expect(err.message).toContain(
        "must report to a position in one of its parent units",
      );
    });

    it("kepala unit tidak boleh melapor ke jabatan di unitnya sendiri", async () => {
      const err = await rejection(
        assertPositionPlacement({
          positionId: HEAD_ENG.id,
          department_id: ENG,
          reports_to_position_id: SENIOR.id,
          is_unit_head: true,
        }),
      );

      expect(err.message).toContain("parent units");
    });

    it("menolak atasan jabatan yang belum masuk unit mana pun", async () => {
      positions["p-lama"] = position("p-lama", null);

      const err = await rejection(
        assertPositionPlacement({
          positionId: null,
          department_id: ENG,
          reports_to_position_id: "p-lama",
          is_unit_head: false,
        }),
      );

      expect(err.message).toContain("not assigned to any unit");
    });
  });

  it("V8: menolak struktur yang melebihi batas kedalaman", async () => {
    (positionModel.depthOf as jest.Mock).mockResolvedValue(15 as never);

    const err = await rejection(
      assertPositionPlacement({
        positionId: null,
        department_id: ENG,
        reports_to_position_id: HEAD_ENG.id,
        is_unit_head: false,
      }),
    );

    expect(err.message).toContain("cannot be deeper than 15 levels");
  });
});

describe("V7: kuota kursi jabatan", () => {
  it("jabatan tanpa kuota tidak diperiksa", async () => {
    await assertPositionCapacity(SENIOR);

    expect(orgStructure.countHolders).not.toHaveBeenCalled();
  });

  it("menerima selama masih ada kursi", async () => {
    (orgStructure.countHolders as jest.Mock).mockResolvedValue(1 as never);

    await expect(
      assertPositionCapacity({ ...SENIOR, max_holders: 2 }),
    ).resolves.toBeUndefined();
  });

  it("menolak bila kursinya sudah penuh", async () => {
    (orgStructure.countHolders as jest.Mock).mockResolvedValue(1 as never);

    const err = await rejection(
      assertPositionCapacity({ ...HEAD_ENG, max_holders: 1 }),
    );

    expect(err.statusCode).toBe(409);
    expect(err.details).toMatchObject({
      field: "position_id",
      max_holders: 1,
      holders: 1,
    });
  });

  it("menghitung beberapa karyawan yang masuk sekaligus", async () => {
    (orgStructure.countHolders as jest.Mock).mockResolvedValue(1 as never);

    const err = await rejection(
      assertPositionCapacity({ ...SENIOR, max_holders: 2 }, undefined, 2),
    );

    expect(err.statusCode).toBe(409);
  });

  it("karyawan yang sedang dipindahkan tidak ikut terhitung", async () => {
    await assertPositionCapacity({ ...SENIOR, max_holders: 1 }, "e-pindah");

    expect(orgStructure.countHolders).toHaveBeenCalledWith(
      SENIOR.id,
      "e-pindah",
    );
  });
});

describe("V4 saat unit dipindah", () => {
  // Kepala Engineering melapor ke CTO di Direktorat Teknologi
  const HEAD_ENG_UNDER_CTO = { ...HEAD_ENG, reports_to_position_id: CTO.id };

  it("unit tanpa kepala boleh dipindah ke mana saja", async () => {
    await expect(assertUnitMove(ENG, FIN)).resolves.toBeUndefined();
  });

  it("kepala unit tanpa atasan tidak menghalangi pemindahan", async () => {
    (positionModel.findUnitHead as jest.Mock).mockResolvedValue(
      HEAD_ENG as never,
    );

    await expect(assertUnitMove(ENG, FIN)).resolves.toBeUndefined();
  });

  it("boleh dipindah selama atasan kepala unit tetap di jajaran induk", async () => {
    (positionModel.findUnitHead as jest.Mock).mockResolvedValue(
      HEAD_ENG_UNDER_CTO as never,
    );

    await expect(assertUnitMove(ENG, TECH)).resolves.toBeUndefined();
  });

  it("menolak pemindahan yang memutus kepala unit dari atasannya", async () => {
    (positionModel.findUnitHead as jest.Mock).mockResolvedValue(
      HEAD_ENG_UNDER_CTO as never,
    );

    const err = await rejection(assertUnitMove(ENG, FIN));

    expect(err.statusCode).toBe(400);
    expect(err.details).toMatchObject({
      field: "parent_id",
      unit_head_id: HEAD_ENG.id,
    });
  });

  it("menolak menjadikan unit puncak bila kepalanya masih punya atasan", async () => {
    (positionModel.findUnitHead as jest.Mock).mockResolvedValue(
      HEAD_ENG_UNDER_CTO as never,
    );

    const err = await rejection(assertUnitMove(ENG, null));

    expect(err.statusCode).toBe(400);
  });
});
