import { jest, describe, it, expect } from "@jest/globals";
import request from "supertest";

// Rate limit mati saat pengujian, kecuali dinyalakan seperti di berkas ini.
// Harus diisi sebelum aplikasi dimuat karena env dibaca sekali saat impor
process.env.RATE_LIMIT_ENABLED = "true";

const mockClient = { query: jest.fn(), release: jest.fn() };

jest.unstable_mockModule("../src/config/databaseConnection.js", () => ({
  pool: {
    connect: jest.fn(() => Promise.resolve(mockClient)),
    query: jest.fn(() => Promise.resolve({ rows: [] })),
  },
}));

mockClient.query.mockResolvedValue({ rows: [] } as never);

const { createToken } = await import("../src/helpers/jwt.js");
const { allowedOrigins } = await import("../src/config/allowedOrigins.js");
const { app } = await import("../src/app.js");

// Setiap test memakai pengguna sendiri supaya jatahnya tidak saling terpakai
function adminToken(id: string) {
  return createToken({ id, email: `${id}@awan.io`, role: "admin" });
}

describe("rate limit POST /auth/login", () => {
  it("menolak percobaan ke-6 dalam satu menit dengan format yang disepakati", async () => {
    const body = { email: "brute@awan.io", password: "salah-salah" };

    for (let i = 0; i < 5; i++) {
      const res = await request(app).post("/api/v1/auth/login").send(body);
      expect(res.status).not.toBe(429);
    }

    const res = await request(app).post("/api/v1/auth/login").send(body);

    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({
      success: false,
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests",
    });
    expect(res.headers["x-ratelimit-limit"]).toBe("5");
    expect(res.headers["x-ratelimit-remaining"]).toBe("0");
    expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
    expect(Number(res.headers["retry-after"])).toBeLessThanOrEqual(60);
  });

  it("email lain dari IP yang sama tidak ikut terkunci", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "rekan@awan.io", password: "salah-salah" });

    expect(res.status).not.toBe(429);
    expect(res.headers["x-ratelimit-remaining"]).toBe("4");
  });
});

describe("rate limit /employees", () => {
  it("GET /employees memakai batas 100 per menit", async () => {
    const res = await request(app)
      .get("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken("daftar")}`);

    expect(res.headers["x-ratelimit-limit"]).toBe("100");
    expect(res.headers["x-ratelimit-remaining"]).toBe("99");
  });

  it("POST /employees menolak permintaan ke-21 dalam satu menit", async () => {
    const token = adminToken("pembuat");

    for (let i = 0; i < 20; i++) {
      const res = await request(app)
        .post("/api/v1/employees")
        .set("Authorization", `Bearer ${token}`)
        .send([]);
      expect(res.status).not.toBe(429);
    }

    const res = await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${token}`)
      .send([]);

    expect(res.status).toBe(429);
    expect(res.body.code).toBe("RATE_LIMIT_EXCEEDED");
    expect(res.headers["x-ratelimit-limit"]).toBe("20");
  });

  it("jatah POST tidak mengurangi jatah GET", async () => {
    const token = adminToken("campuran");

    await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${token}`)
      .send([]);

    const res = await request(app)
      .get("/api/v1/employees")
      .set("Authorization", `Bearer ${token}`);

    expect(res.headers["x-ratelimit-remaining"]).toBe("99");
  });
});

describe("batas umum /api/v1", () => {
  it("endpoint lain memakai batas umum 300 per menit", async () => {
    const res = await request(app)
      .get("/api/v1/departments")
      .set("Authorization", `Bearer ${adminToken("umum")}`);

    expect(res.headers["x-ratelimit-limit"]).toBe("300");
  });

  it("menolak setelah 300 permintaan, termasuk ke route yang tidak ada", async () => {
    const token = adminToken("pemindai");

    for (let i = 0; i < 300; i++) {
      await request(app)
        .get("/api/v1/tidak-ada")
        .set("Authorization", `Bearer ${token}`);
    }

    const res = await request(app)
      .get("/api/v1/tidak-ada")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(429);
    expect(res.body.code).toBe("RATE_LIMIT_EXCEEDED");
  });

  it("/health tidak dibatasi supaya pemeriksa kesehatan server tidak tertolak", async () => {
    const res = await request(app).get("/health");

    expect(res.headers["x-ratelimit-limit"]).toBeUndefined();
  });
});

describe("CORS", () => {
  it("membuka header rate limit untuk dibaca JavaScript frontend", async () => {
    const res = await request(app)
      .get("/api/v1/employees")
      .set("Origin", allowedOrigins[0]!)
      .set("Authorization", `Bearer ${adminToken("cors")}`);

    const exposed = String(res.headers["access-control-expose-headers"]);

    expect(exposed).toContain("X-RateLimit-Limit");
    expect(exposed).toContain("X-RateLimit-Remaining");
    expect(exposed).toContain("Retry-After");
  });
});
