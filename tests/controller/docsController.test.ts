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

const employeeModel = await import("../../src/models/employee.js");
const featureModel = await import("../../src/models/feature.js");
const { invalidateFeatureCache } =
  await import("../../src/helpers/featureCache.js");
const { createToken } = await import("../../src/helpers/jwt.js");
const { createTryItOutGuard } =
  await import("../../src/middlewares/apiDocsGuard.js");
const { app } = await import("../../src/app.js");

const USER_ID = "11111111-1111-4111-8111-111111111111";

const employeeToken = createToken({
  id: USER_ID,
  email: "qa@awan.io",
  role: "employee",
});
const adminToken = createToken({
  id: USER_ID,
  email: "admin@awan.io",
  role: "admin",
});

function grant(codes: string[]) {
  (featureModel.findCodesByPosition as jest.Mock).mockResolvedValue(
    codes as never,
  );
  invalidateFeatureCache();
}

beforeEach(() => {
  jest.clearAllMocks();
  (employeeModel.findByUserId as jest.Mock).mockResolvedValue({
    id: "22222222-2222-4222-8222-222222222222",
    user_id: USER_ID,
    position_id: "33333333-3333-4333-8333-333333333333",
  } as never);
  grant([]);
});

function getDocs(token?: string) {
  const req = request(app).get("/api/v1/docs/openapi.json");
  return token ? req.set("Authorization", `Bearer ${token}`) : req;
}

describe("GET /api/v1/docs/openapi.json", () => {
  it("menolak tamu", async () => {
    const res = await getDocs();

    expect(res.status).toBe(401);
  });

  // Dokumentasi memetakan seluruh endpoint, jadi tidak untuk sembarang karyawan
  it("menolak karyawan tanpa fitur system.view_api_docs", async () => {
    const res = await getDocs(employeeToken);

    expect(res.status).toBe(403);
    expect(res.body.details.required_feature).toBe("system.view_api_docs");
  });

  it("karyawan dengan fitur system.view_api_docs boleh membaca", async () => {
    grant(["system.view_api_docs"]);

    const res = await getDocs(employeeToken);

    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe("3.1.0");
  });

  it("admin boleh membaca", async () => {
    const res = await getDocs(adminToken);

    expect(res.status).toBe(200);
    expect(res.body.info.title).toBe("HRIS Backend API");
  });

  it("tidak boleh disimpan di cache peramban maupun proxy", async () => {
    const res = await getDocs(adminToken);

    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("tidak membocorkan nilai rahasia dari environment", async () => {
    const res = await getDocs(adminToken);
    const text = JSON.stringify(res.body);

    for (const secret of [process.env.JWT_SECRET, process.env.DATABASE_URL]) {
      if (secret) expect(text).not.toContain(secret);
    }
  });

  it("mendokumentasikan dirinya sendiri beserta hak aksesnya", async () => {
    const res = await getDocs(adminToken);
    const op = res.body.paths["/docs/openapi.json"].get;

    expect(op["x-required-feature"]).toBe("system.view_api_docs");
    expect(op.security).toEqual([{ bearerAuth: [] }]);
  });
});

describe("pengaman tombol Try it out", () => {
  const HEADER = "x-api-docs-try-it-out";

  function run(
    isProduction: boolean,
    method: string,
    headers: Record<string, string>,
  ) {
    const guard = createTryItOutGuard(isProduction);
    const next = jest.fn();
    guard({ method, headers } as never, {} as never, next);
    return next.mock.calls[0]?.[0] as { statusCode?: number } | undefined;
  }

  it("production: percobaan yang mengubah data ditolak 403", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(run(true, method, { [HEADER]: "1" })?.statusCode).toBe(403);
    }
  });

  it("production: percobaan GET tetap boleh", () => {
    expect(run(true, "GET", { [HEADER]: "1" })).toBeUndefined();
  });

  it("production: permintaan biasa dari aplikasi tidak terpengaruh", () => {
    expect(run(true, "POST", {})).toBeUndefined();
  });

  it("development: semua percobaan boleh", () => {
    expect(run(false, "DELETE", { [HEADER]: "1" })).toBeUndefined();
  });
});
