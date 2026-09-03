import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
} from "@jest/globals";
import request from "supertest";

jest.unstable_mockModule("../../src/config/databaseConnection.js", () => ({
  pool: {
    connect: jest.fn(),
    query: jest.fn(() => Promise.resolve({ rows: [] })),
  },
}));

jest.unstable_mockModule("../../src/models/user.js", () => ({
  insertUser: jest.fn(),
  insertUserByAdmin: jest.fn(),
  findById: jest.fn(),
  findByEmail: jest.fn(),
  updateLastLogin: jest.fn(),
  updatePassword: jest.fn(),
  approveUser: jest.fn(),
  setUserActive: jest.fn(),
  softDeleteUser: jest.fn(),
  findPending: jest.fn(),
  setEmailVerified: jest.fn(),
  findSessionInfo: jest.fn(),
}));

jest.unstable_mockModule("../../src/models/employee.js", () => ({
  insertEmployee: jest.fn(),
  createEmployee: jest.fn(),
  updateEmployee: jest.fn(),
  softDeleteEmployee: jest.fn(),
  findByUserId: jest.fn(),
  findById: jest.fn(),
  findDetailById: jest.fn(),
  listEmployees: jest.fn(),
  findSubordinates: jest.fn(),
  isDescendantOf: jest.fn(),
}));

jest.unstable_mockModule("../../src/models/verificationToken.js", () => ({
  createToken: jest.fn(),
  findLatest: jest.fn(),
  findLatestActive: jest.fn(),
  incrementAttempts: jest.fn(),
  markConsumed: jest.fn(),
  invalidateActive: jest.fn(),
}));

// mailer dimock supaya pengujian tidak pernah mengirim email sungguhan
const mockSendMail = jest.fn(() => Promise.resolve());

jest.unstable_mockModule("../../src/helpers/mailer.js", () => ({
  sendMail: mockSendMail,
  isSecretLoggingAllowed: () => true,
}));

const mockLoggerWarn = jest.fn();

jest.unstable_mockModule("../../src/config/logger.js", () => ({
  logger: { info: jest.fn(), warn: mockLoggerWarn, error: jest.fn() },
}));

const userModel = await import("../../src/models/user.js");
const employeeModel = await import("../../src/models/employee.js");
const tokenModel = await import("../../src/models/verificationToken.js");
const { hashPassword, verifyPassword } =
  await import("../../src/helpers/password.js");
const { createToken: buatJwt } = await import("../../src/helpers/jwt.js");
const { env } = await import("../../src/config/env.js");
const { app } = await import("../../src/app.js");

const USER_ID = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";
const TOKEN_ID = "99999999-9999-4999-8999-999999999999";
const EMAIL = "ismail@awan.io";
const NILAI_TOKEN = "a".repeat(64);
const PASSWORD_BARU = "passwordbaru456";

const fakeUser = {
  id: USER_ID,
  email: EMAIL,
  role: "employee",
  is_active: true,
  terms_accepted_at: new Date(),
  approved_at: new Date(),
  approved_by: null,
  last_login_at: null,
  must_change_password: false,
  email_verified_at: new Date(),
  password_changed_at: null,
  deleted_at: null,
  created_at: new Date(),
  updated_at: new Date(),
};

const fakeEmployee = {
  id: EMPLOYEE_ID,
  user_id: USER_ID,
  employee_number: "001",
  full_name: "Ismail Muhammad",
  phone: "+628123456789",
  gender: "male",
};

// hash argon2 sungguhan supaya jalur verifikasi token benar-benar diuji
let hashToken: string;

beforeAll(async () => {
  hashToken = await hashPassword(NILAI_TOKEN);
});

function fakeToken(override: Record<string, unknown> = {}) {
  return {
    id: TOKEN_ID,
    email: EMAIL,
    purpose: "password_reset",
    token_hash: hashToken,
    expires_at: new Date(Date.now() + 900_000),
    consumed_at: null,
    attempts: 0,
    ip_address: "127.0.0.1",
    user_agent: "jest",
    created_at: new Date(),
    ...override,
  };
}

const resetBody = {
  email: EMAIL,
  token: NILAI_TOKEN,
  password: PASSWORD_BARU,
  password_confirmation: PASSWORD_BARU,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSendMail.mockResolvedValue(undefined as never);
  (tokenModel.createToken as jest.Mock).mockResolvedValue(fakeToken() as never);
  (tokenModel.invalidateActive as jest.Mock).mockResolvedValue(0 as never);
  (tokenModel.markConsumed as jest.Mock).mockResolvedValue(
    fakeToken() as never,
  );
  (tokenModel.incrementAttempts as jest.Mock).mockResolvedValue(
    fakeToken({ attempts: 1 }) as never,
  );
  (employeeModel.findByUserId as jest.Mock).mockResolvedValue(
    fakeEmployee as never,
  );
  (userModel.updatePassword as jest.Mock).mockResolvedValue(undefined as never);
});

describe("POST /api/v1/auth/forgot-password", () => {
  it("menolak body kosong", async () => {
    const res = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("menerbitkan token untuk akun yang terdaftar dan aktif", async () => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(fakeUser as never);

    const res = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: EMAIL });

    expect(res.status).toBe(200);
    expect(tokenModel.createToken).toHaveBeenCalled();
  });

  it("memakai purpose password_reset", async () => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(fakeUser as never);

    await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: EMAIL });

    const [data] = (tokenModel.createToken as jest.Mock).mock.calls[0] as [
      Record<string, unknown>,
    ];

    expect(data.purpose).toBe("password_reset");
  });

  it("menyimpan token dalam bentuk hash argon2, bukan teks biasa", async () => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(fakeUser as never);

    await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: EMAIL });

    const [data] = (tokenModel.createToken as jest.Mock).mock.calls[0] as [
      { token_hash: string },
    ];

    expect(data.token_hash).toContain("$argon2id$");
  });

  it("memberi masa berlaku lima belas menit", async () => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(fakeUser as never);

    await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: EMAIL });

    const [data] = (tokenModel.createToken as jest.Mock).mock.calls[0] as [
      { expires_at: Date },
    ];

    const diffMinutes = data.expires_at.getTime() - Date.now();

    expect(diffMinutes).toBeGreaterThan(14 * 60_000);
    expect(diffMinutes).toBeLessThanOrEqual(15 * 60_000);
  });

  it("membatalkan token reset aktif sebelumnya", async () => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(fakeUser as never);

    await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: EMAIL });

    expect(tokenModel.invalidateActive).toHaveBeenCalledWith(
      EMAIL,
      "password_reset",
    );
  });

  it("mencatat alamat ip dan user agent peminta", async () => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(fakeUser as never);

    await request(app)
      .post("/api/v1/auth/forgot-password")
      .set("User-Agent", "peramban-uji")
      .send({ email: EMAIL });

    const [data] = (tokenModel.createToken as jest.Mock).mock.calls[0] as [
      Record<string, unknown>,
    ];

    expect(data.user_agent).toBe("peramban-uji");
    expect(data.ip_address).toBeTruthy();
  });

  it("mengirim tautan yang memuat alamat aplikasi, token, dan email", async () => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(fakeUser as never);

    await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: EMAIL });

    const [surat] = mockSendMail.mock.calls[0] as unknown as [{ html: string }];

    expect(surat.html).toContain(`${env.APP_URL}/reset-password?token=`);
    expect(surat.html).toContain(encodeURIComponent(EMAIL));
  });

  it("mengirim token asli lewat email, bukan hashnya", async () => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(fakeUser as never);

    await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: EMAIL });

    const [surat] = mockSendMail.mock.calls[0] as unknown as [{ html: string }];
    const [data] = (tokenModel.createToken as jest.Mock).mock.calls[0] as [
      { token_hash: string },
    ];

    expect(surat.html).not.toContain(data.token_hash);
    expect(surat.html).toMatch(/token=[0-9a-f]{64}/);
  });

  it("memberi respons identik untuk email yang tidak terdaftar", async () => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(fakeUser as never);
    const terdaftar = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: EMAIL });

    (userModel.findByEmail as jest.Mock).mockResolvedValue(null as never);
    const tidakTerdaftar = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "tidakada@awan.io" });

    expect(terdaftar.status).toBe(tidakTerdaftar.status);
    expect(terdaftar.body).toEqual(tidakTerdaftar.body);
  });

  it("tidak menerbitkan token untuk email yang tidak terdaftar", async () => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(null as never);

    await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "tidakada@awan.io" });

    expect(tokenModel.createToken).not.toHaveBeenCalled();
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("tidak menerbitkan token untuk akun yang dinonaktifkan", async () => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue({
      ...fakeUser,
      is_active: false,
    } as never);

    const res = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: EMAIL });

    expect(res.status).toBe(200);
    expect(tokenModel.createToken).not.toHaveBeenCalled();
  });

  it("tetap berhasil meski pengiriman email gagal", async () => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(fakeUser as never);
    mockSendMail.mockRejectedValue(new Error("smtp mati") as never);

    const res = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: EMAIL });

    expect(res.status).toBe(200);
  });

  it("mencetak tautan reset ke log saat pengiriman email gagal", async () => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(fakeUser as never);
    mockSendMail.mockRejectedValue(new Error("smtp mati") as never);

    await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: EMAIL });

    const cadangan = mockLoggerWarn.mock.calls.find(([data]) =>
      Object.hasOwn(data as object, "reset_link"),
    ) as [{ email: string; reset_link: string }, string];

    expect(cadangan).toBeDefined();
    expect(cadangan[0].email).toBe(EMAIL);
    expect(cadangan[0].reset_link).toContain(
      `${env.APP_URL}/reset-password?token=`,
    );
    expect(cadangan[0].reset_link).toMatch(/token=[0-9a-f]{64}/);
  });

  it("tidak mencetak tautan reset saat pengiriman email berhasil", async () => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(fakeUser as never);

    await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: EMAIL });

    const cadangan = mockLoggerWarn.mock.calls.find(([data]) =>
      Object.hasOwn(data as object, "reset_link"),
    );

    expect(cadangan).toBeUndefined();
  });

  it("tidak mencetak tautan untuk email yang tidak terdaftar", async () => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(null as never);
    mockSendMail.mockRejectedValue(new Error("smtp mati") as never);

    await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "tidakada@awan.io" });

    const cadangan = mockLoggerWarn.mock.calls.find(([data]) =>
      Object.hasOwn(data as object, "reset_link"),
    );

    expect(cadangan).toBeUndefined();
  });

  it("tidak pernah menyertakan password di dalam email", async () => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(fakeUser as never);

    await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: EMAIL });

    const [surat] = mockSendMail.mock.calls[0] as unknown as [
      { html: string; subject: string },
    ];

    expect(surat.html).not.toContain("$argon2id$");
    expect(surat.subject).not.toContain("password123");
  });
});

describe("POST /api/v1/auth/reset-password", () => {
  beforeEach(() => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(fakeUser as never);
    (tokenModel.findLatest as jest.Mock).mockResolvedValue(
      fakeToken() as never,
    );
  });

  it("menolak body kosong", async () => {
    const res = await request(app).post("/api/v1/auth/reset-password").send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("menolak konfirmasi password yang berbeda", async () => {
    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ ...resetBody, password_confirmation: "passwordlain789" });

    expect(res.status).toBe(400);
    expect(userModel.updatePassword).not.toHaveBeenCalled();
  });

  it("mengubah password saat token benar", async () => {
    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send(resetBody);

    expect(res.status).toBe(200);
    expect(userModel.updatePassword).toHaveBeenCalled();
  });

  it("menyimpan password baru dalam bentuk hash argon2", async () => {
    await request(app).post("/api/v1/auth/reset-password").send(resetBody);

    const [id, stored] = (userModel.updatePassword as jest.Mock).mock
      .calls[0] as [string, string];

    expect(id).toBe(USER_ID);
    expect(stored).not.toBe(PASSWORD_BARU);
    expect(stored).toContain("$argon2id$");
  });

  it("menyimpan hash yang benar-benar cocok dengan password baru", async () => {
    await request(app).post("/api/v1/auth/reset-password").send(resetBody);

    const [, stored] = (userModel.updatePassword as jest.Mock).mock
      .calls[0] as [string, string];

    await expect(verifyPassword(stored, PASSWORD_BARU)).resolves.toBe(true);
  });

  it("menandai token sebagai sudah terpakai", async () => {
    await request(app).post("/api/v1/auth/reset-password").send(resetBody);

    expect(tokenModel.markConsumed).toHaveBeenCalledWith(TOKEN_ID);
  });

  it("tidak menerbitkan JWT sehingga pengguna harus login ulang", async () => {
    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send(resetBody);

    expect(res.body.data).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("token");
  });

  it("mengirim pemberitahuan tanpa menyertakan password baru", async () => {
    await request(app).post("/api/v1/auth/reset-password").send(resetBody);

    const [surat] = mockSendMail.mock.calls[0] as unknown as [
      { to: string; subject: string; html: string },
    ];

    expect(surat.to).toBe(EMAIL);
    expect(surat.html).not.toContain(PASSWORD_BARU);
    expect(surat.subject).not.toContain(PASSWORD_BARU);
  });

  it("tetap berhasil meski pengiriman pemberitahuan gagal", async () => {
    mockSendMail.mockRejectedValue(new Error("smtp mati") as never);

    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send(resetBody);

    expect(res.status).toBe(200);
    expect(userModel.updatePassword).toHaveBeenCalled();
  });

  it("menolak token yang salah", async () => {
    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ ...resetBody, token: "b".repeat(64) });

    expect(res.status).toBe(400);
    expect(userModel.updatePassword).not.toHaveBeenCalled();
  });

  it("menaikkan penghitung percobaan saat token salah", async () => {
    await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ ...resetBody, token: "b".repeat(64) });

    expect(tokenModel.incrementAttempts).toHaveBeenCalledWith(TOKEN_ID);
  });

  it("menolak token yang sudah kedaluwarsa", async () => {
    (tokenModel.findLatest as jest.Mock).mockResolvedValue(
      fakeToken({ expires_at: new Date(Date.now() - 1000) }) as never,
    );

    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send(resetBody);

    expect(res.status).toBe(400);
    expect(userModel.updatePassword).not.toHaveBeenCalled();
  });

  it("menolak token yang sudah pernah dipakai", async () => {
    (tokenModel.findLatest as jest.Mock).mockResolvedValue(
      fakeToken({ consumed_at: new Date() }) as never,
    );

    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send(resetBody);

    expect(res.status).toBe(400);
    expect(userModel.updatePassword).not.toHaveBeenCalled();
  });

  it("menolak token setelah lima kali percobaan gagal", async () => {
    (tokenModel.findLatest as jest.Mock).mockResolvedValue(
      fakeToken({ attempts: 5 }) as never,
    );

    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send(resetBody);

    expect(res.status).toBe(400);
    expect(userModel.updatePassword).not.toHaveBeenCalled();
  });

  it("menolak email yang tidak punya token reset", async () => {
    (tokenModel.findLatest as jest.Mock).mockResolvedValue(null as never);

    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send(resetBody);

    expect(res.status).toBe(400);
  });

  it("memberi pesan yang sama untuk semua jenis kegagalan token", async () => {
    const state = [
      null,
      fakeToken({ consumed_at: new Date() }),
      fakeToken({ expires_at: new Date(Date.now() - 1000) }),
      fakeToken({ attempts: 5 }),
    ];

    const message = new Set<string>();

    for (const token of state) {
      (tokenModel.findLatest as jest.Mock).mockResolvedValue(token as never);

      const res = await request(app)
        .post("/api/v1/auth/reset-password")
        .send(resetBody);

      message.add(res.body.message);
    }

    expect(message.size).toBe(1);
  });

  it("hanya memakai token dengan purpose password_reset", async () => {
    await request(app).post("/api/v1/auth/reset-password").send(resetBody);

    expect(tokenModel.findLatest).toHaveBeenCalledWith(EMAIL, "password_reset");
  });
});

describe("sesi lama setelah password diubah", () => {
  const tokenLama = buatJwt({
    id: USER_ID,
    email: EMAIL,
    role: "employee",
  });

  it("menolak token JWT yang diterbitkan sebelum password diubah", async () => {
    (userModel.findSessionInfo as jest.Mock).mockResolvedValue({
      id: USER_ID,
      password_changed_at: new Date(Date.now() + 60_000),
    } as never);

    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${tokenLama}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toContain("password telah diubah");
  });

  it("tidak menjalankan controller saat sesi sudah dibatalkan", async () => {
    (userModel.findSessionInfo as jest.Mock).mockResolvedValue({
      id: USER_ID,
      password_changed_at: new Date(Date.now() + 60_000),
    } as never);

    await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${tokenLama}`);

    expect(userModel.findById).not.toHaveBeenCalled();
  });

  it("masih menerima token yang diterbitkan setelah password diubah", async () => {
    (userModel.findSessionInfo as jest.Mock).mockResolvedValue({
      id: USER_ID,
      password_changed_at: new Date(Date.now() - 60_000),
    } as never);
    (userModel.findById as jest.Mock).mockResolvedValue(fakeUser as never);

    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${tokenLama}`);

    expect(res.status).toBe(200);
  });
});
