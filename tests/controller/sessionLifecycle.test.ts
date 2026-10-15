import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import request from "supertest";

// Siklus sesi lewat HTTP sungguhan: logout mencabut token, dan setiap
// perubahan akun membuang cache sesinya di Redis

const store = new Map<string, string>();

const fakeRedis = {
  get: jest.fn(async (key: string) => store.get(key) ?? null),
  set: jest.fn(async (key: string, value: string) => {
    store.set(key, value);
    return "OK";
  }),
  del: jest.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
  exists: jest.fn(async (key: string) => (store.has(key) ? 1 : 0)),
};

jest.unstable_mockModule("../../src/config/redis.js", () => ({
  getRedis: () => fakeRedis,
  redisState: () => "ready",
  startRedis: jest.fn(),
  closeRedis: jest.fn(),
}));

jest.unstable_mockModule("../../src/config/databaseConnection.js", () => ({
  pool: {
    connect: jest.fn(),
    query: jest.fn(() => Promise.resolve({ rows: [] })),
  },
}));

jest.unstable_mockModule("../../src/config/logger.js", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.unstable_mockModule("../../src/models/user.js", () => ({
  findSessionInfo: jest.fn(),
  findById: jest.fn(),
  findByEmail: jest.fn(),
  updatePassword: jest.fn(),
  setUserActive: jest.fn(),
}));

jest.unstable_mockModule("../../src/helpers/password.js", () => ({
  hashPassword: jest.fn(() => Promise.resolve("hash-baru")),
  verifyPassword: jest.fn(() => Promise.resolve(true)),
}));

const userModel = await import("../../src/models/user.js");
const { logger } = await import("../../src/config/logger.js");
const { createToken } = await import("../../src/helpers/jwt.js");
const { resetRevokedTokens } =
  await import("../../src/helpers/sessionStore.js");
const { app } = await import("../../src/app.js");

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";

function tokenFor(id: string, role: "admin" | "employee" = "employee") {
  return createToken({ id, email: `${id}@awan.io`, role });
}

beforeEach(() => {
  jest.clearAllMocks();
  store.clear();
  resetRevokedTokens();
  (userModel.findSessionInfo as jest.Mock).mockImplementation(
    async (id: unknown) =>
      ({ id, password_changed_at: null, is_active: true }) as never,
  );
});

describe("POST /api/v1/auth/logout", () => {
  it("token yang sudah logout tidak dapat dipakai lagi", async () => {
    const token = tokenFor(EMPLOYEE_ID);

    const first = await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${token}`);

    expect(first.status).toBe(200);
    expect(first.body.success).toBe(true);

    const second = await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${token}`);

    expect(second.status).toBe(401);
    expect(second.body.message).toContain("logged out");
  });

  it("disimpan di Redis supaya instance lain ikut menolaknya", async () => {
    await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${tokenFor(EMPLOYEE_ID)}`);

    const revoked = [...store.keys()].filter((key) =>
      key.startsWith("revoked:"),
    );

    expect(revoked).toHaveLength(1);
  });

  it("login di perangkat lain tetap berlaku", async () => {
    await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${tokenFor(EMPLOYEE_ID)}`);

    const other = await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${tokenFor(EMPLOYEE_ID)}`);

    expect(other.status).toBe(200);
  });

  it("mencatat logout di log aktivitas", async () => {
    await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${tokenFor(EMPLOYEE_ID)}`);

    const actions = (logger.debug as jest.Mock).mock.calls.map(
      ([payload]) =>
        (payload as { activity?: { action: string } }).activity?.action,
    );

    expect(actions).toContain("auth.logout");
  });

  it("menolak tanpa token", async () => {
    const res = await request(app).post("/api/v1/auth/logout");

    expect(res.status).toBe(401);
  });
});

describe("cache sesi dibuang saat akun berubah", () => {
  it("sesi disimpan di Redis setelah request pertama", async () => {
    await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${tokenFor(EMPLOYEE_ID)}`);

    expect(store.has(`session:${EMPLOYEE_ID}`)).toBe(true);
  });

  it("menonaktifkan akun membuang cache sesinya", async () => {
    store.set(
      `session:${EMPLOYEE_ID}`,
      JSON.stringify({
        id: EMPLOYEE_ID,
        password_changed_at: null,
        is_active: true,
      }),
    );
    (userModel.findById as jest.Mock).mockResolvedValue({
      id: EMPLOYEE_ID,
      email: "karyawan@awan.io",
      approved_at: new Date(),
    } as never);
    (userModel.setUserActive as jest.Mock).mockResolvedValue({
      id: EMPLOYEE_ID,
      email: "karyawan@awan.io",
      is_active: false,
    } as never);

    const res = await request(app)
      .patch(`/api/v1/users/${EMPLOYEE_ID}/status`)
      .set("Authorization", `Bearer ${tokenFor(ADMIN_ID, "admin")}`)
      .send({ is_active: false });

    expect(res.status).toBe(200);
    expect(fakeRedis.del).toHaveBeenCalledWith(`session:${EMPLOYEE_ID}`);
  });

  it("token akun yang baru dinonaktifkan langsung ditolak", async () => {
    const token = tokenFor(EMPLOYEE_ID);

    // request pertama mengisi cache dengan keadaan aktif
    await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${tokenFor(EMPLOYEE_ID)}`);

    (userModel.findById as jest.Mock).mockResolvedValue({
      id: EMPLOYEE_ID,
      email: "karyawan@awan.io",
      approved_at: new Date(),
    } as never);
    (userModel.setUserActive as jest.Mock).mockResolvedValue({
      id: EMPLOYEE_ID,
      is_active: false,
    } as never);
    (userModel.findSessionInfo as jest.Mock).mockImplementation(
      async (id: unknown) =>
        ({
          id,
          password_changed_at: null,
          is_active: id !== EMPLOYEE_ID,
        }) as never,
    );

    await request(app)
      .patch(`/api/v1/users/${EMPLOYEE_ID}/status`)
      .set("Authorization", `Bearer ${tokenFor(ADMIN_ID, "admin")}`)
      .send({ is_active: false });

    const res = await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toContain("deactivated");
  });

  it("mengganti password membuang cache sesinya", async () => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue({
      id: EMPLOYEE_ID,
      email: `${EMPLOYEE_ID}@awan.io`,
      password: "hash-lama",
    } as never);

    const res = await request(app)
      .patch("/api/v1/auth/password")
      .set("Authorization", `Bearer ${tokenFor(EMPLOYEE_ID)}`)
      .send({ current_password: "PasswordLama1!", new_password: "Baru1234!" });

    expect(res.status).toBe(200);
    expect(fakeRedis.del).toHaveBeenCalledWith(`session:${EMPLOYEE_ID}`);
  });
});
