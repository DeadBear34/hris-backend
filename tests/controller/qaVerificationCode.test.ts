import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import request from "supertest";

jest.unstable_mockModule("../../src/config/databaseConnection.js", () => ({
  pool: {
    connect: jest.fn(),
    query: jest.fn(() => Promise.resolve({ rows: [] })),
  },
}));

jest.unstable_mockModule("../../src/models/user.js", () => ({
  insertUser: jest.fn(),
  findById: jest.fn(),
  findByEmail: jest.fn(),
  updateLastLogin: jest.fn(),
  updatePassword: jest.fn(),
  approveUser: jest.fn(),
  setUserActive: jest.fn(),
  softDeleteUser: jest.fn(),
  findPending: jest.fn(),
  setEmailVerified: jest.fn(),
  findSessionInfo: jest.fn(() =>
    Promise.resolve({
      id: "session-user",
      password_changed_at: null,
      is_active: true,
    }),
  ),
}));

jest.unstable_mockModule("../../src/models/verificationToken.js", () => ({
  createToken: jest.fn(() => Promise.resolve({})),
  findLatest: jest.fn(),
  findActive: jest.fn(),
  claimAttempt: jest.fn(),
  markConsumed: jest.fn(),
  invalidateActive: jest.fn(() => Promise.resolve(1)),
}));

const mockSendMail = jest.fn(() => Promise.resolve());

jest.unstable_mockModule("../../src/helpers/mailer.js", () => ({
  sendMail: mockSendMail,
  isSecretLoggingAllowed: () => true,
}));

const userModel = await import("../../src/models/user.js");
const tokenModel = await import("../../src/models/verificationToken.js");
const { verifyPassword } = await import("../../src/helpers/password.js");
const { env } = await import("../../src/config/env.js");
const { createToken } = await import("../../src/helpers/jwt.js");
const { app } = await import("../../src/app.js");

const EMAIL = "qa.otomatis@hris.click";
const URL = `/api/v1/auth/verification-code?email=${encodeURIComponent(EMAIL)}`;

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

const unverifiedUser = {
  id: "22222222-2222-4222-8222-222222222222",
  email: EMAIL,
  role: "employee",
  is_active: false,
  email_verified_at: null,
  approved_at: null,
  deleted_at: null,
};

const originalFlag = env.QA_TOOLS_ENABLED;

beforeEach(() => {
  jest.clearAllMocks();
  env.QA_TOOLS_ENABLED = originalFlag;
  (userModel.findByEmail as jest.Mock).mockResolvedValue(
    unverifiedUser as never,
  );
});

describe("GET /api/v1/auth/verification-code", () => {
  it("admin menerima kode baru yang cocok dengan hash tersimpan", async () => {
    const res = await request(app)
      .get(URL)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      email: EMAIL,
      expires_in_minutes: 10,
    });
    expect(res.body.data.code).toMatch(/^\d{6}$/);
    expect(res.headers["cache-control"]).toBe("no-store");

    // kode lama dibatalkan, dan yang tersimpan hanya hash kode baru
    expect(tokenModel.invalidateActive).toHaveBeenCalledWith(
      EMAIL,
      "email_verification",
    );
    const [saved] = (tokenModel.createToken as jest.Mock).mock.calls[0] as [
      { token_hash: string; purpose: string },
    ];
    expect(saved.purpose).toBe("email_verification");
    expect(saved.token_hash).not.toContain(res.body.data.code);
    expect(await verifyPassword(saved.token_hash, res.body.data.code)).toBe(
      true,
    );
  });

  it("tidak mengirim email", async () => {
    await request(app).get(URL).set("Authorization", `Bearer ${adminToken}`);

    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("menolak permintaan tanpa login", async () => {
    const res = await request(app).get(URL);

    expect(res.status).toBe(401);
    expect(tokenModel.createToken).not.toHaveBeenCalled();
  });

  it("menolak pengguna yang bukan admin", async () => {
    const res = await request(app)
      .get(URL)
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
    expect(tokenModel.createToken).not.toHaveBeenCalled();
  });

  it("menolak email yang tidak valid", async () => {
    const res = await request(app)
      .get("/api/v1/auth/verification-code?email=bukan-email")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });

  it("email yang tidak terdaftar dijawab 404", async () => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(null as never);

    const res = await request(app)
      .get(URL)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(tokenModel.createToken).not.toHaveBeenCalled();
  });

  it("email yang sudah terverifikasi dijawab 409", async () => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue({
      ...unverifiedUser,
      email_verified_at: new Date(),
    } as never);

    const res = await request(app)
      .get(URL)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(409);
    expect(tokenModel.createToken).not.toHaveBeenCalled();
  });

  it("saat dimatikan terlihat seperti rute yang tidak ada, bahkan untuk admin", async () => {
    env.QA_TOOLS_ENABLED = "false";

    const res = await request(app)
      .get(URL)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.message).toContain("not found");
    expect(tokenModel.createToken).not.toHaveBeenCalled();
  });

  it("saat dimatikan, permintaan tanpa login juga 404, bukan 401", async () => {
    env.QA_TOOLS_ENABLED = "false";

    const res = await request(app).get(URL);

    expect(res.status).toBe(404);
  });
});

describe("qaToolsEnabled", () => {
  const original = env.NODE_ENV;

  it("bawaannya mati di production dan menyala di luar production", async () => {
    const { qaToolsEnabled } = await import("../../src/middlewares/qaTools.js");
    env.QA_TOOLS_ENABLED = undefined;

    env.NODE_ENV = "production";
    expect(qaToolsEnabled()).toBe(false);

    env.NODE_ENV = "development";
    expect(qaToolsEnabled()).toBe(true);

    env.NODE_ENV = "production";
    env.QA_TOOLS_ENABLED = "true";
    expect(qaToolsEnabled()).toBe(true);

    env.NODE_ENV = original;
  });
});
