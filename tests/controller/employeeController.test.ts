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

jest.unstable_mockModule("../../src/models/department.js", () => ({
  findAll: jest.fn(),
  findById: jest.fn(),
  findByCode: jest.fn(),
  createDepartment: jest.fn(),
  updateDepartment: jest.fn(),
  softDeleteDepartment: jest.fn(),
  countEmployees: jest.fn(),
}));

jest.unstable_mockModule("../../src/models/position.js", () => ({
  findAll: jest.fn(),
  findById: jest.fn(),
  findByCode: jest.fn(),
  createPosition: jest.fn(),
  updatePosition: jest.fn(),
  softDeletePosition: jest.fn(),
  countEmployees: jest.fn(),
}));

const userModel = await import("../../src/models/user.js");
const employeeModel = await import("../../src/models/employee.js");
const departmentModel = await import("../../src/models/department.js");
const positionModel = await import("../../src/models/position.js");
const { createToken } = await import("../../src/helpers/jwt.js");
const { app } = await import("../../src/app.js");

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";
const DEPARTMENT_ID = "33333333-3333-4333-8333-333333333333";
const POSITION_ID = "44444444-4444-4444-8444-444444444444";
const MANAGER_ID = "55555555-5555-4555-8555-555555555555";
const USER_ID = "66666666-6666-4666-8666-666666666666";

const adminToken = createToken({
  id: ADMIN_ID,
  email: "admin@awan.io",
  role: "admin",
});
const employeeToken = createToken({
  id: USER_ID,
  email: "karyawan@awan.io",
  role: "employee",
});

const validCreate = {
  email: "baru@awan.io",
  password: "password123",
  full_name: "Karyawan Baru",
  phone: "+628123456789",
  gender: "male",
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

const fakeDetail = {
  id: EMPLOYEE_ID,
  employee_number: "001",
  full_name: "Ismail Muhammad",
  email: "ismail@awan.io",
  position_name: "Software Engineer",
  department_name: "Teknologi Informasi",
  manager_name: null,
  is_active: true,
};

const fakeAccount = {
  id: USER_ID,
  email: "baru@awan.io",
  role: "employee",
  is_active: true,
  must_change_password: true,
};

const fakeDepartment = { id: DEPARTMENT_ID, code: "IT", name: "Teknologi" };
const fakePosition = { id: POSITION_ID, code: "SWE", name: "Engineer" };

beforeEach(() => {
  jest.clearAllMocks();
  mockClient.query.mockResolvedValue({ rows: [] } as never);
});

describe("GET /api/v1/employees", () => {
  function siapkanDaftar(total = 25) {
    (employeeModel.listEmployees as jest.Mock).mockResolvedValue({
      rows: [fakeDetail],
      total,
    } as never);
  }

  it("menolak request tanpa token", async () => {
    const res = await request(app).get("/api/v1/employees");

    expect(res.status).toBe(401);
  });

  it("menolak karyawan biasa", async () => {
    const res = await request(app)
      .get("/api/v1/employees")
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
  });

  it("tidak menyentuh database saat akses ditolak", async () => {
    await request(app)
      .get("/api/v1/employees")
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(employeeModel.listEmployees).not.toHaveBeenCalled();
  });

  it("mengizinkan admin", async () => {
    siapkanDaftar();

    const res = await request(app)
      .get("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("mengizinkan admin", async () => {
    siapkanDaftar();

    const res = await request(app)
      .get("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
  });

  it("memakai halaman dan batas bawaan", async () => {
    siapkanDaftar();

    const res = await request(app)
      .get("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.limit).toBe(10);
  });

  it("menghitung jumlah halaman dari total data", async () => {
    siapkanDaftar(25);

    const res = await request(app)
      .get("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.body.meta.total).toBe(25);
    expect(res.body.meta.total_pages).toBe(3);
  });

  it("mengembalikan nol halaman saat data kosong", async () => {
    (employeeModel.listEmployees as jest.Mock).mockResolvedValue({
      rows: [],
      total: 0,
    } as never);

    const res = await request(app)
      .get("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.body.meta.total_pages).toBe(0);
    expect(res.body.data).toEqual([]);
  });

  it("meneruskan filter pencarian ke model", async () => {
    siapkanDaftar();

    await request(app)
      .get("/api/v1/employees")
      .query({
        search: "ismail",
        department_id: DEPARTMENT_ID,
        is_active: "false",
        page: "2",
        limit: "5",
      })
      .set("Authorization", `Bearer ${adminToken}`);

    const [params] = (employeeModel.listEmployees as jest.Mock).mock
      .calls[0] as [Record<string, unknown>];

    expect(params).toEqual({
      search: "ismail",
      department_id: DEPARTMENT_ID,
      is_active: false,
      page: 2,
      limit: 5,
    });
  });

  it("menolak department_id yang bukan uuid", async () => {
    const res = await request(app)
      .get("/api/v1/employees")
      .query({ department_id: "abc" })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("menolak batas data yang melebihi 100", async () => {
    const res = await request(app)
      .get("/api/v1/employees")
      .query({ limit: "500" })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });

  it("menolak halaman nol", async () => {
    const res = await request(app)
      .get("/api/v1/employees")
      .query({ page: "0" })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });

  it("meneruskan error tak terduga sebagai 500", async () => {
    (employeeModel.listEmployees as jest.Mock).mockRejectedValue(
      new Error("koneksi putus") as never,
    );

    const res = await request(app)
      .get("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(500);
    expect(res.body.message).not.toContain("koneksi putus");
  });
});

describe("GET /api/v1/employees/:id", () => {
  it("menolak request tanpa token", async () => {
    const res = await request(app).get(`/api/v1/employees/${EMPLOYEE_ID}`);

    expect(res.status).toBe(401);
  });

  it("menolak karyawan biasa", async () => {
    const res = await request(app)
      .get(`/api/v1/employees/${EMPLOYEE_ID}`)
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
  });

  it("menolak id yang bukan uuid", async () => {
    const res = await request(app)
      .get("/api/v1/employees/123")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(employeeModel.findDetailById).not.toHaveBeenCalled();
  });

  it("mengembalikan 404 jika karyawan tidak ada", async () => {
    (employeeModel.findDetailById as jest.Mock).mockResolvedValue(
      null as never,
    );

    const res = await request(app)
      .get(`/api/v1/employees/${EMPLOYEE_ID}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });

  it("mengembalikan detail beserta relasinya", async () => {
    (employeeModel.findDetailById as jest.Mock).mockResolvedValue(
      fakeDetail as never,
    );

    const res = await request(app)
      .get(`/api/v1/employees/${EMPLOYEE_ID}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.department_name).toBe("Teknologi Informasi");
    expect(res.body.data.position_name).toBe("Software Engineer");
  });
});

describe("POST /api/v1/employees", () => {
  function siapkanBerhasil() {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(null as never);
    (userModel.insertUserByAdmin as jest.Mock).mockResolvedValue(
      fakeAccount as never,
    );
    (employeeModel.createEmployee as jest.Mock).mockResolvedValue(
      fakeEmployee as never,
    );
    (departmentModel.findById as jest.Mock).mockResolvedValue(
      fakeDepartment as never,
    );
    (positionModel.findById as jest.Mock).mockResolvedValue(
      fakePosition as never,
    );
    (employeeModel.findById as jest.Mock).mockResolvedValue(
      fakeEmployee as never,
    );
  }

  it("menolak request tanpa token", async () => {
    const res = await request(app).post("/api/v1/employees").send(validCreate);

    expect(res.status).toBe(401);
  });

  it("menolak karyawan biasa", async () => {
    const res = await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send(validCreate);

    expect(res.status).toBe(403);
  });

  it("menolak body kosong", async () => {
    const res = await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("menolak email yang sudah terdaftar", async () => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue({
      id: USER_ID,
    } as never);

    const res = await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(validCreate);

    expect(res.status).toBe(409);
    expect(employeeModel.createEmployee).not.toHaveBeenCalled();
  });

  it("menolak departemen yang tidak ada", async () => {
    siapkanBerhasil();
    (departmentModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...validCreate, department_id: DEPARTMENT_ID });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Departemen tidak ditemukan");
  });

  it("menolak jabatan yang tidak ada", async () => {
    siapkanBerhasil();
    (positionModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...validCreate, position_id: POSITION_ID });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Jabatan tidak ditemukan");
  });

  it("menolak manajer yang tidak ada", async () => {
    siapkanBerhasil();
    (employeeModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...validCreate, manager_id: MANAGER_ID });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Manajer tidak ditemukan");
  });

  it("membuat karyawan dan mengembalikan 201", async () => {
    siapkanBerhasil();

    const res = await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(validCreate);

    expect(res.status).toBe(201);
    expect(res.body.data.employee.id).toBe(EMPLOYEE_ID);
  });

  it("menyimpan password dalam bentuk hash argon2", async () => {
    siapkanBerhasil();

    await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(validCreate);

    const [, , passwordTersimpan] = (userModel.insertUserByAdmin as jest.Mock)
      .mock.calls[0] as [unknown, string, string];

    expect(passwordTersimpan).not.toBe("password123");
    expect(passwordTersimpan).toContain("$argon2id$");
  });

  it("tidak mengembalikan password dalam respons", async () => {
    siapkanBerhasil();

    const res = await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(validCreate);

    expect(JSON.stringify(res.body)).not.toContain("password123");
  });

  it("memakai role employee jika tidak ditentukan", async () => {
    siapkanBerhasil();

    await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(validCreate);

    const [, , , role] = (userModel.insertUserByAdmin as jest.Mock).mock
      .calls[0] as [unknown, string, string, string];

    expect(role).toBe("employee");
  });

  it("memakai role yang dipilih admin", async () => {
    siapkanBerhasil();

    await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...validCreate, role: "admin" });

    const [, , , role] = (userModel.insertUserByAdmin as jest.Mock).mock
      .calls[0] as [unknown, string, string, string];

    expect(role).toBe("admin");
  });

  it("mencatat Admin yang membuat akun", async () => {
    siapkanBerhasil();

    await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(validCreate);

    const [, , , , approvedBy] = (userModel.insertUserByAdmin as jest.Mock).mock
      .calls[0] as [unknown, string, string, string, string];

    expect(approvedBy).toBe(ADMIN_ID);
  });

  it("tidak menyimpan data akun ke tabel karyawan", async () => {
    siapkanBerhasil();

    await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...validCreate, role: "admin" });

    const [, , data] = (employeeModel.createEmployee as jest.Mock).mock
      .calls[0] as [unknown, string, Record<string, unknown>];

    expect(data).not.toHaveProperty("email");
    expect(data).not.toHaveProperty("password");
    expect(data).not.toHaveProperty("role");
    expect(data.full_name).toBe("Karyawan Baru");
  });

  it("memberi tahu bahwa password awal harus diganti", async () => {
    siapkanBerhasil();

    const res = await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(validCreate);

    expect(res.body.data.account.must_change_password).toBe(true);
  });

  it("menyimpan akun dan karyawan dalam satu transaksi", async () => {
    siapkanBerhasil();

    await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(validCreate);

    const [dbUser] = (userModel.insertUserByAdmin as jest.Mock).mock
      .calls[0] as [unknown];
    const [dbEmployee] = (employeeModel.createEmployee as jest.Mock).mock
      .calls[0] as [unknown];

    expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
    expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
    expect(dbUser).toBe(mockClient);
    expect(dbEmployee).toBe(mockClient);
  });

  it("menghubungkan karyawan ke akun yang baru dibuat", async () => {
    siapkanBerhasil();

    await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(validCreate);

    const [, userId] = (employeeModel.createEmployee as jest.Mock).mock
      .calls[0] as [unknown, string];

    expect(userId).toBe(USER_ID);
  });

  it("menjalankan ROLLBACK saat penyimpanan karyawan gagal", async () => {
    siapkanBerhasil();
    (employeeModel.createEmployee as jest.Mock).mockRejectedValue(
      new Error("gagal") as never,
    );

    const res = await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(validCreate);

    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    expect(mockClient.query).not.toHaveBeenCalledWith("COMMIT");
    expect(res.status).toBe(500);
  });

  it("selalu mengembalikan koneksi ke pool meski terjadi error", async () => {
    siapkanBerhasil();
    (userModel.insertUserByAdmin as jest.Mock).mockRejectedValue(
      new Error("gagal") as never,
    );

    await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(validCreate);

    expect(mockClient.release).toHaveBeenCalled();
  });
});

describe("PATCH /api/v1/employees/:id", () => {
  function siapkanBerhasil() {
    (employeeModel.findById as jest.Mock).mockResolvedValue(
      fakeEmployee as never,
    );
    (employeeModel.updateEmployee as jest.Mock).mockResolvedValue({
      ...fakeEmployee,
      full_name: "Nama Baru",
    } as never);
    (departmentModel.findById as jest.Mock).mockResolvedValue(
      fakeDepartment as never,
    );
    (positionModel.findById as jest.Mock).mockResolvedValue(
      fakePosition as never,
    );
    (employeeModel.isDescendantOf as jest.Mock).mockResolvedValue(
      false as never,
    );
  }

  it("menolak request tanpa token", async () => {
    const res = await request(app)
      .patch(`/api/v1/employees/${EMPLOYEE_ID}`)
      .send({ full_name: "Nama Baru" });

    expect(res.status).toBe(401);
  });

  it("menolak karyawan biasa", async () => {
    const res = await request(app)
      .patch(`/api/v1/employees/${EMPLOYEE_ID}`)
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ full_name: "Nama Baru" });

    expect(res.status).toBe(403);
  });

  it("menolak id yang bukan uuid", async () => {
    const res = await request(app)
      .patch("/api/v1/employees/123")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ full_name: "Nama Baru" });

    expect(res.status).toBe(400);
  });

  it("menolak nomor telepon dengan format salah", async () => {
    const res = await request(app)
      .patch(`/api/v1/employees/${EMPLOYEE_ID}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ phone: "08123456789" });

    expect(res.status).toBe(400);
    expect(employeeModel.updateEmployee).not.toHaveBeenCalled();
  });

  it("mengembalikan 404 jika karyawan tidak ada", async () => {
    (employeeModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await request(app)
      .patch(`/api/v1/employees/${EMPLOYEE_ID}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ full_name: "Nama Baru" });

    expect(res.status).toBe(404);
  });

  it("memperbarui data dan mengembalikan hasilnya", async () => {
    siapkanBerhasil();

    const res = await request(app)
      .patch(`/api/v1/employees/${EMPLOYEE_ID}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ full_name: "Nama Baru" });

    expect(res.status).toBe(200);
    expect(res.body.data.full_name).toBe("Nama Baru");
  });

  it("meneruskan id dan perubahan ke model", async () => {
    siapkanBerhasil();

    await request(app)
      .patch(`/api/v1/employees/${EMPLOYEE_ID}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ full_name: "Nama Baru", is_active: false });

    const [id, data] = (employeeModel.updateEmployee as jest.Mock).mock
      .calls[0] as [string, Record<string, unknown>];

    expect(id).toBe(EMPLOYEE_ID);
    expect(data).toEqual({ full_name: "Nama Baru", is_active: false });
  });

  it("menolak karyawan yang dijadikan manajer dirinya sendiri", async () => {
    siapkanBerhasil();

    const res = await request(app)
      .patch(`/api/v1/employees/${EMPLOYEE_ID}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ manager_id: EMPLOYEE_ID });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("manajer dirinya sendiri");
    expect(employeeModel.updateEmployee).not.toHaveBeenCalled();
  });

  it("menolak struktur manajer yang melingkar", async () => {
    siapkanBerhasil();
    (employeeModel.isDescendantOf as jest.Mock).mockResolvedValue(
      true as never,
    );

    const res = await request(app)
      .patch(`/api/v1/employees/${EMPLOYEE_ID}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ manager_id: MANAGER_ID });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("melingkar");
    expect(employeeModel.updateEmployee).not.toHaveBeenCalled();
  });

  it("menerima manajer yang tidak membentuk lingkaran", async () => {
    siapkanBerhasil();

    const res = await request(app)
      .patch(`/api/v1/employees/${EMPLOYEE_ID}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ manager_id: MANAGER_ID });

    expect(res.status).toBe(200);
    expect(employeeModel.isDescendantOf).toHaveBeenCalledWith(
      MANAGER_ID,
      EMPLOYEE_ID,
    );
  });

  it("menolak departemen yang tidak ada", async () => {
    siapkanBerhasil();
    (departmentModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await request(app)
      .patch(`/api/v1/employees/${EMPLOYEE_ID}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ department_id: DEPARTMENT_ID });

    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/v1/employees/:id", () => {
  function siapkanBerhasil() {
    (employeeModel.findById as jest.Mock).mockResolvedValue(
      fakeEmployee as never,
    );
    (employeeModel.findSubordinates as jest.Mock).mockResolvedValue(
      [] as never,
    );
    (employeeModel.softDeleteEmployee as jest.Mock).mockResolvedValue(
      fakeEmployee as never,
    );
  }

  it("menolak request tanpa token", async () => {
    const res = await request(app).delete(`/api/v1/employees/${EMPLOYEE_ID}`);

    expect(res.status).toBe(401);
  });

  it("menolak karyawan biasa", async () => {
    const res = await request(app)
      .delete(`/api/v1/employees/${EMPLOYEE_ID}`)
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
  });

  it("menolak id yang bukan uuid", async () => {
    const res = await request(app)
      .delete("/api/v1/employees/123")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });

  it("mengembalikan 404 jika karyawan tidak ada", async () => {
    (employeeModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await request(app)
      .delete(`/api/v1/employees/${EMPLOYEE_ID}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(employeeModel.softDeleteEmployee).not.toHaveBeenCalled();
  });

  it("menolak penghapusan karyawan yang masih punya bawahan", async () => {
    siapkanBerhasil();
    (employeeModel.findSubordinates as jest.Mock).mockResolvedValue([
      { id: "1", employee_number: "002", full_name: "Bawahan Satu" },
      { id: "2", employee_number: "003", full_name: "Bawahan Dua" },
    ] as never);

    const res = await request(app)
      .delete(`/api/v1/employees/${EMPLOYEE_ID}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("2 karyawan");
    expect(employeeModel.softDeleteEmployee).not.toHaveBeenCalled();
  });

  it("menyertakan daftar bawahan agar Admin tahu siapa yang harus dipindah", async () => {
    siapkanBerhasil();
    (employeeModel.findSubordinates as jest.Mock).mockResolvedValue([
      { id: "1", employee_number: "002", full_name: "Bawahan Satu" },
    ] as never);

    const res = await request(app)
      .delete(`/api/v1/employees/${EMPLOYEE_ID}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.body.details.subordinates).toHaveLength(1);
    expect(res.body.details.subordinates[0].full_name).toBe("Bawahan Satu");
  });

  it("menghapus karyawan dan mengembalikan pesan sukses", async () => {
    siapkanBerhasil();

    const res = await request(app)
      .delete(`/api/v1/employees/${EMPLOYEE_ID}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("berhasil dihapus");
  });

  it("menonaktifkan akun pengguna di transaksi yang sama", async () => {
    siapkanBerhasil();

    await request(app)
      .delete(`/api/v1/employees/${EMPLOYEE_ID}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(userModel.softDeleteUser).toHaveBeenCalledWith(mockClient, USER_ID);
    expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
    expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
  });

  it("melewati penghapusan akun jika karyawan tidak punya akun", async () => {
    siapkanBerhasil();
    (employeeModel.findById as jest.Mock).mockResolvedValue({
      ...fakeEmployee,
      user_id: null,
    } as never);

    const res = await request(app)
      .delete(`/api/v1/employees/${EMPLOYEE_ID}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(userModel.softDeleteUser).not.toHaveBeenCalled();
  });

  it("menjalankan ROLLBACK saat penghapusan gagal", async () => {
    siapkanBerhasil();
    (employeeModel.softDeleteEmployee as jest.Mock).mockRejectedValue(
      new Error("gagal") as never,
    );

    const res = await request(app)
      .delete(`/api/v1/employees/${EMPLOYEE_ID}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    expect(mockClient.query).not.toHaveBeenCalledWith("COMMIT");
    expect(res.status).toBe(500);
  });

  it("selalu mengembalikan koneksi ke pool", async () => {
    siapkanBerhasil();

    await request(app)
      .delete(`/api/v1/employees/${EMPLOYEE_ID}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(mockClient.release).toHaveBeenCalled();
  });
});
