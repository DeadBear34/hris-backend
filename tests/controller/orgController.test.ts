import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import request from "supertest";

jest.unstable_mockModule("../../src/config/databaseConnection.js", () => ({
  pool: {
    connect: jest.fn(),
    query: jest.fn(() => Promise.resolve({ rows: [] })),
  },
}));

jest.unstable_mockModule("../../src/models/user.js", () => ({
  findSessionInfo: jest.fn(() =>
    Promise.resolve({
      id: "session-user",
      password_changed_at: null,
      is_active: true,
    }),
  ),
}));

jest.unstable_mockModule("../../src/models/employee.js", () => ({
  findById: jest.fn(),
  findByUserId: jest.fn(),
}));

jest.unstable_mockModule("../../src/models/orgStructure.js", () => ({
  findLineManagerForPosition: jest.fn(() => Promise.resolve(null)),
  findLineManager: jest.fn(),
  loadOrgChart: jest.fn(),
  countHolders: jest.fn(),
}));

jest.unstable_mockModule("../../src/models/feature.js", () => ({
  findCodesByPosition: jest.fn(() => Promise.resolve([])),
  findAllCodes: jest.fn(() => Promise.resolve([])),
  findUserIdsWithFeature: jest.fn(() => Promise.resolve([])),
}));

const employeeModel = await import("../../src/models/employee.js");
const { pool } = await import("../../src/config/databaseConnection.js");
const orgStructure = await import("../../src/models/orgStructure.js");
const featureModel = await import("../../src/models/feature.js");
const { invalidateFeatureCache } =
  await import("../../src/helpers/featureCache.js");
const { createToken } = await import("../../src/helpers/jwt.js");
const { app } = await import("../../src/app.js");

const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";

const adminToken = createToken({
  id: "11111111-1111-4111-8111-111111111111",
  email: "admin@awan.io",
  role: "admin",
});
const employeeToken = createToken({
  id: "66666666-6666-4666-8666-666666666666",
  email: "karyawan@awan.io",
  role: "employee",
});

beforeEach(() => {
  jest.clearAllMocks();
  invalidateFeatureCache();
  (employeeModel.findByUserId as jest.Mock).mockResolvedValue({
    id: "77777777-7777-4777-8777-777777777777",
    position_id: "88888888-8888-4888-8888-888888888888",
  } as never);
  (featureModel.findCodesByPosition as jest.Mock).mockResolvedValue(
    [] as never,
  );
});

describe("GET /api/v1/org/tree", () => {
  it("menolak tanpa token", async () => {
    const res = await request(app).get("/api/v1/org/tree");

    expect(res.status).toBe(401);
  });

  it("menolak karyawan tanpa fitur organization.manage", async () => {
    const res = await request(app)
      .get("/api/v1/org/tree")
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
  });

  it("mengembalikan pohon organisasi", async () => {
    (orgStructure.loadOrgChart as jest.Mock).mockResolvedValue({
      units: [
        {
          id: "pt",
          code: "PT",
          name: "PT Awan",
          parent_id: null,
          unit_type: "company",
          is_active: true,
        },
      ],
      positions: [
        {
          id: "ceo",
          code: "CEO",
          name: "CEO",
          department_id: "pt",
          reports_to_position_id: null,
          is_unit_head: true,
          max_holders: 1,
          is_active: true,
        },
      ],
      holders: [
        {
          id: "e1",
          employee_number: "001",
          full_name: "Ismail Muhammad",
          position_id: "ceo",
        },
      ],
    } as never);

    const res = await request(app)
      .get("/api/v1/org/tree")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.units[0].name).toBe("PT Awan");
    expect(res.body.data.units[0].positions[0].holders[0].full_name).toBe(
      "Ismail Muhammad",
    );
  });
});

describe("GET /api/v1/employees/:id/line-manager", () => {
  it("menolak karyawan tanpa fitur employee.view_all", async () => {
    const res = await request(app)
      .get(`/api/v1/employees/${EMPLOYEE_ID}/line-manager`)
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
  });

  it("404 bila karyawan tidak ada", async () => {
    (employeeModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await request(app)
      .get(`/api/v1/employees/${EMPLOYEE_ID}/line-manager`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  it("mengembalikan atasan beserta asal hitungannya", async () => {
    (employeeModel.findById as jest.Mock).mockResolvedValue({
      id: EMPLOYEE_ID,
    } as never);
    (orgStructure.findLineManager as jest.Mock).mockResolvedValue({
      employee_id: "33333333-3333-4333-8333-333333333333",
      full_name: "Tammam Manager Engineering",
      user_id: "rahasia-tidak-dikirim",
      position_id: "44444444-4444-4444-8444-444444444444",
      position_name: "Head of Engineering",
      source: "structure",
      levels_up: 2,
    } as never);

    const res = await request(app)
      .get(`/api/v1/employees/${EMPLOYEE_ID}/line-manager`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.line_manager).toMatchObject({
      full_name: "Tammam Manager Engineering",
      source: "structure",
      levels_up: 2,
    });
    // id akun atasan tidak perlu diketahui frontend
    expect(res.body.data.line_manager).not.toHaveProperty("user_id");
  });

  it("line_manager null bila tidak ada atasan aktif sampai puncak", async () => {
    (employeeModel.findById as jest.Mock).mockResolvedValue({
      id: EMPLOYEE_ID,
    } as never);
    (orgStructure.findLineManager as jest.Mock).mockResolvedValue(
      null as never,
    );

    const res = await request(app)
      .get(`/api/v1/employees/${EMPLOYEE_ID}/line-manager`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.body.data.line_manager).toBeNull();
  });
});

describe("GET /api/v1/positions/:id/line-manager", () => {
  const POSITION_ID = "44444444-4444-4444-8444-444444444444";
  const URL = `/api/v1/positions/${POSITION_ID}/line-manager`;

  beforeEach(() => {
    // findById jabatan memakai pool asli: jawab ada untuk query positions
    (pool.query as jest.Mock).mockImplementation(((sql: unknown) =>
      Promise.resolve(
        String(sql).includes("FROM positions WHERE id")
          ? { rows: [{ id: POSITION_ID, name: "Backend Developer" }] }
          : { rows: [] },
      )) as never);
  });

  it("mengembalikan atasan hasil struktur tanpa user_id", async () => {
    (orgStructure.findLineManagerForPosition as jest.Mock).mockResolvedValue({
      employee_id: EMPLOYEE_ID,
      full_name: "Rizky Pratama",
      user_id: "rahasia",
      position_id: "pos-lead",
      position_name: "Engineering Lead",
      source: "structure",
      levels_up: 1,
    } as never);

    const res = await request(app)
      .get(URL)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.position_id).toBe(POSITION_ID);
    expect(res.body.data.line_manager).toMatchObject({
      full_name: "Rizky Pratama",
      source: "structure",
      levels_up: 1,
    });
    expect(res.body.data.line_manager.user_id).toBeUndefined();
  });

  it("meneruskan karyawan yang sedang diubah sebagai pengecualian", async () => {
    await request(app)
      .get(`${URL}?exclude_employee_id=${EMPLOYEE_ID}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(orgStructure.findLineManagerForPosition).toHaveBeenCalledWith(
      POSITION_ID,
      EMPLOYEE_ID,
    );
  });

  it("null bila tidak ada atasan aktif sampai puncak", async () => {
    (orgStructure.findLineManagerForPosition as jest.Mock).mockResolvedValue(
      null as never,
    );

    const res = await request(app)
      .get(URL)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.body.data.line_manager).toBeNull();
  });

  it("404 untuk jabatan yang tidak ada", async () => {
    (pool.query as jest.Mock).mockResolvedValue({ rows: [] } as never);

    const res = await request(app)
      .get(URL)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  it("400 untuk exclude_employee_id yang bukan uuid", async () => {
    const res = await request(app)
      .get(`${URL}?exclude_employee_id=bukan-uuid`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });

  it("403 untuk karyawan tanpa employee.view_all", async () => {
    const res = await request(app)
      .get(URL)
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
  });
});
