import { jest, describe, it, expect } from "@jest/globals";
import request from "supertest";

// pemeriksaan di berkas ini hanya menyangkut pemasangan route dan aturan
// aksesnya, jadi database cukup dibuat mengembalikan hasil kosong
const mockClient = { query: jest.fn(), release: jest.fn() };

jest.unstable_mockModule("../src/config/databaseConnection.js", () => ({
  pool: {
    connect: jest.fn(() => Promise.resolve(mockClient)),
    query: jest.fn(() => Promise.resolve({ rows: [] })),
  },
}));

mockClient.query.mockResolvedValue({ rows: [] } as never);

const { createToken } = await import("../src/helpers/jwt.js");
const { app } = await import("../src/app.js");

const HR_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_ID = "88888888-8888-4888-8888-888888888888";

const hrToken = createToken({ id: HR_ID, email: "hr@awan.io", role: "hr" });
const employeeToken = createToken({
  id: TARGET_ID,
  email: "karyawan@awan.io",
  role: "employee",
});

describe("GET /health", () => {
  it("mengembalikan status server tanpa perlu login", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe("penanganan route yang tidak dikenal", () => {
  it("mengembalikan 404 dengan format respons yang konsisten", async () => {
    const res = await request(app).get("/api/v1/tidakada");

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("/api/v1/tidakada");
  });

  it("menyebutkan metode HTTP yang dipakai", async () => {
    const res = await request(app).post("/api/v1/tidakada");

    expect(res.body.message).toContain("POST");
  });

  it("hanya melayani route di bawah /api/v1", async () => {
    const res = await request(app).post("/auth/login");

    expect(res.status).toBe(404);
  });

  it("menolak metode yang tidak disediakan sebuah route", async () => {
    const res = await request(app)
      .delete("/api/v1/auth/me")
      .set("Authorization", `Bearer ${hrToken}`);

    expect(res.status).toBe(404);
  });
});

describe("penanganan body JSON", () => {
  it("menolak JSON yang rusak dengan pesan yang jelas", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .set("Content-Type", "application/json")
      .send('{"email": "ismail@awan.io",}');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_JSON");
  });
});

describe("header keamanan", () => {
  it("tidak mengumumkan teknologi server", async () => {
    const res = await request(app).get("/health");

    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("memasang header dari helmet", async () => {
    const res = await request(app).get("/health");

    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("mengizinkan permintaan lintas asal dari frontend", async () => {
    const res = await request(app)
      .get("/health")
      .set("Origin", "http://localhost:5173");

    expect(res.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173",
    );
  });
});

describe("aturan akses tiap route", () => {
  const rutePublik = [
    ["post", "/api/v1/auth/register"],
    ["post", "/api/v1/auth/login"],
  ] as const;

  const ruteLogin = [
    ["get", "/api/v1/auth/me"],
    ["patch", "/api/v1/auth/password"],
    ["get", "/api/v1/departments"],
    ["get", `/api/v1/departments/${TARGET_ID}`],
    ["get", "/api/v1/positions"],
    ["get", `/api/v1/positions/${TARGET_ID}`],
  ] as const;

  const ruteHr = [
    ["get", "/api/v1/users/pending"],
    ["patch", `/api/v1/users/${TARGET_ID}/approve`],
    ["patch", `/api/v1/users/${TARGET_ID}/status`],
    ["get", "/api/v1/employees"],
    ["post", "/api/v1/employees"],
    ["get", `/api/v1/employees/${TARGET_ID}`],
    ["patch", `/api/v1/employees/${TARGET_ID}`],
    ["delete", `/api/v1/employees/${TARGET_ID}`],
    ["post", "/api/v1/departments"],
    ["patch", `/api/v1/departments/${TARGET_ID}`],
    ["delete", `/api/v1/departments/${TARGET_ID}`],
    ["post", "/api/v1/positions"],
    ["patch", `/api/v1/positions/${TARGET_ID}`],
    ["delete", `/api/v1/positions/${TARGET_ID}`],
  ] as const;

  it.each(rutePublik)(
    "%s %s terpasang tanpa perlu login",
    async (method, path) => {
      const res = await request(app)[method](path).send({});

      expect(res.status).not.toBe(404);
      expect(res.status).not.toBe(401);
    },
  );

  it.each(ruteLogin)("%s %s menolak tamu", async (method, path) => {
    const res = await request(app)[method](path).send({});

    expect(res.status).toBe(401);
  });

  it.each(ruteLogin)(
    "%s %s dapat diakses karyawan biasa",
    async (method, path) => {
      const res = await request(app)
        [method](path)
        .set("Authorization", `Bearer ${employeeToken}`)
        .send({});

      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    },
  );

  it.each(ruteHr)("%s %s menolak tamu", async (method, path) => {
    const res = await request(app)[method](path).send({});

    expect(res.status).toBe(401);
  });

  it.each(ruteHr)("%s %s menolak karyawan biasa", async (method, path) => {
    const res = await request(app)
      [method](path)
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({});

    expect(res.status).toBe(403);
  });
});
