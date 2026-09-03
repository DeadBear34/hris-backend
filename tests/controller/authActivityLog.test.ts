import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import request from "supertest";

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

jest.unstable_mockModule("../../src/config/databaseConnection.js", () => ({
  pool: {
    connect: jest.fn(() => Promise.resolve(mockClient)),
    query: jest.fn(),
  },
}));

jest.unstable_mockModule("../../src/config/logger.js", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
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
  countSubordinates: jest.fn(),
  listEmployees: jest.fn(),
}));

jest.unstable_mockModule("../../src/models/verificationToken.js", () => ({
  createToken: jest.fn(),
  findLatest: jest.fn(),
  findLatestActive: jest.fn(),
  incrementAttempts: jest.fn(),
  markConsumed: jest.fn(),
  invalidateActive: jest.fn(),
}));

jest.unstable_mockModule("../../src/helpers/mailer.js", () => ({
  sendMail: jest.fn(() => Promise.resolve()),
  isSecretLoggingAllowed: () => true,
}));

const userModel = await import("../../src/models/user.js");
const employeeModel = await import("../../src/models/employee.js");
const { hashPassword } = await import("../../src/helpers/password.js");
const { logger } = await import("../../src/config/logger.js");
const { app } = await import("../../src/app.js");

const USER_ID = "11111111-1111-1111-1111-111111111111";
const EMPLOYEE_ID = "22222222-2222-2222-2222-222222222222";

const fakeUser = {
  id: USER_ID,
  email: "ismail@awan.io",
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
  birth_date: null,
  address: null,
  photo_path: null,
  department_id: null,
  position_id: null,
  manager_id: null,
  employment_status: "probation",
  join_date: new Date(),
  resign_date: null,
  is_active: true,
  deleted_at: null,
  created_at: new Date(),
  updated_at: new Date(),
};

function catatanTerakhir(mock: jest.Mock) {
  const panggilan = mock.mock.calls.at(-1) as [
    { activity: Record<string, unknown> },
    string,
  ];

  return panggilan[0].activity;
}

async function siapkanLogin(override: Record<string, unknown> = {}) {
  const hashed = await hashPassword("password123");

  (userModel.findByEmail as jest.Mock).mockResolvedValue({
    ...fakeUser,
    password: hashed,
    ...override,
  } as never);

  (employeeModel.findByUserId as jest.Mock).mockResolvedValue(
    fakeEmployee as never,
  );
}

function login(password = "password123", email = "ismail@awan.io") {
  return request(app)
    .post("/api/v1/auth/login")
    .set("User-Agent", "PengujiHRIS/1.0")
    .send({ email, password });
}

describe("catatan aktivitas login", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.query.mockResolvedValue({ rows: [] } as never);
  });

  it("mencatat login yang berhasil beserta pelakunya", async () => {
    await siapkanLogin();

    const res = await login();

    expect(res.status).toBe(200);

    const note = catatanTerakhir(logger.info as jest.Mock);

    expect(note.action).toBe("auth.login");
    expect(note.status).toBe("success");
    expect(note.entity).toBe("user");
    expect(note.entity_id).toBe(USER_ID);
    expect(note.actor_user_id).toBe(USER_ID);
    expect(note.actor_email).toBe("ismail@awan.io");
    expect(note.actor_name).toBe("Ismail Muhammad");
    expect(note.user_agent).toBe("PengujiHRIS/1.0");
  });

  it("mencatat email tidak terdaftar tanpa pelaku", async () => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(null as never);

    const res = await login("password123", "tidakada@awan.io");

    expect(res.status).toBe(401);

    const note = catatanTerakhir(logger.warn as jest.Mock);

    expect(note.action).toBe("auth.login");
    expect(note.status).toBe("failed");
    expect(note.actor_user_id).toBeNull();
    expect(note.actor_email).toBe("tidakada@awan.io");
    expect((note.metadata as { reason: string }).reason).toBe(
      "email_tidak_terdaftar",
    );
  });

  it("membedakan sebab gagal walau pesan ke pengguna disamakan", async () => {
    await siapkanLogin();

    const res = await login("passwordsalah");

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Email atau password salah");

    const note = catatanTerakhir(logger.warn as jest.Mock);

    expect((note.metadata as { reason: string }).reason).toBe("password_salah");
    expect(note.actor_user_id).toBe(USER_ID);
  });

  it.each([
    [{ email_verified_at: null }, "email_belum_diverifikasi"],
    [{ approved_at: null }, "belum_disetujui"],
    [{ is_active: false }, "akun_nonaktif"],
  ])("mencatat sebab %#", async (override, reason) => {
    await siapkanLogin(override);

    const res = await login();

    expect(res.status).toBe(401);
    expect(
      (catatanTerakhir(logger.warn as jest.Mock).metadata as { reason: string })
        .reason,
    ).toBe(reason);
  });

  it("tidak pernah menuliskan password ke catatan", async () => {
    await siapkanLogin();
    await login("passwordsalah");

    const semua = JSON.stringify([
      ...(logger.info as jest.Mock).mock.calls,
      ...(logger.warn as jest.Mock).mock.calls,
    ]);

    expect(semua).not.toContain("passwordsalah");
    expect(semua).not.toContain("password123");
  });
});

describe("catatan aktivitas register", () => {
  const body = {
    email: "baru@awan.io",
    password: "password123",
    full_name: "Karyawan Baru",
    phone: "+628123456789",
    gender: "male",
    terms_accepted: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.query.mockResolvedValue({ rows: [] } as never);
  });

  function daftar() {
    return request(app).post("/api/v1/auth/register").send(body);
  }

  it("mencatat pendaftaran baru sebagai berhasil", async () => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(null as never);
    (userModel.insertUser as jest.Mock).mockResolvedValue({
      ...fakeUser,
      email: body.email,
    } as never);
    (employeeModel.insertEmployee as jest.Mock).mockResolvedValue({
      ...fakeEmployee,
      full_name: body.full_name,
    } as never);

    const res = await daftar();

    expect(res.status).toBe(201);

    const note = catatanTerakhir(logger.info as jest.Mock);

    expect(note.action).toBe("auth.register");
    expect(note.status).toBe("success");
    expect(note.actor_user_id).toBe(USER_ID);
    expect(note.actor_email).toBe(body.email);
    expect(note.entity_id).toBe(USER_ID);
    expect((note.metadata as { employee_id: string }).employee_id).toBe(
      EMPLOYEE_ID,
    );
  });

  it("mencatat penolakan karena email sudah terdaftar", async () => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(fakeUser as never);

    const res = await daftar();

    expect(res.status).toBe(409);

    const note = catatanTerakhir(logger.warn as jest.Mock);

    expect(note.action).toBe("auth.register");
    expect(note.status).toBe("failed");
    expect((note.metadata as { reason: string }).reason).toBe(
      "email_sudah_terdaftar",
    );
    expect(userModel.insertUser).not.toHaveBeenCalled();
  });

  it("menandai pengiriman ulang kode sebagai bukan akun baru", async () => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue({
      ...fakeUser,
      email_verified_at: null,
    } as never);

    const res = await daftar();

    expect(res.status).toBe(200);

    const note = catatanTerakhir(logger.info as jest.Mock);

    expect(note.action).toBe("auth.register");
    expect((note.metadata as { resent: boolean }).resent).toBe(true);
    expect(userModel.insertUser).not.toHaveBeenCalled();
  });
});
