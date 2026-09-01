import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
} from "@jest/globals";
import request from "supertest";

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

jest.unstable_mockModule("../../src/config/databaseConnection.js", () => ({
  pool: {
    connect: jest.fn(() => Promise.resolve(mockClient)),
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
const { app } = await import("../../src/app.js");

const USER_ID = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";
const TOKEN_ID = "99999999-9999-4999-8999-999999999999";
const EMAIL = "ismail@awan.io";
const KODE = "123456";

const registerBody = {
  email: EMAIL,
  password: "password123",
  full_name: "Ismail Muhammad",
  phone: "+628123456789",
  gender: "male",
  terms_accepted: true,
};

const fakeUser = {
  id: USER_ID,
  email: EMAIL,
  role: "employee",
  is_active: false,
  terms_accepted_at: new Date(),
  approved_at: null,
  approved_by: null,
  last_login_at: null,
  must_change_password: false,
  email_verified_at: null,
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
  employment_status: "probation",
  join_date: new Date(),
  is_active: true,
};

// hash argon2 sungguhan supaya jalur verifikasi kode benar-benar diuji
let hashKode: string;

beforeAll(async () => {
  hashKode = await hashPassword(KODE);
});

function fakeToken(override: Record<string, unknown> = {}) {
  return {
    id: TOKEN_ID,
    email: EMAIL,
    purpose: "email_verification",
    token_hash: hashKode,
    expires_at: new Date(Date.now() + 600_000),
    consumed_at: null,
    attempts: 0,
    ip_address: "127.0.0.1",
    user_agent: "jest",
    created_at: new Date(),
    ...override,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // clearAllMocks tidak menghapus implementasi, jadi mailer dikembalikan
  // ke keadaan berhasil setiap kali
  mockSendMail.mockResolvedValue(undefined as never);
  mockClient.query.mockResolvedValue({ rows: [] } as never);
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
});

describe("POST /api/v1/auth/register menerbitkan kode verifikasi", () => {
  function siapkanRegisterBaru() {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(null as never);
    (userModel.insertUser as jest.Mock).mockResolvedValue(fakeUser as never);
    (employeeModel.insertEmployee as jest.Mock).mockResolvedValue(
      fakeEmployee as never,
    );
  }

  it("membuat akun dengan email yang belum terverifikasi", async () => {
    siapkanRegisterBaru();

    const res = await request(app)
      .post("/api/v1/auth/register")
      .send(registerBody);

    expect(res.status).toBe(201);
    expect(res.body.data.verification_required).toBe(true);
  });

  it("menyimpan token verifikasi dengan purpose email_verification", async () => {
    siapkanRegisterBaru();

    await request(app).post("/api/v1/auth/register").send(registerBody);

    const [data] = (tokenModel.createToken as jest.Mock).mock.calls[0] as [
      Record<string, unknown>,
    ];

    expect(data.purpose).toBe("email_verification");
    expect(data.email).toBe(EMAIL);
  });

  it("menyimpan kode dalam bentuk hash argon2, bukan teks biasa", async () => {
    siapkanRegisterBaru();

    await request(app).post("/api/v1/auth/register").send(registerBody);

    const [data] = (tokenModel.createToken as jest.Mock).mock.calls[0] as [
      { token_hash: string },
    ];

    expect(data.token_hash).toContain("$argon2id$");
    expect(data.token_hash).not.toMatch(/^\d{6}$/);
  });

  it("memberi masa berlaku sepuluh menit", async () => {
    siapkanRegisterBaru();

    await request(app).post("/api/v1/auth/register").send(registerBody);

    const [data] = (tokenModel.createToken as jest.Mock).mock.calls[0] as [
      { expires_at: Date },
    ];

    const diffMinutes = data.expires_at.getTime() - Date.now();

    expect(diffMinutes).toBeGreaterThan(9 * 60_000);
    expect(diffMinutes).toBeLessThanOrEqual(10 * 60_000);
  });

  it("mencatat alamat ip dan user agent peminta", async () => {
    siapkanRegisterBaru();

    await request(app)
      .post("/api/v1/auth/register")
      .set("User-Agent", "peramban-uji")
      .send(registerBody);

    const [data] = (tokenModel.createToken as jest.Mock).mock.calls[0] as [
      Record<string, unknown>,
    ];

    expect(data.user_agent).toBe("peramban-uji");
    expect(data.ip_address).toBeTruthy();
  });

  it("mengirim kode lewat email", async () => {
    siapkanRegisterBaru();

    await request(app).post("/api/v1/auth/register").send(registerBody);

    const [surat] = mockSendMail.mock.calls[0] as unknown as [
      { to: string; html: string },
    ];

    expect(surat.to).toBe(EMAIL);
    expect(surat.html).toContain("Ismail Muhammad");
  });

  it("tidak pernah menyertakan password di dalam email", async () => {
    siapkanRegisterBaru();

    await request(app).post("/api/v1/auth/register").send(registerBody);

    const [surat] = mockSendMail.mock.calls[0] as unknown as [
      { subject: string; html: string },
    ];

    expect(surat.html).not.toContain("password123");
    expect(surat.subject).not.toContain("password123");
  });

  it("tetap berhasil meski pengiriman email gagal", async () => {
    siapkanRegisterBaru();
    mockSendMail.mockRejectedValue(new Error("smtp mati") as never);

    const res = await request(app)
      .post("/api/v1/auth/register")
      .send(registerBody);

    expect(res.status).toBe(201);
  });

  it("tidak membatalkan transaksi saat pengiriman email gagal", async () => {
    siapkanRegisterBaru();
    mockSendMail.mockRejectedValue(new Error("smtp mati") as never);

    await request(app).post("/api/v1/auth/register").send(registerBody);

    expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
    expect(mockClient.query).not.toHaveBeenCalledWith("ROLLBACK");
  });

  it("mencetak kode verifikasi ke log saat pengiriman email gagal", async () => {
    siapkanRegisterBaru();
    mockSendMail.mockRejectedValue(new Error("smtp mati") as never);

    await request(app).post("/api/v1/auth/register").send(registerBody);

    const cadangan = mockLoggerWarn.mock.calls.find(([data]) =>
      Object.hasOwn(data as object, "kode_verifikasi"),
    ) as [{ email: string; kode_verifikasi: string }, string];

    expect(cadangan).toBeDefined();
    expect(cadangan[0].email).toBe(EMAIL);
    expect(cadangan[0].kode_verifikasi).toMatch(/^\d{6}$/);
  });

  it("mencetak kode yang sama dengan yang hashnya tersimpan", async () => {
    siapkanRegisterBaru();
    mockSendMail.mockRejectedValue(new Error("smtp mati") as never);

    await request(app).post("/api/v1/auth/register").send(registerBody);

    const [data] = (tokenModel.createToken as jest.Mock).mock.calls[0] as [
      { token_hash: string },
    ];
    const cadangan = mockLoggerWarn.mock.calls.find(([d]) =>
      Object.hasOwn(d as object, "kode_verifikasi"),
    ) as [{ kode_verifikasi: string }, string];

    await expect(
      verifyPassword(data.token_hash, cadangan[0].kode_verifikasi),
    ).resolves.toBe(true);
  });

  it("tidak mencetak kode ke log saat pengiriman email berhasil", async () => {
    siapkanRegisterBaru();

    await request(app).post("/api/v1/auth/register").send(registerBody);

    const cadangan = mockLoggerWarn.mock.calls.find(([data]) =>
      Object.hasOwn(data as object, "kode_verifikasi"),
    );

    expect(cadangan).toBeUndefined();
  });
});

describe("POST /api/v1/auth/register untuk email yang belum terverifikasi", () => {
  it("mengirim ulang kode alih-alih menolak dengan konflik", async () => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(fakeUser as never);

    const res = await request(app)
      .post("/api/v1/auth/register")
      .send(registerBody);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.verification_required).toBe(true);
  });

  it("tidak membuat akun baru", async () => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(fakeUser as never);

    await request(app).post("/api/v1/auth/register").send(registerBody);

    expect(userModel.insertUser).not.toHaveBeenCalled();
    expect(employeeModel.insertEmployee).not.toHaveBeenCalled();
  });

  it("membatalkan kode lama sebelum menerbitkan yang baru", async () => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(fakeUser as never);

    await request(app).post("/api/v1/auth/register").send(registerBody);

    expect(tokenModel.invalidateActive).toHaveBeenCalledWith(
      EMAIL,
      "email_verification",
    );
    expect(tokenModel.createToken).toHaveBeenCalled();
  });

  it("tetap menolak email yang sudah terverifikasi", async () => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue({
      ...fakeUser,
      email_verified_at: new Date(),
    } as never);

    const res = await request(app)
      .post("/api/v1/auth/register")
      .send(registerBody);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CONFLICT");
    expect(tokenModel.createToken).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/auth/verify-email", () => {
  beforeEach(() => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(fakeUser as never);
    (userModel.setEmailVerified as jest.Mock).mockResolvedValue({
      ...fakeUser,
      email_verified_at: new Date(),
    } as never);
  });

  it("menolak body kosong", async () => {
    const res = await request(app).post("/api/v1/auth/verify-email").send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("menolak kode yang bukan enam digit angka", async () => {
    const res = await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ email: EMAIL, code: "abcdef" });

    expect(res.status).toBe(400);
    expect(tokenModel.findLatest).not.toHaveBeenCalled();
  });

  it("menerima kode yang benar", async () => {
    (tokenModel.findLatest as jest.Mock).mockResolvedValue(
      fakeToken() as never,
    );

    const res = await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ email: EMAIL, code: KODE });

    expect(res.status).toBe(200);
    expect(res.body.data.email_verified).toBe(true);
  });

  it("menandai token terpakai dan email terverifikasi", async () => {
    (tokenModel.findLatest as jest.Mock).mockResolvedValue(
      fakeToken() as never,
    );

    await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ email: EMAIL, code: KODE });

    expect(tokenModel.markConsumed).toHaveBeenCalledWith(TOKEN_ID);
    expect(userModel.setEmailVerified).toHaveBeenCalledWith(USER_ID);
  });

  it("tidak menaikkan penghitung percobaan saat kode benar", async () => {
    (tokenModel.findLatest as jest.Mock).mockResolvedValue(
      fakeToken() as never,
    );

    await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ email: EMAIL, code: KODE });

    expect(tokenModel.incrementAttempts).not.toHaveBeenCalled();
  });

  it("menolak kode yang salah", async () => {
    (tokenModel.findLatest as jest.Mock).mockResolvedValue(
      fakeToken() as never,
    );

    const res = await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ email: EMAIL, code: "654321" });

    expect(res.status).toBe(400);
    expect(userModel.setEmailVerified).not.toHaveBeenCalled();
  });

  it("menaikkan penghitung percobaan saat kode salah", async () => {
    (tokenModel.findLatest as jest.Mock).mockResolvedValue(
      fakeToken() as never,
    );

    await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ email: EMAIL, code: "654321" });

    expect(tokenModel.incrementAttempts).toHaveBeenCalledWith(TOKEN_ID);
  });

  it("menolak kode yang sudah kedaluwarsa", async () => {
    (tokenModel.findLatest as jest.Mock).mockResolvedValue(
      fakeToken({ expires_at: new Date(Date.now() - 1000) }) as never,
    );

    const res = await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ email: EMAIL, code: KODE });

    expect(res.status).toBe(400);
    expect(userModel.setEmailVerified).not.toHaveBeenCalled();
    expect(tokenModel.incrementAttempts).toHaveBeenCalled();
  });

  it("menolak kode yang sudah pernah dipakai", async () => {
    (tokenModel.findLatest as jest.Mock).mockResolvedValue(
      fakeToken({ consumed_at: new Date() }) as never,
    );

    const res = await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ email: EMAIL, code: KODE });

    expect(res.status).toBe(400);
    expect(userModel.setEmailVerified).not.toHaveBeenCalled();
  });

  it("tidak menaikkan penghitung pada token yang sudah terpakai", async () => {
    (tokenModel.findLatest as jest.Mock).mockResolvedValue(
      fakeToken({ consumed_at: new Date() }) as never,
    );

    await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ email: EMAIL, code: KODE });

    expect(tokenModel.incrementAttempts).not.toHaveBeenCalled();
  });

  it("menolak kode setelah lima kali percobaan gagal", async () => {
    (tokenModel.findLatest as jest.Mock).mockResolvedValue(
      fakeToken({ attempts: 5 }) as never,
    );

    const res = await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ email: EMAIL, code: KODE });

    expect(res.status).toBe(400);
    expect(userModel.setEmailVerified).not.toHaveBeenCalled();
  });

  it("masih menerima kode benar pada percobaan keempat", async () => {
    (tokenModel.findLatest as jest.Mock).mockResolvedValue(
      fakeToken({ attempts: 4 }) as never,
    );

    const res = await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ email: EMAIL, code: KODE });

    expect(res.status).toBe(200);
  });

  it("menolak email yang tidak punya token sama sekali", async () => {
    (tokenModel.findLatest as jest.Mock).mockResolvedValue(null as never);

    const res = await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ email: EMAIL, code: KODE });

    expect(res.status).toBe(400);
  });

  it("memberi pesan yang sama untuk semua jenis kegagalan", async () => {
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
        .post("/api/v1/auth/verify-email")
        .send({ email: EMAIL, code: KODE });

      message.add(res.body.message);
    }

    expect(message.size).toBe(1);
  });

  it("tidak menandai ulang email yang sudah terverifikasi", async () => {
    (tokenModel.findLatest as jest.Mock).mockResolvedValue(
      fakeToken() as never,
    );
    (userModel.findByEmail as jest.Mock).mockResolvedValue({
      ...fakeUser,
      email_verified_at: new Date(),
    } as never);

    const res = await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ email: EMAIL, code: KODE });

    expect(res.status).toBe(200);
    expect(userModel.setEmailVerified).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/auth/resend-verification", () => {
  beforeEach(() => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(fakeUser as never);
    (tokenModel.findLatest as jest.Mock).mockResolvedValue(null as never);
  });

  it("menolak body kosong", async () => {
    const res = await request(app)
      .post("/api/v1/auth/resend-verification")
      .send({});

    expect(res.status).toBe(400);
  });

  it("menerbitkan kode baru dan mengirimnya", async () => {
    const res = await request(app)
      .post("/api/v1/auth/resend-verification")
      .send({ email: EMAIL });

    expect(res.status).toBe(200);
    expect(tokenModel.createToken).toHaveBeenCalled();
    expect(mockSendMail).toHaveBeenCalled();
  });

  it("membatalkan kode aktif sebelumnya", async () => {
    await request(app)
      .post("/api/v1/auth/resend-verification")
      .send({ email: EMAIL });

    expect(tokenModel.invalidateActive).toHaveBeenCalledWith(
      EMAIL,
      "email_verification",
    );
  });

  it("menolak permintaan yang datang sebelum enam puluh detik", async () => {
    (tokenModel.findLatest as jest.Mock).mockResolvedValue(
      fakeToken({ created_at: new Date(Date.now() - 5_000) }) as never,
    );

    const res = await request(app)
      .post("/api/v1/auth/resend-verification")
      .send({ email: EMAIL });

    expect(res.status).toBe(429);
    expect(res.body.code).toBe("TOO_MANY_REQUESTS");
    expect(tokenModel.createToken).not.toHaveBeenCalled();
  });

  it("menyebutkan sisa waktu tunggu", async () => {
    (tokenModel.findLatest as jest.Mock).mockResolvedValue(
      fakeToken({ created_at: new Date(Date.now() - 10_000) }) as never,
    );

    const res = await request(app)
      .post("/api/v1/auth/resend-verification")
      .send({ email: EMAIL });

    expect(res.body.message).toMatch(/\d+ detik/);
  });

  it("mengizinkan permintaan setelah jeda terlewati", async () => {
    (tokenModel.findLatest as jest.Mock).mockResolvedValue(
      fakeToken({ created_at: new Date(Date.now() - 61_000) }) as never,
    );

    const res = await request(app)
      .post("/api/v1/auth/resend-verification")
      .send({ email: EMAIL });

    expect(res.status).toBe(200);
    expect(tokenModel.createToken).toHaveBeenCalled();
  });

  it("memberi pesan yang sama untuk email yang tidak terdaftar", async () => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(fakeUser as never);
    const terdaftar = await request(app)
      .post("/api/v1/auth/resend-verification")
      .send({ email: EMAIL });

    jest.clearAllMocks();
    (tokenModel.findLatest as jest.Mock).mockResolvedValue(null as never);
    (userModel.findByEmail as jest.Mock).mockResolvedValue(null as never);
    const tidakTerdaftar = await request(app)
      .post("/api/v1/auth/resend-verification")
      .send({ email: "tidakada@awan.io" });

    expect(terdaftar.status).toBe(tidakTerdaftar.status);
    expect(terdaftar.body.message).toBe(tidakTerdaftar.body.message);
  });

  it("tidak menerbitkan kode untuk email yang tidak terdaftar", async () => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(null as never);

    await request(app)
      .post("/api/v1/auth/resend-verification")
      .send({ email: "tidakada@awan.io" });

    expect(tokenModel.createToken).not.toHaveBeenCalled();
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("tidak menerbitkan kode untuk email yang sudah terverifikasi", async () => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue({
      ...fakeUser,
      email_verified_at: new Date(),
    } as never);

    const res = await request(app)
      .post("/api/v1/auth/resend-verification")
      .send({ email: EMAIL });

    expect(res.status).toBe(200);
    expect(tokenModel.createToken).not.toHaveBeenCalled();
  });

  it("tetap berhasil meski pengiriman email gagal", async () => {
    mockSendMail.mockRejectedValue(new Error("smtp mati") as never);

    const res = await request(app)
      .post("/api/v1/auth/resend-verification")
      .send({ email: EMAIL });

    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/auth/login terhadap status akun", () => {
  async function login() {
    return request(app)
      .post("/api/v1/auth/login")
      .send({ email: EMAIL, password: "password123" });
  }

  let hashPasswordUser: string;

  beforeAll(async () => {
    hashPasswordUser = await hashPassword("password123");
  });

  function siapkanUser(override: Record<string, unknown>) {
    (userModel.findByEmail as jest.Mock).mockResolvedValue({
      ...fakeUser,
      password: hashPasswordUser,
      ...override,
    } as never);
  }

  it("menolak akun yang emailnya belum diverifikasi", async () => {
    siapkanUser({ email_verified_at: null });

    const res = await login();

    expect(res.status).toBe(401);
    expect(res.body.message).toContain("Email belum diverifikasi");
  });

  it("menolak akun terverifikasi yang belum disetujui HR", async () => {
    siapkanUser({ email_verified_at: new Date(), approved_at: null });

    const res = await login();

    expect(res.status).toBe(401);
    expect(res.body.message).toContain("menunggu persetujuan");
  });

  it("menolak akun yang dinonaktifkan", async () => {
    siapkanUser({
      email_verified_at: new Date(),
      approved_at: new Date(),
      is_active: false,
    });

    const res = await login();

    expect(res.status).toBe(401);
    expect(res.body.message).toContain("dinonaktifkan");
  });

  it("memberi tiga pesan yang berbeda untuk tiga kondisi", async () => {
    siapkanUser({ email_verified_at: null });
    const belumVerifikasi = await login();

    siapkanUser({ email_verified_at: new Date(), approved_at: null });
    const belumDisetujui = await login();

    siapkanUser({
      email_verified_at: new Date(),
      approved_at: new Date(),
      is_active: false,
    });
    const nonaktif = await login();

    const message = new Set([
      belumVerifikasi.body.message,
      belumDisetujui.body.message,
      nonaktif.body.message,
    ]);

    expect(message.size).toBe(3);
  });

  it("memeriksa status hanya setelah password terbukti benar", async () => {
    siapkanUser({ email_verified_at: null });

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: EMAIL, password: "passwordsalah" });

    expect(res.body.message).toBe("Email atau password salah");
  });

  it("meloloskan akun yang terverifikasi, disetujui, dan aktif", async () => {
    siapkanUser({
      email_verified_at: new Date(),
      approved_at: new Date(),
      is_active: true,
    });

    const res = await login();

    expect(res.status).toBe(200);
    expect(res.body.data.token.split(".")).toHaveLength(3);
  });
});

describe("PATCH /api/v1/users/:id/approve mengirim pemberitahuan", () => {
  const ADMIN_ID = "77777777-7777-4777-8777-777777777777";

  it("mengirim email bahwa akun sudah disetujui", async () => {
    const { createToken: buatJwt } = await import("../../src/helpers/jwt.js");
    const adminToken = buatJwt({
      id: ADMIN_ID,
      email: "admin@awan.io",
      role: "admin",
    });

    (userModel.findSessionInfo as jest.Mock).mockResolvedValue(null as never);
    (userModel.findById as jest.Mock).mockResolvedValue({
      ...fakeUser,
      approved_at: null,
    } as never);
    (userModel.approveUser as jest.Mock).mockResolvedValue({
      ...fakeUser,
      is_active: true,
      approved_at: new Date(),
    } as never);

    const res = await request(app)
      .patch(`/api/v1/users/${USER_ID}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);

    const [surat] = mockSendMail.mock.calls[0] as unknown as [
      { to: string; subject: string },
    ];

    expect(surat.to).toBe(EMAIL);
    expect(surat.subject).toContain("disetujui");
  });

  it("tetap menyetujui akun meski pengiriman email gagal", async () => {
    const { createToken: buatJwt } = await import("../../src/helpers/jwt.js");
    const adminToken = buatJwt({
      id: ADMIN_ID,
      email: "admin@awan.io",
      role: "admin",
    });

    mockSendMail.mockRejectedValue(new Error("smtp mati") as never);
    (userModel.findSessionInfo as jest.Mock).mockResolvedValue(null as never);
    (userModel.findById as jest.Mock).mockResolvedValue({
      ...fakeUser,
      approved_at: null,
    } as never);
    (userModel.approveUser as jest.Mock).mockResolvedValue({
      ...fakeUser,
      is_active: true,
      approved_at: new Date(),
    } as never);

    const res = await request(app)
      .patch(`/api/v1/users/${USER_ID}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(userModel.approveUser).toHaveBeenCalled();
  });
});
