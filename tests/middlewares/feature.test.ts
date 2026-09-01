import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import type { Request, Response, NextFunction } from "express";

jest.unstable_mockModule("../../src/config/databaseConnection.js", () => ({
  pool: { connect: jest.fn(), query: jest.fn() },
}));

jest.unstable_mockModule("../../src/models/employee.js", () => ({
  findByUserId: jest.fn(),
  findById: jest.fn(),
}));

jest.unstable_mockModule("../../src/models/feature.js", () => ({
  findCodesByPosition: jest.fn(),
  findAllCodes: jest.fn(),
  findAllFeatures: jest.fn(),
  findByCodes: jest.fn(),
  findFeaturesByPosition: jest.fn(),
  findMatrix: jest.fn(),
  replacePositionFeatures: jest.fn(),
  countGrantsByPosition: jest.fn(),
}));

const employeeModel = await import("../../src/models/employee.js");
const featureModel = await import("../../src/models/feature.js");
const { requireFeature, hasFeature, getUserFeatureCodes } =
  await import("../../src/middlewares/feature.js");
const { invalidateFeatureCache } =
  await import("../../src/helpers/featureCache.js");

const USER_ID = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";
const POSITION_ID = "33333333-3333-4333-8333-333333333333";

const fakeEmployee = {
  id: EMPLOYEE_ID,
  user_id: USER_ID,
  full_name: "Ismail Muhammad",
  position_id: POSITION_ID,
};

function siapkanReq(role: string): Request {
  return { user: { id: USER_ID, email: "a@awan.io", role } } as Request;
}

function siapkanRes(): Response {
  return { locals: {} } as Response;
}

function ambilError(next: NextFunction) {
  const [err] = (next as jest.Mock).mock.calls[0] as [
    { statusCode: number; message: string; details?: unknown },
  ];
  return err;
}

let next: NextFunction;

beforeEach(() => {
  jest.clearAllMocks();
  invalidateFeatureCache();
  next = jest.fn() as unknown as NextFunction;
  (employeeModel.findByUserId as jest.Mock).mockResolvedValue(
    fakeEmployee as never,
  );
  (featureModel.findCodesByPosition as jest.Mock).mockResolvedValue([
    "employee.view_all",
  ] as never);
  (featureModel.findAllCodes as jest.Mock).mockResolvedValue([
    "employee.view_all",
    "leave.approve_all",
    "system.manage_feature",
  ] as never);
});

describe("requireFeature untuk admin", () => {
  it("melewatkan admin tanpa memeriksa fitur", async () => {
    await requireFeature("employee.delete")(
      siapkanReq("admin"),
      siapkanRes(),
      next,
    );

    expect(next).toHaveBeenCalledWith();
    expect(featureModel.findCodesByPosition).not.toHaveBeenCalled();
  });

  it("tidak menyentuh tabel karyawan untuk admin", async () => {
    await requireFeature("system.manage_feature")(
      siapkanReq("admin"),
      siapkanRes(),
      next,
    );

    expect(employeeModel.findByUserId).not.toHaveBeenCalled();
  });
});

describe("requireFeature untuk karyawan", () => {
  it("mengizinkan karyawan yang jabatannya punya fitur", async () => {
    await requireFeature("employee.view_all")(
      siapkanReq("employee"),
      siapkanRes(),
      next,
    );

    expect(next).toHaveBeenCalledWith();
  });

  it("menolak karyawan yang jabatannya tidak punya fitur", async () => {
    await requireFeature("employee.delete")(
      siapkanReq("employee"),
      siapkanRes(),
      next,
    );

    expect(ambilError(next).statusCode).toBe(403);
  });

  it("menyertakan kode fitur yang dibutuhkan pada details", async () => {
    await requireFeature("employee.delete")(
      siapkanReq("employee"),
      siapkanRes(),
      next,
    );

    expect(ambilError(next).details).toEqual({
      required_feature: "employee.delete",
    });
  });

  it("menolak karyawan yang belum punya jabatan", async () => {
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue({
      ...fakeEmployee,
      position_id: null,
    } as never);

    await requireFeature("employee.view_all")(
      siapkanReq("employee"),
      siapkanRes(),
      next,
    );

    const err = ambilError(next);

    expect(err.statusCode).toBe(403);
    expect(err.message).toContain("Jabatan kamu belum ditentukan");
    expect(err.details).toEqual({ required_feature: "employee.view_all" });
  });

  it("menolak akun yang belum terhubung ke data karyawan", async () => {
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue(null as never);

    await requireFeature("employee.view_all")(
      siapkanReq("employee"),
      siapkanRes(),
      next,
    );

    const err = ambilError(next);

    expect(err.statusCode).toBe(403);
    expect(err.message).toContain("belum terhubung ke data karyawan");
  });

  it("menyimpan karyawan di res.locals agar tidak diquery berulang", async () => {
    const res = siapkanRes();

    await requireFeature("employee.view_all")(
      siapkanReq("employee"),
      res,
      next,
    );
    await requireFeature("employee.view_all")(
      siapkanReq("employee"),
      res,
      next,
    );

    expect(employeeModel.findByUserId).toHaveBeenCalledTimes(1);
  });
});

describe("cache fitur per jabatan", () => {
  it("hanya memanggil database sekali untuk jabatan yang sama", async () => {
    await requireFeature("employee.view_all")(
      siapkanReq("employee"),
      siapkanRes(),
      next,
    );
    await requireFeature("employee.view_all")(
      siapkanReq("employee"),
      siapkanRes(),
      next,
    );

    expect(featureModel.findCodesByPosition).toHaveBeenCalledTimes(1);
  });

  it("memuat ulang setelah cache dibatalkan", async () => {
    await requireFeature("employee.view_all")(
      siapkanReq("employee"),
      siapkanRes(),
      next,
    );

    invalidateFeatureCache(POSITION_ID);

    await requireFeature("employee.view_all")(
      siapkanReq("employee"),
      siapkanRes(),
      next,
    );

    expect(featureModel.findCodesByPosition).toHaveBeenCalledTimes(2);
  });

  it("perubahan fitur langsung terasa setelah cache dibatalkan", async () => {
    await requireFeature("employee.delete")(
      siapkanReq("employee"),
      siapkanRes(),
      next,
    );
    expect(ambilError(next).statusCode).toBe(403);

    (featureModel.findCodesByPosition as jest.Mock).mockResolvedValue([
      "employee.delete",
    ] as never);
    invalidateFeatureCache(POSITION_ID);

    const next2 = jest.fn() as unknown as NextFunction;
    await requireFeature("employee.delete")(
      siapkanReq("employee"),
      siapkanRes(),
      next2,
    );

    expect(next2).toHaveBeenCalledWith();
  });
});

describe("punyaFitur", () => {
  it("selalu true untuk admin", async () => {
    const result = await hasFeature(
      siapkanReq("admin"),
      siapkanRes(),
      "leave.approve_all",
    );

    expect(result).toBe(true);
  });

  it("true bila jabatannya memiliki fitur", async () => {
    const result = await hasFeature(
      siapkanReq("employee"),
      siapkanRes(),
      "employee.view_all",
    );

    expect(result).toBe(true);
  });

  it("false bila jabatannya tidak memiliki fitur", async () => {
    const result = await hasFeature(
      siapkanReq("employee"),
      siapkanRes(),
      "leave.approve_all",
    );

    expect(result).toBe(false);
  });

  it("false bila karyawan belum punya jabatan", async () => {
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue({
      ...fakeEmployee,
      position_id: null,
    } as never);

    const result = await hasFeature(
      siapkanReq("employee"),
      siapkanRes(),
      "employee.view_all",
    );

    expect(result).toBe(false);
  });
});

describe("ambilKodeFiturPengguna", () => {
  it("mengembalikan seluruh kode untuk admin", async () => {
    const codes = await getUserFeatureCodes(
      siapkanReq("admin"),
      siapkanRes(),
    );

    expect(codes).toContain("system.manage_feature");
    expect(codes).toHaveLength(3);
  });

  it("mengembalikan fitur jabatan untuk karyawan", async () => {
    const codes = await getUserFeatureCodes(
      siapkanReq("employee"),
      siapkanRes(),
    );

    expect(codes).toEqual(["employee.view_all"]);
  });

  it("mengembalikan daftar kosong untuk karyawan tanpa jabatan", async () => {
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue({
      ...fakeEmployee,
      position_id: null,
    } as never);

    const codes = await getUserFeatureCodes(
      siapkanReq("employee"),
      siapkanRes(),
    );

    expect(codes).toEqual([]);
  });

  it("mengembalikan daftar kosong untuk akun tanpa data karyawan", async () => {
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue(null as never);

    const codes = await getUserFeatureCodes(
      siapkanReq("employee"),
      siapkanRes(),
    );

    expect(codes).toEqual([]);
  });
});
