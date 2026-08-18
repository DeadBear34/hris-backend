import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import request from "supertest";

jest.unstable_mockModule("../../src/config/databaseConnection.js", () => ({
  pool: {
    connect: jest.fn(),
    query: jest.fn(() => Promise.resolve({ rows: [] })),
  },
}));

jest.unstable_mockModule("../../src/models/user.js", () => ({
  findSessionInfo: jest.fn(),
  findById: jest.fn(),
  findByEmail: jest.fn(),
  insertUser: jest.fn(),
  insertUserByAdmin: jest.fn(),
  updateLastLogin: jest.fn(),
  updatePassword: jest.fn(),
  approveUser: jest.fn(),
  setUserActive: jest.fn(),
  softDeleteUser: jest.fn(),
  findPending: jest.fn(),
  setEmailVerified: jest.fn(),
}));

jest.unstable_mockModule("../../src/models/employee.js", () => ({
  findByUserId: jest.fn(),
  findById: jest.fn(),
  findDetailById: jest.fn(),
  updateOwnProfile: jest.fn(),
  updateEmployee: jest.fn(),
  insertEmployee: jest.fn(),
  createEmployee: jest.fn(),
  softDeleteEmployee: jest.fn(),
  listEmployees: jest.fn(),
  findSubordinates: jest.fn(),
  isDescendantOf: jest.fn(),
}));

const mockSendMail = jest.fn(() => Promise.resolve());

jest.unstable_mockModule("../../src/helpers/mailer.js", () => ({
  sendMail: mockSendMail,
  isSecretLoggingAllowed: () => true,
}));

jest.unstable_mockModule("../../src/config/logger.js", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const userModel = await import("../../src/models/user.js");
const employeeModel = await import("../../src/models/employee.js");
const { createToken } = await import("../../src/helpers/jwt.js");
const { app } = await import("../../src/app.js");

const USER_ID = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";
const MANAGER_ID = "33333333-3333-4333-8333-333333333333";
const DEPARTMENT_ID = "44444444-4444-4444-8444-444444444444";
const POSITION_ID = "55555555-5555-4555-8555-555555555555";
const LAIN_ID = "66666666-6666-4666-8666-666666666666";

const token = createToken({
  id: USER_ID,
  email: "karyawan@awan.io",
  role: "employee",
});

const fakeUser = {
  id: USER_ID,
  email: "karyawan@awan.io",
  role: "employee",
  is_active: true,
  must_change_password: false,
  email_verified_at: new Date(),
  password_changed_at: null,
  last_login_at: null,
  approved_at: new Date(),
};

const fakeEmployee = {
  id: EMPLOYEE_ID,
  user_id: USER_ID,
  employee_number: "001",
  full_name: "Ismail Muhammad",
  phone: "+628123456789",
  gender: "male",
  birth_date: "1998-05-20",
  address: "Jalan Merdeka 10",
  department_id: DEPARTMENT_ID,
  position_id: POSITION_ID,
  manager_id: MANAGER_ID,
  employment_status: "permanent",
  join_date: "2024-01-01",
  is_active: true,
};

const fakeDetail = {
  id: EMPLOYEE_ID,
  employee_number: "001",
  full_name: "Ismail Muhammad",
  email: "karyawan@awan.io",
  department_name: "Teknologi Informasi",
  position_name: "Software Engineer",
  manager_name: "Hendra Wijaya",
  is_active: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  (userModel.findSessionInfo as jest.Mock).mockResolvedValue(null as never);
  (userModel.findById as jest.Mock).mockResolvedValue(fakeUser as never);
  (employeeModel.findByUserId as jest.Mock).mockResolvedValue(
    fakeEmployee as never,
  );
  (employeeModel.findDetailById as jest.Mock).mockResolvedValue(
    fakeDetail as never,
  );
  (employeeModel.updateOwnProfile as jest.Mock).mockResolvedValue(
    fakeEmployee as never,
  );
});

function perbarui(body: Record<string, unknown>) {
  return request(app)
    .patch("/api/v1/auth/me")
    .set("Authorization", `Bearer ${token}`)
    .send(body);
}

/** Data yang benar-benar sampai ke model. */
function dataTersimpan(): Record<string, unknown> {
  const [, data] = (employeeModel.updateOwnProfile as jest.Mock).mock
    .calls[0] as [string, Record<string, unknown>];

  return data;
}

describe("GET /api/v1/auth/me", () => {
  it("menyertakan field yang dibutuhkan formulir profil", async () => {
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.employee.birth_date).toBe("1998-05-20");
    expect(res.body.data.employee.address).toBe("Jalan Merdeka 10");
  });

  it("menyertakan id relasi, bukan hanya namanya", async () => {
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.body.data.employee.department_id).toBe(DEPARTMENT_ID);
    expect(res.body.data.employee.position_id).toBe(POSITION_ID);
    expect(res.body.data.employee.manager_id).toBe(MANAGER_ID);
  });

  it("tetap menyertakan nama relasi untuk ditampilkan", async () => {
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.body.data.employee.position_name).toBe("Software Engineer");
    expect(res.body.data.employee.manager_name).toBe("Hendra Wijaya");
  });

  it("tidak pernah membocorkan password", async () => {
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(JSON.stringify(res.body)).not.toContain("password_changed_at");
    expect(res.body.data).not.toHaveProperty("password");
  });
});

describe("PATCH /api/v1/auth/me", () => {
  it("menolak request tanpa token", async () => {
    const res = await request(app)
      .patch("/api/v1/auth/me")
      .send({ full_name: "Nama Baru" });

    expect(res.status).toBe(401);
  });

  it("memperbarui nama lengkap", async () => {
    const res = await perbarui({ full_name: "Ismail Muhammad Baru" });

    expect(res.status).toBe(200);
    expect(dataTersimpan().full_name).toBe("Ismail Muhammad Baru");
  });

  it("memperbarui nomor telepon, tanggal lahir, dan alamat", async () => {
    await perbarui({
      phone: "+628990000001",
      birth_date: "1999-01-15",
      address: "Jalan Baru 5",
    });

    expect(dataTersimpan()).toEqual({
      phone: "+628990000001",
      birth_date: "1999-01-15",
      address: "Jalan Baru 5",
    });
  });

  it("memperbarui profil milik karyawan yang sedang login", async () => {
    await perbarui({ full_name: "Nama Baru" });

    const [id] = (employeeModel.updateOwnProfile as jest.Mock).mock
      .calls[0] as [string];

    expect(id).toBe(EMPLOYEE_ID);
  });

  it("mengembalikan profil terbaru dalam bentuk yang sama dengan GET", async () => {
    const res = await perbarui({ full_name: "Nama Baru" });

    expect(res.body.data.employee.id).toBe(EMPLOYEE_ID);
    expect(res.body.data.email).toBe("karyawan@awan.io");
    expect(res.body.message).toContain("berhasil diperbarui");
  });

  it("menerima pembaruan sebagian tanpa menghapus field lain", async () => {
    await perbarui({ phone: "+628990000001" });

    expect(dataTersimpan()).toEqual({ phone: "+628990000001" });
  });

  it("memberi pesan jelas jika akun belum terhubung ke karyawan", async () => {
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue(null as never);

    const res = await perbarui({ full_name: "Nama Baru" });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("belum terhubung ke data karyawan");
    expect(employeeModel.updateOwnProfile).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/v1/auth/me menolak field di luar hak karyawan", () => {
  it("tidak pernah mengubah manager_id", async () => {
    await perbarui({ full_name: "Nama Baru", manager_id: LAIN_ID });

    expect(dataTersimpan()).not.toHaveProperty("manager_id");
  });

  it("tidak pernah mengubah struktur organisasi", async () => {
    await perbarui({
      full_name: "Nama Baru",
      department_id: LAIN_ID,
      position_id: LAIN_ID,
    });

    const data = dataTersimpan();

    expect(data).not.toHaveProperty("department_id");
    expect(data).not.toHaveProperty("position_id");
  });

  it("tidak pernah mengubah status kepegawaian", async () => {
    await perbarui({
      full_name: "Nama Baru",
      employment_status: "permanent",
      join_date: "2020-01-01",
      resign_date: "2030-01-01",
      is_active: false,
    });

    const data = dataTersimpan();

    expect(data).not.toHaveProperty("employment_status");
    expect(data).not.toHaveProperty("join_date");
    expect(data).not.toHaveProperty("resign_date");
    expect(data).not.toHaveProperty("is_active");
  });

  it("tidak pernah mengubah gender karena memengaruhi kelayakan cuti", async () => {
    await perbarui({ full_name: "Nama Baru", gender: "female" });

    expect(dataTersimpan()).not.toHaveProperty("gender");
  });

  it("tidak pernah mengubah email maupun role", async () => {
    await perbarui({
      full_name: "Nama Baru",
      email: "penyerang@awan.io",
      role: "admin",
    });

    const data = dataTersimpan();

    expect(data).not.toHaveProperty("email");
    expect(data).not.toHaveProperty("role");
  });

  it("hanya meneruskan empat field yang diizinkan", async () => {
    await perbarui({
      full_name: "Nama Baru",
      phone: "+628990000001",
      birth_date: "1999-01-15",
      address: "Jalan Baru 5",
      manager_id: LAIN_ID,
      is_active: false,
      role: "admin",
    });

    expect(Object.keys(dataTersimpan()).sort()).toEqual([
      "address",
      "birth_date",
      "full_name",
      "phone",
    ]);
  });
});

describe("PATCH /api/v1/auth/me menerapkan aturan validasi yang sama", () => {
  it("menolak nomor telepon tanpa kode negara", async () => {
    const res = await perbarui({ phone: "08123456789" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(employeeModel.updateOwnProfile).not.toHaveBeenCalled();
  });

  it("menolak nama yang terlalu pendek", async () => {
    const res = await perbarui({ full_name: "Is" });

    expect(res.status).toBe(400);
  });

  it("menolak tanggal lahir dengan format salah", async () => {
    const res = await perbarui({ birth_date: "20-05-1998" });

    expect(res.status).toBe(400);
  });

  it("menolak alamat melebihi 500 karakter", async () => {
    const res = await perbarui({ address: "a".repeat(501) });

    expect(res.status).toBe(400);
  });

  it("membuang spasi di sekitar nama", async () => {
    await perbarui({ full_name: "  Ismail Muhammad  " });

    expect(dataTersimpan().full_name).toBe("Ismail Muhammad");
  });

  it("menerima body kosong sebagai tanpa perubahan", async () => {
    const res = await perbarui({});

    expect(res.status).toBe(200);
    expect(dataTersimpan()).toEqual({});
  });
});
