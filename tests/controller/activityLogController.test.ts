import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import request from "supertest";

jest.unstable_mockModule("../../src/config/databaseConnection.js", () => ({
  pool: {
    query: jest.fn(() => Promise.resolve({ rows: [] })),
    connect: jest.fn(),
  },
}));

jest.unstable_mockModule("../../src/models/user.js", () => ({
  findSessionInfo: jest.fn(() => Promise.resolve(null)),
}));

jest.unstable_mockModule("../../src/models/employee.js", () => ({
  findByUserId: jest.fn(),
}));

jest.unstable_mockModule("../../src/models/feature.js", () => ({
  findCodesByPosition: jest.fn(),
  findAllCodes: jest.fn(() => Promise.resolve([])),
  findUserIdsWithFeature: jest.fn(() => Promise.resolve([])),
}));

jest.unstable_mockModule("../../src/models/activityLog.js", () => ({
  insertLog: jest.fn(),
  listLogs: jest.fn(),
  findLatestChange: jest.fn(),
}));

const employeeModel = await import("../../src/models/employee.js");
const featureModel = await import("../../src/models/feature.js");
const activityLogModel = await import("../../src/models/activityLog.js");
const { invalidateFeatureCache } =
  await import("../../src/helpers/featureCache.js");
const { createToken } = await import("../../src/helpers/jwt.js");
const { app } = await import("../../src/app.js");

const USER_ID = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";
const POSITION_ID = "33333333-3333-4333-8333-333333333333";

const token = createToken({
  id: USER_ID,
  email: "hr@awan.io",
  role: "employee",
});

const fakeLog = {
  id: "44444444-4444-4444-8444-444444444444",
  action: "employee.update",
  status: "success",
  actor_email: "hr@awan.io",
  entity: "employee",
  entity_id: EMPLOYEE_ID,
  summary: "Employee Ismail Muhammad updated",
  occurred_at: new Date(),
};

function grant(codes: string[]) {
  (featureModel.findCodesByPosition as jest.Mock).mockResolvedValue(
    codes as never,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  invalidateFeatureCache();
  (employeeModel.findByUserId as jest.Mock).mockResolvedValue({
    id: EMPLOYEE_ID,
    user_id: USER_ID,
    position_id: POSITION_ID,
  } as never);
  (activityLogModel.listLogs as jest.Mock).mockResolvedValue({
    rows: [fakeLog],
    total: 1,
  } as never);
  grant(["system.view_log"]);
});

describe("GET /api/v1/activity-logs", () => {
  it("menolak tamu yang belum login", async () => {
    const res = await request(app).get("/api/v1/activity-logs");

    expect(res.status).toBe(401);
  });

  it("menolak jabatan yang tidak punya system.view_log", async () => {
    grant([]);

    const res = await request(app)
      .get("/api/v1/activity-logs")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(activityLogModel.listLogs).not.toHaveBeenCalled();
  });

  it("mengizinkan jabatan yang punya system.view_log", async () => {
    const res = await request(app)
      .get("/api/v1/activity-logs")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data[0].action).toBe("employee.update");
  });

  it("memakai paginasi bawaan 20 baris per halaman", async () => {
    const res = await request(app)
      .get("/api/v1/activity-logs")
      .set("Authorization", `Bearer ${token}`);

    const [params] = (activityLogModel.listLogs as jest.Mock).mock.calls[0] as [
      { page: number; limit: number },
    ];

    expect(params).toMatchObject({ page: 1, limit: 20 });
    expect(res.body.meta).toMatchObject({ page: 1, limit: 20, total: 1 });
  });

  it("meneruskan penyaring ke model", async () => {
    await request(app)
      .get(
        `/api/v1/activity-logs?action=employee.update&status=success&entity=employee&entity_id=${EMPLOYEE_ID}&start_date=2026-09-01&end_date=2026-09-30&page=2&limit=50`,
      )
      .set("Authorization", `Bearer ${token}`);

    const [params] = (activityLogModel.listLogs as jest.Mock).mock.calls[0] as [
      Record<string, unknown>,
    ];

    expect(params).toMatchObject({
      action: "employee.update",
      status: "success",
      entity: "employee",
      entity_id: EMPLOYEE_ID,
      start_date: "2026-09-01",
      end_date: "2026-09-30",
      page: 2,
      limit: 50,
    });
  });

  it("menolak rentang tanggal terbalik", async () => {
    const res = await request(app)
      .get("/api/v1/activity-logs?start_date=2026-09-30&end_date=2026-09-01")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(activityLogModel.listLogs).not.toHaveBeenCalled();
  });

  it("menolak batas di luar rentang", async () => {
    const res = await request(app)
      .get("/api/v1/activity-logs?limit=500")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});
