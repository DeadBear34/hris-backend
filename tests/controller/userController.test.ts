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
  insertUserByAdmin: jest.fn(),
  findById: jest.fn(),
  findByEmail: jest.fn(),
  updateLastLogin: jest.fn(),
  updatePassword: jest.fn(),
  approveUser: jest.fn(),
  setUserActive: jest.fn(),
  softDeleteUser: jest.fn(),
  findPending: jest.fn(),
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

const userModel = await import("../../src/models/user.js");
const employeeModel = await import("../../src/models/employee.js");
const { hashPassword } = await import("../../src/helpers/password.js");
const { createToken } = await import("../../src/helpers/jwt.js");
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
  must_change_password: false,
  deleted_at: null,
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
  birth_date: null,
  address: null,
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

const token = createToken({
  id: fakeUser.id,
  email: fakeUser.email,
  role: "employee",
});

// id berupa uuid yang sah, dibutuhkan karena rute pengelolaan akun
// memvalidasi parameter :id sebagai uuid
const HR_ID = "77777777-7777-4777-8777-777777777777";
const TARGET_ID = "88888888-8888-4888-8888-888888888888";

const hrToken = createToken({ id: HR_ID, email: "hr@awan.io", role: "hr" });
const adminToken = createToken({
  id: HR_ID,
  email: "admin@awan.io",
  role: "admin",
});
const employeeToken = createToken({
  id: TARGET_ID,
  email: "karyawan@awan.io",
  role: "employee",
});

function siapkanRegisterBerhasil() {
  (userModel.findByEmail as jest.Mock).mockResolvedValue(null as never);
  (userModel.insertUser as jest.Mock).mockResolvedValue(fakeUser as never);
  (employeeModel.insertEmployee as jest.Mock).mockResolvedValue(
    fakeEmployee as never,
  );
}

async function siapkanLoginBerhasil(override: Record<string, unknown> = {}) {
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

describe("POST /api/v1/auth/register", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.query.mockResolvedValue({ rows: [] } as never);
  });

  it("menolak body kosong", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("melaporkan setiap field yang bermasalah", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({});

    const fields = res.body.errors.map(
      (e: { field: string }) => e.field,
    ) as string[];

    expect(fields).toContain("email");
    expect(fields).toContain("password");
    expect(fields).toContain("phone");
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
    siapkanRegisterBerhasil();

    const res = await request(app)
      .post("/api/v1/auth/register")
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.data.email).toBe("ismail@awan.io");
  });

  it("tidak mengembalikan password dalam respons", async () => {
    siapkanRegisterBerhasil();

    const res = await request(app)
      .post("/api/v1/auth/register")
      .send(validBody);

    expect(JSON.stringify(res.body)).not.toContain("password123");
  });

  it("menyimpan password dalam bentuk hash argon2", async () => {
    siapkanRegisterBerhasil();

    await request(app).post("/api/v1/auth/register").send(validBody);

    const [, , passwordTersimpan] = (userModel.insertUser as jest.Mock).mock
      .calls[0] as [unknown, string, string];

    expect(passwordTersimpan).not.toBe("password123");
    expect(passwordTersimpan).toContain("$argon2id$");
  });

  it("selalu memberi role employee meski body mengirim role lain", async () => {
    siapkanRegisterBerhasil();

    await request(app)
      .post("/api/v1/auth/register")
      .send({ ...validBody, role: "admin" });

    const [, , , role] = (userModel.insertUser as jest.Mock).mock.calls[0] as [
      unknown,
      string,
      string,
      string,
    ];

    expect(role).toBe("employee");
  });

  it("mencatat waktu persetujuan syarat dan ketentuan", async () => {
    siapkanRegisterBerhasil();

    await request(app).post("/api/v1/auth/register").send(validBody);

    const [, , , , waktu] = (userModel.insertUser as jest.Mock).mock
      .calls[0] as [unknown, string, string, string, Date];

    expect(waktu).toBeInstanceOf(Date);
  });

  it("menyimpan email dalam huruf kecil", async () => {
    siapkanRegisterBerhasil();

    await request(app)
      .post("/api/v1/auth/register")
      .send({ ...validBody, email: "Ismail@Awan.IO" });

    const [, email] = (userModel.insertUser as jest.Mock).mock.calls[0] as [
      unknown,
      string,
    ];

    expect(email).toBe("ismail@awan.io");
  });

  it("menjalankan BEGIN dan COMMIT saat berhasil", async () => {
    siapkanRegisterBerhasil();

    await request(app).post("/api/v1/auth/register").send(validBody);

    expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
    expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
  });

  it("menyimpan user dan karyawan dalam satu transaksi yang sama", async () => {
    siapkanRegisterBerhasil();

    await request(app).post("/api/v1/auth/register").send(validBody);

    const [dbUser] = (userModel.insertUser as jest.Mock).mock.calls[0] as [
      unknown,
    ];
    const [dbEmployee] = (employeeModel.insertEmployee as jest.Mock).mock
      .calls[0] as [unknown];

    expect(dbUser).toBe(mockClient);
    expect(dbEmployee).toBe(mockClient);
  });

  it("menghubungkan karyawan ke akun yang baru dibuat", async () => {
    siapkanRegisterBerhasil();

    await request(app).post("/api/v1/auth/register").send(validBody);

    const [, userId] = (employeeModel.insertEmployee as jest.Mock).mock
      .calls[0] as [unknown, string];

    expect(userId).toBe(fakeUser.id);
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
    expect(mockClient.query).not.toHaveBeenCalledWith("COMMIT");
    expect(res.status).toBe(500);
  });

  it("selalu mengembalikan koneksi ke pool meski terjadi error", async () => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(null as never);
    (userModel.insertUser as jest.Mock).mockRejectedValue(
      new Error("gagal") as never,
    );

    await request(app).post("/api/v1/auth/register").send(validBody);

    expect(mockClient.release).toHaveBeenCalled();
  });

  it("tidak membocorkan detail teknis saat terjadi error server", async () => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(null as never);
    (userModel.insertUser as jest.Mock).mockRejectedValue(
      new Error("relation users does not exist") as never,
    );

    const res = await request(app)
      .post("/api/v1/auth/register")
      .send(validBody);

    expect(res.status).toBe(500);
    expect(res.body.message).not.toContain("relation");
  });
});

describe("POST /api/v1/auth/login", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.query.mockResolvedValue({ rows: [] } as never);
  });

  it("menolak body kosong", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({});

    expect(res.status).toBe(400);
  });

  it("menolak email yang tidak terdaftar", async () => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(null as never);

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "tidakada@awan.io", password: "password123" });

    expect(res.status).toBe(401);
  });

  it("menolak password yang salah", async () => {
    await siapkanLoginBerhasil();

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "ismail@awan.io", password: "passwordsalah" });

    expect(res.status).toBe(401);
  });

  it("memberi pesan yang sama untuk email tidak terdaftar dan password salah", async () => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(null as never);
    const resEmail = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "tidakada@awan.io", password: "password123" });

    await siapkanLoginBerhasil();
    const resPassword = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "ismail@awan.io", password: "salah" });

    expect(resEmail.body.message).toBe(resPassword.body.message);
  });

  it("menolak akun yang belum disetujui", async () => {
    await siapkanLoginBerhasil({ is_active: false, approved_at: null });

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "ismail@awan.io", password: "password123" });

    expect(res.status).toBe(401);
    expect(res.body.message).toContain("menunggu persetujuan");
  });

  it("menolak akun yang dinonaktifkan", async () => {
    await siapkanLoginBerhasil({ is_active: false });

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "ismail@awan.io", password: "password123" });

    expect(res.status).toBe(401);
    expect(res.body.message).toContain("tidak aktif");
  });

  it("tidak menerbitkan token untuk akun yang belum disetujui", async () => {
    await siapkanLoginBerhasil({ is_active: false, approved_at: null });

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "ismail@awan.io", password: "password123" });

    expect(res.body.data).toBeUndefined();
  });

  it("mengembalikan token saat login berhasil", async () => {
    await siapkanLoginBerhasil();

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "ismail@awan.io", password: "password123" });

    expect(res.status).toBe(200);
    expect(res.body.data.token.split(".")).toHaveLength(3);
  });

  it("menyertakan data karyawan dalam respons login", async () => {
    await siapkanLoginBerhasil();

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "ismail@awan.io", password: "password123" });

    expect(res.body.data.user.full_name).toBe("Ismail Muhammad");
    expect(res.body.data.user.employee_number).toBe("001");
  });

  it("tidak menyertakan password dalam respons", async () => {
    await siapkanLoginBerhasil();

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "ismail@awan.io", password: "password123" });

    expect(res.body.data.user).not.toHaveProperty("password");
  });

  it("tidak menyimpan password di dalam payload token", async () => {
    await siapkanLoginBerhasil();

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "ismail@awan.io", password: "password123" });

    const payload = JSON.parse(
      Buffer.from(res.body.data.token.split(".")[1], "base64").toString(),
    );

    expect(payload).toHaveProperty("id");
    expect(payload).toHaveProperty("role");
    expect(payload).not.toHaveProperty("password");
  });

  it("menerbitkan token dengan masa berlaku", async () => {
    await siapkanLoginBerhasil();

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "ismail@awan.io", password: "password123" });

    const payload = JSON.parse(
      Buffer.from(res.body.data.token.split(".")[1], "base64").toString(),
    );

    expect(payload.exp).toBeGreaterThan(payload.iat);
  });

  it("mencatat waktu login terakhir", async () => {
    await siapkanLoginBerhasil();

    await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "ismail@awan.io", password: "password123" });

    expect(userModel.updateLastLogin).toHaveBeenCalledWith(fakeUser.id);
  });

  it("tetap berhasil meski karyawan belum terhubung ke akun", async () => {
    const hashed = await hashPassword("password123");
    (userModel.findByEmail as jest.Mock).mockResolvedValue({
      ...fakeUser,
      password: hashed,
    } as never);
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue(null as never);

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "ismail@awan.io", password: "password123" });

    expect(res.status).toBe(200);
    expect(res.body.data.user.full_name).toBeNull();
  });
});

describe("GET /api/v1/auth/me", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("menolak request tanpa token", async () => {
    const res = await request(app).get("/api/v1/auth/me");

    expect(res.status).toBe(401);
  });

  it("menolak token yang diubah", async () => {
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}x`);

    expect(res.status).toBe(401);
  });

  it("menolak header tanpa awalan Bearer", async () => {
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", token);

    expect(res.status).toBe(401);
  });

  it("mengembalikan data pengguna beserta karyawannya", async () => {
    (userModel.findById as jest.Mock).mockResolvedValue(fakeUser as never);
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue(
      fakeEmployee as never,
    );

    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe("ismail@awan.io");
    expect(res.body.data.employee.employee_number).toBe("001");
  });

  it("mengambil data terbaru dari database, bukan dari isi token", async () => {
    (userModel.findById as jest.Mock).mockResolvedValue({
      ...fakeUser,
      role: "hr",
    } as never);
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue(
      fakeEmployee as never,
    );

    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.body.data.role).toBe("hr");
  });

  it("mengembalikan employee null jika belum terhubung", async () => {
    (userModel.findById as jest.Mock).mockResolvedValue(fakeUser as never);
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue(null as never);

    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.body.data.employee).toBeNull();
  });

  it("mengembalikan 404 jika user sudah dihapus", async () => {
    (userModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/v1/auth/password", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("menolak request tanpa token", async () => {
    const res = await request(app).patch("/api/v1/auth/password").send({
      current_password: "password123",
      new_password: "passwordbaru456",
    });

    expect(res.status).toBe(401);
  });

  it("menolak password baru yang terlalu pendek", async () => {
    const res = await request(app)
      .patch("/api/v1/auth/password")
      .set("Authorization", `Bearer ${token}`)
      .send({ current_password: "password123", new_password: "abc" });

    expect(res.status).toBe(400);
  });

  it("menolak password baru yang sama dengan yang lama", async () => {
    const res = await request(app)
      .patch("/api/v1/auth/password")
      .set("Authorization", `Bearer ${token}`)
      .send({
        current_password: "password123",
        new_password: "password123",
      });

    expect(res.status).toBe(400);
  });

  it("menolak jika password saat ini salah", async () => {
    const hashed = await hashPassword("password123");
    (userModel.findByEmail as jest.Mock).mockResolvedValue({
      ...fakeUser,
      password: hashed,
    } as never);

    const res = await request(app)
      .patch("/api/v1/auth/password")
      .set("Authorization", `Bearer ${token}`)
      .send({
        current_password: "salah",
        new_password: "passwordbaru456",
      });

    expect(res.status).toBe(401);
    expect(userModel.updatePassword).not.toHaveBeenCalled();
  });

  it("mengubah password saat kredensial benar", async () => {
    const hashed = await hashPassword("password123");
    (userModel.findByEmail as jest.Mock).mockResolvedValue({
      ...fakeUser,
      password: hashed,
    } as never);

    const res = await request(app)
      .patch("/api/v1/auth/password")
      .set("Authorization", `Bearer ${token}`)
      .send({
        current_password: "password123",
        new_password: "passwordbaru456",
      });

    expect(res.status).toBe(200);
    expect(userModel.updatePassword).toHaveBeenCalled();
  });

  it("menyimpan password baru dalam bentuk hash", async () => {
    const hashed = await hashPassword("password123");
    (userModel.findByEmail as jest.Mock).mockResolvedValue({
      ...fakeUser,
      password: hashed,
    } as never);

    await request(app)
      .patch("/api/v1/auth/password")
      .set("Authorization", `Bearer ${token}`)
      .send({
        current_password: "password123",
        new_password: "passwordbaru456",
      });

    const [id, passwordTersimpan] = (userModel.updatePassword as jest.Mock).mock
      .calls[0] as [string, string];

    expect(id).toBe(fakeUser.id);
    expect(passwordTersimpan).not.toBe("passwordbaru456");
    expect(passwordTersimpan).toContain("$argon2id$");
  });
});

describe("GET /api/v1/users/pending", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("menolak request tanpa token", async () => {
    const res = await request(app).get("/api/v1/users/pending");

    expect(res.status).toBe(401);
  });

  it("menolak karyawan biasa", async () => {
    const res = await request(app)
      .get("/api/v1/users/pending")
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
    expect(userModel.findPending).not.toHaveBeenCalled();
  });

  it("mengizinkan HR", async () => {
    (userModel.findPending as jest.Mock).mockResolvedValue([
      {
        id: TARGET_ID,
        email: "baru@awan.io",
        role: "employee",
        full_name: "Karyawan Baru",
        phone: "+628123456789",
        created_at: new Date(),
      },
    ] as never);

    const res = await request(app)
      .get("/api/v1/users/pending")
      .set("Authorization", `Bearer ${hrToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].full_name).toBe("Karyawan Baru");
  });

  it("mengizinkan admin", async () => {
    (userModel.findPending as jest.Mock).mockResolvedValue([] as never);

    const res = await request(app)
      .get("/api/v1/users/pending")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
  });

  it("mengembalikan daftar kosong jika tidak ada akun menunggu", async () => {
    (userModel.findPending as jest.Mock).mockResolvedValue([] as never);

    const res = await request(app)
      .get("/api/v1/users/pending")
      .set("Authorization", `Bearer ${hrToken}`);

    expect(res.body.data).toEqual([]);
  });

  it("tidak membocorkan password akun yang menunggu persetujuan", async () => {
    (userModel.findPending as jest.Mock).mockResolvedValue([
      { id: TARGET_ID, email: "baru@awan.io", role: "employee" },
    ] as never);

    const res = await request(app)
      .get("/api/v1/users/pending")
      .set("Authorization", `Bearer ${hrToken}`);

    expect(JSON.stringify(res.body)).not.toContain("password");
  });
});

describe("PATCH /api/v1/users/:id/approve", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("menolak request tanpa token", async () => {
    const res = await request(app).patch(`/api/v1/users/${TARGET_ID}/approve`);

    expect(res.status).toBe(401);
  });

  it("menolak karyawan biasa", async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${TARGET_ID}/approve`)
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
    expect(userModel.approveUser).not.toHaveBeenCalled();
  });

  it("menolak id yang bukan uuid", async () => {
    const res = await request(app)
      .patch("/api/v1/users/123/approve")
      .set("Authorization", `Bearer ${hrToken}`);

    expect(res.status).toBe(400);
    expect(userModel.findById).not.toHaveBeenCalled();
  });

  it("mengembalikan 404 jika akun tidak ada", async () => {
    (userModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await request(app)
      .patch(`/api/v1/users/${TARGET_ID}/approve`)
      .set("Authorization", `Bearer ${hrToken}`);

    expect(res.status).toBe(404);
    expect(userModel.approveUser).not.toHaveBeenCalled();
  });

  it("menolak akun yang sudah pernah disetujui", async () => {
    (userModel.findById as jest.Mock).mockResolvedValue({
      ...fakeUser,
      approved_at: new Date(),
    } as never);

    const res = await request(app)
      .patch(`/api/v1/users/${TARGET_ID}/approve`)
      .set("Authorization", `Bearer ${hrToken}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("sudah pernah disetujui");
    expect(userModel.approveUser).not.toHaveBeenCalled();
  });

  it("menyetujui akun yang masih menunggu", async () => {
    (userModel.findById as jest.Mock).mockResolvedValue({
      ...fakeUser,
      is_active: false,
      approved_at: null,
    } as never);
    (userModel.approveUser as jest.Mock).mockResolvedValue({
      ...fakeUser,
      id: TARGET_ID,
      is_active: true,
      approved_at: new Date(),
    } as never);

    const res = await request(app)
      .patch(`/api/v1/users/${TARGET_ID}/approve`)
      .set("Authorization", `Bearer ${hrToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.is_active).toBe(true);
  });

  it("mencatat HR yang menyetujui", async () => {
    (userModel.findById as jest.Mock).mockResolvedValue({
      ...fakeUser,
      approved_at: null,
    } as never);
    (userModel.approveUser as jest.Mock).mockResolvedValue(fakeUser as never);

    await request(app)
      .patch(`/api/v1/users/${TARGET_ID}/approve`)
      .set("Authorization", `Bearer ${hrToken}`);

    expect(userModel.approveUser).toHaveBeenCalledWith(TARGET_ID, HR_ID);
  });

  it("tidak mengembalikan password dalam respons", async () => {
    (userModel.findById as jest.Mock).mockResolvedValue({
      ...fakeUser,
      approved_at: null,
    } as never);
    (userModel.approveUser as jest.Mock).mockResolvedValue(fakeUser as never);

    const res = await request(app)
      .patch(`/api/v1/users/${TARGET_ID}/approve`)
      .set("Authorization", `Bearer ${hrToken}`);

    expect(res.body.data).not.toHaveProperty("password");
  });
});

describe("PATCH /api/v1/users/:id/status", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("menolak request tanpa token", async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${TARGET_ID}/status`)
      .send({ is_active: false });

    expect(res.status).toBe(401);
  });

  it("menolak karyawan biasa", async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${TARGET_ID}/status`)
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ is_active: false });

    expect(res.status).toBe(403);
    expect(userModel.setUserActive).not.toHaveBeenCalled();
  });

  it("menolak id yang bukan uuid", async () => {
    const res = await request(app)
      .patch("/api/v1/users/123/status")
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ is_active: false });

    expect(res.status).toBe(400);
  });

  it("menolak body tanpa is_active", async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${TARGET_ID}/status`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("menolak is_active yang bukan boolean", async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${TARGET_ID}/status`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ is_active: "false" });

    expect(res.status).toBe(400);
  });

  it("mencegah HR mengubah status akunnya sendiri", async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${HR_ID}/status`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ is_active: false });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("akun sendiri");
    expect(userModel.setUserActive).not.toHaveBeenCalled();
  });

  it("mengembalikan 404 jika akun tidak ada", async () => {
    (userModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await request(app)
      .patch(`/api/v1/users/${TARGET_ID}/status`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ is_active: false });

    expect(res.status).toBe(404);
  });

  it("menolak pengaktifan akun yang belum pernah disetujui", async () => {
    (userModel.findById as jest.Mock).mockResolvedValue({
      ...fakeUser,
      approved_at: null,
    } as never);

    const res = await request(app)
      .patch(`/api/v1/users/${TARGET_ID}/status`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ is_active: true });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("belum pernah disetujui");
    expect(userModel.setUserActive).not.toHaveBeenCalled();
  });

  it("tetap mengizinkan penonaktifan akun yang belum disetujui", async () => {
    (userModel.findById as jest.Mock).mockResolvedValue({
      ...fakeUser,
      approved_at: null,
    } as never);
    (userModel.setUserActive as jest.Mock).mockResolvedValue({
      ...fakeUser,
      is_active: false,
    } as never);

    const res = await request(app)
      .patch(`/api/v1/users/${TARGET_ID}/status`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ is_active: false });

    expect(res.status).toBe(200);
  });

  it("menonaktifkan akun yang sudah disetujui", async () => {
    (userModel.findById as jest.Mock).mockResolvedValue(fakeUser as never);
    (userModel.setUserActive as jest.Mock).mockResolvedValue({
      ...fakeUser,
      is_active: false,
    } as never);

    const res = await request(app)
      .patch(`/api/v1/users/${TARGET_ID}/status`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ is_active: false });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("dinonaktifkan");
    expect(userModel.setUserActive).toHaveBeenCalledWith(TARGET_ID, false);
  });

  it("mengaktifkan kembali akun yang sudah disetujui", async () => {
    (userModel.findById as jest.Mock).mockResolvedValue({
      ...fakeUser,
      is_active: false,
    } as never);
    (userModel.setUserActive as jest.Mock).mockResolvedValue(fakeUser as never);

    const res = await request(app)
      .patch(`/api/v1/users/${TARGET_ID}/status`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ is_active: true });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("diaktifkan");
    expect(userModel.setUserActive).toHaveBeenCalledWith(TARGET_ID, true);
  });

  it("tidak mengembalikan password dalam respons", async () => {
    (userModel.findById as jest.Mock).mockResolvedValue(fakeUser as never);
    (userModel.setUserActive as jest.Mock).mockResolvedValue(fakeUser as never);

    const res = await request(app)
      .patch(`/api/v1/users/${TARGET_ID}/status`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ is_active: false });

    expect(res.body.data).not.toHaveProperty("password");
  });
});
