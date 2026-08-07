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

jest.unstable_mockModule("../../src/models/user.js", () => ({
  insertUser: jest.fn(),
  findById: jest.fn(),
  findByEmail: jest.fn(),
  updateLastLogin: jest.fn(),
}));

jest.unstable_mockModule("../../src/models/employee.js", () => ({
  insertEmployee: jest.fn(),
  findByUserId: jest.fn(),
  findById: jest.fn(),
  listEmployees: jest.fn(),
}));

const userModel = await import("../../src/models/user.js");
const employeeModel = await import("../../src/models/employee.js");
const { hashPassword } = await import("../../src/helpers/password.js");
const { app } = await import("../../src/app.js");

const validBody = {
  email: "ismail@awan.io",
  password: "password123",
  full_name: "Ismail Muhammad",
  phone: "+628123456789",
  gender: "male",
  terms_accepted: true,
};

const fakeUser = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "ismail@awan.io",
  role: "employee",
  is_active: true,
  terms_accepted_at: new Date(),
  approved_at: new Date(),
  approved_by: null,
  last_login_at: null,
  created_at: new Date(),
  updated_at: new Date(),
};

const fakeEmployee = {
  id: "22222222-2222-2222-2222-222222222222",
  user_id: fakeUser.id,
  employee_number: "001",
  full_name: "Ismail Muhammad",
  phone: "+628123456789",
  gender: "male",
  employment_status: "probation",
  join_date: new Date(),
};

describe("POST /api/v1/auth/register", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("menolak body yang tidak lengkap", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("menolak email yang sudah terdaftar", async () => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(fakeUser as never);
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send(validBody);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CONFLICT");
  });

  it("membuat akun baru dan mengembalikan 201", async () => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(null as never);
    (userModel.insertUser as jest.Mock).mockResolvedValue(fakeUser as never);
    (employeeModel.insertEmployee as jest.Mock).mockResolvedValue(
      fakeEmployee as never,
    );
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.data.email).toBe("ismail@awan.io");
    expect(res.body.data).not.toHaveProperty("password");
  });

  it("menjalankan BEGIN dan COMMIT saat berhasil", async () => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(null as never);
    (userModel.insertUser as jest.Mock).mockResolvedValue(fakeUser as never);
    (employeeModel.insertEmployee as jest.Mock).mockResolvedValue(
      fakeEmployee as never,
    );

    await request(app).post("/api/v1/auth/register").send(validBody);

    expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
    expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
  });

  it("menjalankan ROLLBACK saat penyimpanan karyawan gagal", async () => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(null as never);
    (userModel.insertUser as jest.Mock).mockResolvedValue(fakeUser as never);
    (employeeModel.insertEmployee as jest.Mock).mockRejectedValue(
      new Error("gagal") as never,
    );
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send(validBody);
    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    expect(res.status).toBe(500);
  });

  it("selalu mengembalikan koneksi ke pool", async () => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(null as never);
    (userModel.insertUser as jest.Mock).mockRejectedValue(
      new Error("gagal") as never,
    );
    await request(app).post("/api/v1/auth/register").send(validBody);
    expect(mockClient.release).toHaveBeenCalled();
  });
});

describe("POST /api/v1/auth/login", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("menolak email yang tidak terdaftar", async () => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(null as never);
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "tidakada@awan.io", password: "password123" });
    expect(res.status).toBe(401);
  });

  it("menolak password yang salah", async () => {
    const hashed = await hashPassword("password123");
    (userModel.findByEmail as jest.Mock).mockResolvedValue({
      ...fakeUser,
      password: hashed,
    } as never);
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "ismail@awan.io", password: "passwordsalah" });
    expect(res.status).toBe(401);
  });

  it("memberi pesan yang sama untuk email tidak terdaftar dan password salah", async () => {
    const hashed = await hashPassword("password123");
    (userModel.findByEmail as jest.Mock).mockResolvedValue(null as never);
    const resEmail = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "tidakada@awan.io", password: "password123" });
    (userModel.findByEmail as jest.Mock).mockResolvedValue({
      ...fakeUser,
      password: hashed,
    } as never);
    const resPassword = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "ismail@awan.io", password: "salah" });
    expect(resEmail.body.message).toBe(resPassword.body.message);
  });

  it("menolak akun yang belum disetujui", async () => {
    const hashed = await hashPassword("password123");
    (userModel.findByEmail as jest.Mock).mockResolvedValue({
      ...fakeUser,
      password: hashed,
      is_active: false,
      approved_at: null,
    } as never);
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "ismail@awan.io", password: "password123" });
    expect(res.status).toBe(401);
    expect(res.body.message).toContain("menunggu persetujuan");
  });

  it("menolak akun yang dinonaktifkan", async () => {
    const hashed = await hashPassword("password123");
    (userModel.findByEmail as jest.Mock).mockResolvedValue({
      ...fakeUser,
      password: hashed,
      is_active: false,
      approved_at: new Date(),
    } as never);
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "ismail@awan.io", password: "password123" });
    expect(res.body.message).toContain("tidak aktif");
  });

  it("mengembalikan token saat login berhasil", async () => {
    const hashed = await hashPassword("password123");
    (userModel.findByEmail as jest.Mock).mockResolvedValue({
      ...fakeUser,
      password: hashed,
    } as never);
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue(
      fakeEmployee as never,
    );
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "ismail@awan.io", password: "password123" });
    expect(res.status).toBe(200);
    expect(res.body.data.token.split(".")).toHaveLength(3);
    expect(res.body.data.user.full_name).toBe("Ismail Muhammad");
  });

  it("mencatat waktu login terakhir", async () => {
    const hashed = await hashPassword("password123");
    (userModel.findByEmail as jest.Mock).mockResolvedValue({
      ...fakeUser,
      password: hashed,
    } as never);
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue(
      fakeEmployee as never,
    );
    await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "ismail@awan.io", password: "password123" });
    expect(userModel.updateLastLogin).toHaveBeenCalledWith(fakeUser.id);
  });
});
