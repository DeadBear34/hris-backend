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
  insertUsersByAdmin: jest.fn(),
  findById: jest.fn(),
  findByEmail: jest.fn(),
  findExistingEmails: jest.fn(),
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
  createEmployees: jest.fn(),
  updateEmployee: jest.fn(),
  softDeleteEmployee: jest.fn(),
  findByUserId: jest.fn(),
  findById: jest.fn(),
  findDetailById: jest.fn(),
  listEmployees: jest.fn(),
  findSubordinates: jest.fn(),
  isDescendantOf: jest.fn(),
}));

jest.unstable_mockModule("../../src/config/logger.js", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
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
const { logger } = await import("../../src/config/logger.js");
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

function akunPalsu(index: number, email: string, role = "employee") {
  return {
    id: `user-${index}`,
    email,
    role,
    is_active: true,
    must_change_password: true,
  };
}

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

  (userModel.findExistingEmails as jest.Mock).mockResolvedValue([] as never);

  // Penyimpanan massal mengembalikan sebanyak baris yang diminta
  (userModel.insertUsersByAdmin as jest.Mock).mockImplementation((_db, daftar) =>
    Promise.resolve(
      (daftar as { email: string; role: string }[]).map((row, i) =>
        akunPalsu(i, row.email, row.role),
      ),
    ) as never,
  );
  (employeeModel.createEmployees as jest.Mock).mockImplementation((_db, daftar) =>
    Promise.resolve(
      (daftar as { data: { full_name: string } }[]).map((row, i) => ({
        ...fakeEmployee,
        id: `emp-${i}`,
        full_name: row.data.full_name,
      })),
    ) as never,
  );
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
    (userModel.findExistingEmails as jest.Mock).mockResolvedValue([
      "baru@awan.io",
    ] as never);

    const res = await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(validCreate);

    expect(res.status).toBe(409);
    expect(employeeModel.createEmployees).not.toHaveBeenCalled();
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
    expect(res.body.data.employee.full_name).toBe("Karyawan Baru");
  });

  it("menyimpan password dalam bentuk hash argon2", async () => {
    siapkanBerhasil();

    await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(validCreate);

    const [, daftar] = (userModel.insertUsersByAdmin as jest.Mock).mock
      .calls[0] as [unknown, { password: string }[]];
    const passwordTersimpan = daftar[0]!.password;

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

    const [, daftarRole] = (userModel.insertUsersByAdmin as jest.Mock).mock
      .calls[0] as [unknown, { role: string }[]];
    const role = daftarRole[0]!.role;

    expect(role).toBe("employee");
  });

  it("memakai role yang dipilih admin", async () => {
    siapkanBerhasil();

    await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...validCreate, role: "admin" });

    const [, daftarRole] = (userModel.insertUsersByAdmin as jest.Mock).mock
      .calls[0] as [unknown, { role: string }[]];
    const role = daftarRole[0]!.role;

    expect(role).toBe("admin");
  });

  it("mencatat Admin yang membuat akun", async () => {
    siapkanBerhasil();

    await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(validCreate);

    const [, , approvedBy] = (userModel.insertUsersByAdmin as jest.Mock).mock
      .calls[0] as [unknown, unknown, string];

    expect(approvedBy).toBe(ADMIN_ID);
  });

  it("tidak menyimpan data akun ke tabel karyawan", async () => {
    siapkanBerhasil();

    await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...validCreate, role: "admin" });

    const [, daftarData] = (employeeModel.createEmployees as jest.Mock).mock
      .calls[0] as [unknown, { data: Record<string, unknown> }[]];
    const data = daftarData[0]!.data;

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

    const [dbUser] = (userModel.insertUsersByAdmin as jest.Mock).mock
      .calls[0] as [unknown];
    const [dbEmployee] = (employeeModel.createEmployees as jest.Mock).mock
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

    const [, daftar] = (employeeModel.createEmployees as jest.Mock).mock
      .calls[0] as [unknown, { user_id: string }[]];

    expect(daftar[0]!.user_id).toBe("user-0");
  });

  it("menjalankan ROLLBACK saat penyimpanan karyawan gagal", async () => {
    siapkanBerhasil();
    (employeeModel.createEmployees as jest.Mock).mockRejectedValue(
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
    (userModel.insertUsersByAdmin as jest.Mock).mockRejectedValue(
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

describe("POST /api/v1/employees dengan array", () => {
  const row = (nomor: number) => ({
    ...validCreate,
    email: `karyawan${nomor}@awan.io`,
    full_name: `Karyawan Nomor ${nomor}`,
  });

  function tambahMassal(employees: unknown[], token = adminToken) {
    return request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${token}`)
      .send(employees);
  }

  beforeEach(() => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(null as never);
    (userModel.insertUserByAdmin as jest.Mock).mockResolvedValue(
      fakeAccount as never,
    );
    (employeeModel.createEmployee as jest.Mock).mockResolvedValue(
      fakeEmployee as never,
    );
    (departmentModel.findById as jest.Mock).mockResolvedValue({
      id: DEPARTMENT_ID,
      name: "Engineering",
    } as never);
    (positionModel.findById as jest.Mock).mockResolvedValue({
      id: POSITION_ID,
      name: "Software Engineer",
    } as never);
  });

  it("menolak tamu yang belum login", async () => {
    const res = await request(app)
      .post("/api/v1/employees")
      .send([row(1)]);

    expect(res.status).toBe(401);
  });

  it("menolak karyawan biasa tanpa fitur employee.create", async () => {
    const res = await tambahMassal([row(1)], employeeToken);

    expect(res.status).toBe(403);
    expect(res.body.details.required_feature).toBe("employee.create");
  });

  it("menambah beberapa karyawan sekaligus", async () => {
    const res = await tambahMassal([row(1), row(2), row(3)]);

    expect(res.status).toBe(201);
    expect(res.body.meta.created).toBe(3);
    expect(res.body.data).toHaveLength(3);
    expect(employeeModel.createEmployees).toHaveBeenCalledTimes(1);
  });

  it("membungkus seluruh baris dalam satu transaksi", async () => {
    await tambahMassal([row(1), row(2)]);

    expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
    expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
  });

  it("menolak daftar kosong", async () => {
    const res = await tambahMassal([]);

    expect(res.status).toBe(400);
  });

  it("menolak jumlah melebihi batas lima ratus", async () => {
    const banyak = Array.from({ length: 501 }, (_, i) => row(i));

    const res = await tambahMassal(banyak);

    expect(res.status).toBe(400);
    expect(employeeModel.createEmployees).not.toHaveBeenCalled();
  });

  it("menolak seluruh permintaan bila ada satu email kembar di dalamnya", async () => {
    const res = await tambahMassal([row(1), row(2), row(1)]);

    expect(res.status).toBe(400);
    expect(res.body.details.failed_rows).toHaveLength(1);
    expect(res.body.details.failed_rows[0].index).toBe(2);
    expect(res.body.details.failed_rows[0].message).toContain("baris ke-1");
    expect(employeeModel.createEmployees).not.toHaveBeenCalled();
  });

  it("menolak seluruh permintaan bila ada email yang sudah terdaftar", async () => {
    (userModel.findExistingEmails as jest.Mock).mockResolvedValue([
      "karyawan2@awan.io",
    ] as never);

    const res = await tambahMassal([row(1), row(2), row(3)]);

    expect(res.status).toBe(400);
    expect(res.body.details.failed_rows[0].email).toBe("karyawan2@awan.io");
    expect(res.body.details.failed_rows[0].message).toContain(
      "sudah terdaftar",
    );
  });

  it("melaporkan seluruh baris bermasalah sekaligus, bukan satu per satu", async () => {
    (userModel.findExistingEmails as jest.Mock).mockResolvedValue([
      "karyawan1@awan.io",
      "karyawan3@awan.io",
    ] as never);

    const res = await tambahMassal([row(1), row(2), row(3)]);

    expect(res.body.details.failed_rows).toHaveLength(2);
    expect(res.body.message).toContain("2 dari 3 baris");
  });

  it("menolak baris yang departemennya tidak ditemukan", async () => {
    (departmentModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await tambahMassal([
      { ...row(1), department_id: DEPARTMENT_ID },
    ]);

    expect(res.status).toBe(400);
    expect(res.body.details.failed_rows[0].message).toContain(
      "Departemen tidak ditemukan",
    );
  });

  it("menolak baris yang kolomnya kosong atau datanya tidak sesuai", async () => {
    const res = await tambahMassal([row(1), { email: "bukan-email" }]);

    expect(res.status).toBe(400);
    expect(res.body.details.failed_rows[0].index).toBe(1);
    expect(employeeModel.createEmployees).not.toHaveBeenCalled();
  });

  it("tidak pernah mengembalikan password pada responsnya", async () => {
    const res = await tambahMassal([row(1)]);

    expect(JSON.stringify(res.body)).not.toContain("password123");
  });
});

describe("akun buatan admin langsung dapat dipakai", () => {
  const row = {
    email: "langsung@awan.io",
    password: "12345678",
    full_name: "Karyawan Langsung",
    phone: "+628110000201",
    gender: "male",
  };

  beforeEach(() => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(null as never);
    (userModel.insertUserByAdmin as jest.Mock).mockResolvedValue(
      fakeAccount as never,
    );
    (employeeModel.createEmployee as jest.Mock).mockResolvedValue(
      fakeEmployee as never,
    );
  });

  it("penambahan satuan memakai jalur pembuatan akun oleh admin", async () => {
    const res = await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(row);

    expect(res.status).toBe(201);
    expect(userModel.insertUsersByAdmin).toHaveBeenCalledTimes(1);
    expect(userModel.insertUser).not.toHaveBeenCalled();
  });

  it("penambahan massal memakai jalur yang sama, bukan jalur pendaftaran mandiri", async () => {
    const res = await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send([
        row,
        { ...row, email: "langsung2@awan.io", full_name: "Karyawan Dua" },
      ]);

    expect(res.status).toBe(201);
    expect(userModel.insertUsersByAdmin).toHaveBeenCalledTimes(1);
    expect(userModel.insertUser).not.toHaveBeenCalled();
  });

  it("kedua jalur tetap mewajibkan penggantian password saat login pertama", async () => {
    await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send([row]);

    const res = await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...row, email: "langsung3@awan.io" });

    expect(res.body.data.account.must_change_password).toBe(true);
  });
});

describe("satu endpoint, dua bentuk kiriman", () => {
  const satu = {
    email: "tunggal@awan.io",
    password: "12345678",
    full_name: "Karyawan Tunggal",
    phone: "+628110000301",
    gender: "male",
  };

  function kirim(body: unknown) {
    return request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(body as never);
  }

  beforeEach(() => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(null as never);
    (userModel.insertUserByAdmin as jest.Mock).mockResolvedValue(
      fakeAccount as never,
    );
    (employeeModel.createEmployee as jest.Mock).mockResolvedValue(
      fakeEmployee as never,
    );
  });

  it("objek tunggal menghasilkan data berbentuk objek", async () => {
    const res = await kirim(satu);

    expect(res.status).toBe(201);
    expect(Array.isArray(res.body.data)).toBe(false);
    expect(res.body.data.employee).toBeDefined();
    expect(res.body.data.account).toBeDefined();
    expect(res.body.meta).toBeUndefined();
  });

  it("array menghasilkan data berbentuk array beserta meta", async () => {
    const res = await kirim([satu, { ...satu, email: "tunggal2@awan.io" }]);

    expect(res.status).toBe(201);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.created).toBe(2);
  });

  it("array berisi satu tetap dijawab sebagai array", async () => {
    const res = await kirim([satu]);

    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.created).toBe(1);
  });

  it("galat objek tunggal menunjuk kolom tanpa nomor baris", async () => {
    const res = await kirim({ ...satu, email: "bukan-email" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(res.body.errors.some((e: { field: string }) => e.field === "email"))
      .toBe(true);
  });

  it("galat array menunjuk nomor baris beserta kolomnya", async () => {
    const res = await kirim([satu, { ...satu, email: "bukan-email" }]);

    expect(res.status).toBe(400);

    const [gagal] = res.body.details.failed_rows;

    expect(gagal.index).toBe(1);
    expect(
      gagal.errors.some((e: { field: string }) => e.field === "email"),
    ).toBe(true);
  });

  it("email duplikat pada kiriman tunggal tetap dijawab 409", async () => {
    (userModel.findExistingEmails as jest.Mock).mockResolvedValue([
      "tunggal@awan.io",
    ] as never);

    const res = await kirim(satu);

    expect(res.status).toBe(409);
    expect(res.body.message).toContain("sudah terdaftar");
  });

  it("email duplikat pada kiriman array dijawab 400 beserta daftar barisnya", async () => {
    (userModel.findExistingEmails as jest.Mock).mockResolvedValue([
      "tunggal@awan.io",
    ] as never);

    const res = await kirim([satu]);

    expect(res.status).toBe(400);
    expect(res.body.details.failed_rows[0].index).toBe(0);
  });

  it("tidak membocorkan penanda internal pada daftar baris gagal", async () => {
    (userModel.findExistingEmails as jest.Mock).mockResolvedValue([
      "tunggal@awan.io",
    ] as never);

    const res = await kirim([satu]);

    expect(res.body.details.failed_rows[0]).toEqual({
      index: 0,
      email: "tunggal@awan.io",
      message: "Email sudah terdaftar",
      errors: [{ field: "email", message: "Email sudah terdaftar" }],
    });
  });

  it("menolak array kosong", async () => {
    const res = await kirim([]);

    expect(res.status).toBe(400);
    expect(employeeModel.createEmployees).not.toHaveBeenCalled();
  });
});

describe("laporan per baris pada impor massal", () => {
  const utuh = (n: number) => ({
    email: `orang${n}@awan.io`,
    password: "12345678",
    full_name: `Orang Nomor ${n}`,
    phone: "+628110000401",
    gender: "male",
  });

  function kirim(body: unknown[]) {
    return request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(body as never);
  }

  beforeEach(() => {
    (userModel.findByEmail as jest.Mock).mockResolvedValue(null as never);
    (userModel.insertUserByAdmin as jest.Mock).mockResolvedValue(
      fakeAccount as never,
    );
    (employeeModel.createEmployee as jest.Mock).mockResolvedValue(
      fakeEmployee as never,
    );
    (departmentModel.findById as jest.Mock).mockResolvedValue({
      id: DEPARTMENT_ID,
    } as never);
  });

  it("melaporkan jumlah baris yang benar dan yang bermasalah", async () => {
    const res = await kirim([utuh(1), { email: "rusak" }, utuh(3)]);

    expect(res.status).toBe(400);
    expect(res.body.details.total).toBe(3);
    expect(res.body.details.valid).toBe(2);
    expect(res.body.details.invalid).toBe(1);
  });

  it("menyebut setiap kolom yang kosong pada satu baris", async () => {
    const res = await kirim([utuh(1), { email: "ada@awan.io" }]);

    const column = res.body.details.failed_rows[0].errors.map(
      (e: { field: string }) => e.field,
    );

    expect(column).toEqual(
      expect.arrayContaining(["password", "full_name", "phone", "gender"]),
    );
  });

  it("membedakan kolom kosong dari data yang tidak sesuai", async () => {
    const res = await kirim([
      { ...utuh(1), email: "bukan-email", gender: "" },
    ]);

    const errors = res.body.details.failed_rows[0].errors as {
      field: string;
      message: string;
    }[];

    expect(errors.find((e) => e.field === "email")?.message).toContain(
      "Format email tidak valid",
    );
    expect(errors.find((e) => e.field === "gender")).toBeDefined();
  });

  it("menandai kolom relasi yang tidak ditemukan, bukan kolom email", async () => {
    (departmentModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await kirim([{ ...utuh(1), department_id: DEPARTMENT_ID }]);

    expect(res.body.details.failed_rows[0].errors).toEqual([
      { field: "department_id", message: "Departemen tidak ditemukan" },
    ]);
  });

  it("nomor baris tetap benar walau yang gagal ada di tahap berbeda", async () => {
    (userModel.findExistingEmails as jest.Mock).mockResolvedValue([
      "orang3@awan.io",
    ] as never);

    // baris 1 gagal bentuk, baris 3 gagal isi
    const res = await kirim([utuh(0), { email: "rusak" }, utuh(2), utuh(3)]);

    const indeks = res.body.details.failed_rows.map(
      (r: { index: number }) => r.index,
    );

    expect(indeks).toEqual([1, 3]);
  });

  it("ringkasan pesan tetap ada agar klien lama tidak rusak", async () => {
    const res = await kirim([{ email: "ada@awan.io" }]);

    expect(typeof res.body.details.failed_rows[0].message).toBe("string");
    expect(res.body.details.failed_rows[0].message.length).toBeGreaterThan(0);
  });

  it("password yang sama hanya di-hash sekali", async () => {
    const daftar = Array.from({ length: 5 }, (_, i) => utuh(i));

    const res = await kirim(daftar);

    expect(res.status).toBe(201);

    const [, daftarHash] = (userModel.insertUsersByAdmin as jest.Mock).mock
      .calls[0] as [unknown, { password: string }[]];
    const hashTersimpan = daftarHash.map((row) => row.password);

    expect(hashTersimpan).toHaveLength(5);
    expect(new Set(hashTersimpan).size).toBe(1);
  });

  it("password berbeda tetap menghasilkan hash yang berbeda", async () => {
    const res = await kirim([
      { ...utuh(1), password: "12345678" },
      { ...utuh(2), password: "87654321" },
    ]);

    expect(res.status).toBe(201);

    const [, daftarHash] = (userModel.insertUsersByAdmin as jest.Mock).mock
      .calls[0] as [unknown, { password: string }[]];
    const hashTersimpan = daftarHash.map((row) => row.password);

    expect(new Set(hashTersimpan).size).toBe(2);
  });

  it("menerima jumlah baris di bawah batas baru", async () => {
    const daftar = Array.from({ length: 250 }, (_, i) => utuh(i));

    const res = await kirim(daftar);

    expect(res.status).toBe(201);
    expect(res.body.meta.created).toBe(250);
  });
});

describe("catatan aktivitas penambahan karyawan", () => {
  const satu = {
    email: "arif@awan.io",
    password: "rahasia12345",
    full_name: "Arif Budiman",
    phone: "+628110000601",
    gender: "male",
  };

  function kirim(body: unknown) {
    return request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("User-Agent", "PengujiHRIS/1.0")
      .send(body as never);
  }

  function catatanTerakhir(mock: jest.Mock) {
    const panggilan = mock.mock.calls.at(-1) as [
      { activity: Record<string, unknown> },
      string,
    ];

    return panggilan[0].activity;
  }

  beforeEach(() => {
    (userModel.findExistingEmails as jest.Mock).mockResolvedValue([] as never);
    (userModel.insertUsersByAdmin as jest.Mock).mockResolvedValue(
      [fakeAccount] as never,
    );
    (employeeModel.createEmployees as jest.Mock).mockResolvedValue(
      [fakeEmployee] as never,
    );
  });

  it("mencatat penambahan satu karyawan sebagai berhasil", async () => {
    const res = await kirim(satu);

    expect(res.status).toBe(201);

    const noteField = catatanTerakhir(logger.info as jest.Mock);

    expect(noteField.action).toBe("employee.create");
    expect(noteField.status).toBe("success");
    expect(noteField.entity).toBe("employee");
    expect(noteField.entity_id).toBe(EMPLOYEE_ID);
  });

  it("mencatat penambahan massal dengan aksi yang berbeda", async () => {
    (userModel.insertUsersByAdmin as jest.Mock).mockResolvedValue([
      fakeAccount,
      fakeAccount,
    ] as never);
    (employeeModel.createEmployees as jest.Mock).mockResolvedValue([
      fakeEmployee,
      fakeEmployee,
    ] as never);

    await kirim([satu, { ...satu, email: "arif2@awan.io" }]);

    const noteField = catatanTerakhir(logger.info as jest.Mock);

    expect(noteField.action).toBe("employee.create_bulk");
    expect(noteField.entity_id).toBeNull();
    expect((noteField.metadata as { created: number }).created).toBe(2);
  });

  it("mencatat siapa pelakunya beserta alamat dan perangkatnya", async () => {
    await kirim(satu);

    const noteField = catatanTerakhir(logger.info as jest.Mock);

    expect(noteField.actor_user_id).toBe(ADMIN_ID);
    expect(noteField.user_agent).toBe("PengujiHRIS/1.0");
    expect(noteField.ip_address).not.toBeUndefined();
  });

  it("mencatat waktu peristiwa, waktu catatan, dan lama prosesnya", async () => {
    await kirim(satu);

    const noteField = catatanTerakhir(logger.info as jest.Mock);

    const terjadi = new Date(noteField.occurred_at as string).getTime();
    const dicatat = new Date(noteField.created_at as string).getTime();

    expect(Number.isNaN(terjadi)).toBe(false);
    expect(dicatat).toBeGreaterThanOrEqual(terjadi);
    expect(noteField.duration_ms).toBe(dicatat - terjadi);
  });

  it("waktu peristiwa diambil sebelum penyimpanan, bukan sesudahnya", async () => {
    const sebelum = Date.now();
    await kirim(satu);

    const noteField = catatanTerakhir(logger.info as jest.Mock);
    const terjadi = new Date(noteField.occurred_at as string).getTime();

    // peristiwanya mulai sebelum respons selesai, bukan pada detik penulisan log
    expect(terjadi).toBeGreaterThanOrEqual(sebelum);
    expect(terjadi).toBeLessThanOrEqual(
      new Date(noteField.created_at as string).getTime(),
    );
  });

  it("tidak pernah mencatat password maupun hash-nya", async () => {
    await kirim(satu);

    const noteField = JSON.stringify(catatanTerakhir(logger.info as jest.Mock));

    expect(noteField).not.toContain("rahasia12345");
    expect(noteField).not.toContain("password");
    expect(noteField).not.toContain("$argon2");
  });

  it("mencatat penolakan sebagai gagal beserta kolom yang bermasalah", async () => {
    await kirim([satu, { email: "rusak" }]);

    const noteField = catatanTerakhir(logger.warn as jest.Mock);

    expect(noteField.status).toBe("failed");
    expect(noteField.action).toBe("employee.create_bulk");

    const meta = noteField.metadata as {
      total: number;
      valid: number;
      invalid: number;
      failed_rows: {
        total: number;
        truncated: boolean;
        sample: { index: number; fields: string[] }[];
      };
    };

    expect(meta).toMatchObject({ total: 2, valid: 1, invalid: 1 });
    expect(meta.failed_rows.total).toBe(1);
    expect(meta.failed_rows.truncated).toBe(false);
    expect(meta.failed_rows.sample[0]!.index).toBe(1);
    expect(meta.failed_rows.sample[0]!.fields).toEqual(
      expect.arrayContaining(["password", "full_name"]),
    );
  });

  it("mencatat penolakan pada kiriman satu objek", async () => {
    (userModel.findExistingEmails as jest.Mock).mockResolvedValue([
      "arif@awan.io",
    ] as never);

    const res = await kirim(satu);

    expect(res.status).toBe(409);

    const noteField = catatanTerakhir(logger.warn as jest.Mock);

    expect(noteField.action).toBe("employee.create");
    expect(noteField.status).toBe("failed");
    expect((noteField.metadata as { email: string }).email).toBe("arif@awan.io");
  });

  it("tidak mencatat keberhasilan ketika permintaan ditolak", async () => {
    (userModel.findExistingEmails as jest.Mock).mockResolvedValue([
      "arif@awan.io",
    ] as never);

    await kirim(satu);

    expect(logger.info).not.toHaveBeenCalled();
  });
});

describe("log tetap ada saat terjadi kegagalan tak terduga", () => {
  const row = {
    email: "zaki@awan.io",
    password: "12345678",
    full_name: "Zaki Rahman",
    phone: "+628110000901",
    gender: "male",
  };

  function catatanTerakhir(mock: jest.Mock) {
    const panggilan = mock.mock.calls.at(-1) as [
      { activity: Record<string, unknown> },
      string,
    ];

    return panggilan[0].activity;
  }

  beforeEach(() => {
    (userModel.findExistingEmails as jest.Mock).mockResolvedValue([] as never);
  });

  it("kegagalan database tetap meninggalkan catatan", async () => {
    (userModel.insertUsersByAdmin as jest.Mock).mockRejectedValue(
      new Error("koneksi ke database putus") as never,
    );

    const res = await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(row);

    expect(res.status).toBe(500);

    const noteField = catatanTerakhir(logger.warn as jest.Mock);

    expect(noteField.status).toBe("failed");
    expect(noteField.summary).toContain("galat tak terduga");
    expect((noteField.metadata as { error: string }).error).toContain(
      "koneksi ke database putus",
    );
  });

  it("waktu peristiwa pada catatan galat tetap yang sebenarnya", async () => {
    (employeeModel.createEmployees as jest.Mock).mockRejectedValue(
      new Error("gagal menyimpan") as never,
    );

    const sebelum = Date.now();
    await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(row);

    const noteField = catatanTerakhir(logger.warn as jest.Mock);
    const terjadi = new Date(noteField.occurred_at as string).getTime();

    expect(terjadi).toBeGreaterThanOrEqual(sebelum);
    expect(noteField.duration_ms as number).toBeGreaterThanOrEqual(0);
  });

  it("penolakan yang sudah dilaporkan tidak dicatat dua kali", async () => {
    (userModel.findExistingEmails as jest.Mock).mockResolvedValue([
      "zaki@awan.io",
    ] as never);

    await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(row);

    expect((logger.warn as jest.Mock).mock.calls).toHaveLength(1);
  });
});

describe("ukuran catatan dibatasi", () => {
  const row = (n: number) => ({
    email: `massal${n}@awan.io`,
    password: "12345678",
    full_name: `Karyawan Massal ${n}`,
    phone: "+628110000902",
    gender: "male",
  });

  it("rincian dipotong dan menyebut jumlah sebenarnya", async () => {
    const banyak = Array.from({ length: 60 }, (_, i) => row(i));

    (userModel.findExistingEmails as jest.Mock).mockResolvedValue([] as never);
    (userModel.insertUsersByAdmin as jest.Mock).mockResolvedValue(
      banyak.map((b, i) => ({
        id: `u${i}`,
        email: b.email,
        role: "employee",
        must_change_password: true,
      })) as never,
    );
    (employeeModel.createEmployees as jest.Mock).mockResolvedValue(
      banyak.map((b, i) => ({
        ...fakeEmployee,
        id: `e${i}`,
        full_name: b.full_name,
      })) as never,
    );

    const res = await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(banyak);

    expect(res.status).toBe(201);

    const panggilan = (logger.info as jest.Mock).mock.calls.at(-1) as [
      { activity: { metadata: Record<string, unknown> } },
    ];
    const meta = panggilan[0].activity.metadata as {
      created: number;
      employees: { total: number; sample: unknown[]; truncated: boolean };
    };

    // jumlah sebenarnya tetap terbaca walau rinciannya dipotong
    expect(meta.created).toBe(60);
    expect(meta.employees.total).toBe(60);
    expect(meta.employees.truncated).toBe(true);
    expect(meta.employees.sample).toHaveLength(20);
  });
});

describe("kiriman berbentuk objek berkunci nomor", () => {
  const row = (n: number) => ({
    email: `idx${n}@awan.io`,
    password: "12345678",
    full_name: `Karyawan Indeks ${n}`,
    phone: "+628110000904",
    gender: "male",
  });

  function kirim(body: unknown) {
    return request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(body as never);
  }

  beforeEach(() => {
    (userModel.findExistingEmails as jest.Mock).mockResolvedValue([] as never);
    (userModel.insertUsersByAdmin as jest.Mock).mockImplementation((_db, list) =>
      Promise.resolve(
        (list as { email: string }[]).map((b, i) => ({
          id: `u${i}`,
          email: b.email,
          role: "employee",
          must_change_password: true,
        })),
      ) as never,
    );
    (employeeModel.createEmployees as jest.Mock).mockImplementation((_db, list) =>
      Promise.resolve(
        (list as { data: { full_name: string } }[]).map((b, i) => ({
          ...fakeEmployee,
          id: `e${i}`,
          full_name: b.data.full_name,
        })),
      ) as never,
    );
  });

  it("menerima objek berkunci nomor mulai dari nol", async () => {
    const res = await kirim({ "0": row(0), "1": row(1), "2": row(2) });

    expect(res.status).toBe(201);
    expect(res.body.meta.created).toBe(3);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("memakai urutan nomor kuncinya, bukan urutan kiriman", async () => {
    const res = await kirim({ "2": row(2), "0": row(0), "1": row(1) });

    expect(res.status).toBe(201);
    expect(res.body.data[0].employee.full_name).toBe("Karyawan Indeks 0");
    expect(res.body.data[1].employee.full_name).toBe("Karyawan Indeks 1");
    expect(res.body.data[2].employee.full_name).toBe("Karyawan Indeks 2");
  });

  it("mengurutkan nomor secara angka, bukan secara teks", async () => {
    const banyak: Record<string, unknown> = {};
    for (let i = 0; i < 12; i++) banyak[String(i)] = row(i);

    const res = await kirim(banyak);

    expect(res.status).toBe(201);
    // kalau diurutkan sebagai teks, "10" akan mendahului "2"
    expect(res.body.data[2].employee.full_name).toBe("Karyawan Indeks 2");
    expect(res.body.data[10].employee.full_name).toBe("Karyawan Indeks 10");
  });

  it("menolak kunci yang tidak mulai dari nol", async () => {
    const res = await kirim({ "1": row(1), "2": row(2) });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("berurutan dari 0");
    expect(employeeModel.createEmployees).not.toHaveBeenCalled();
  });

  it("menolak kunci yang bolong, tanda ada baris hilang", async () => {
    const res = await kirim({ "0": row(0), "1": row(1), "3": row(3) });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Yang hilang: 2");
    expect(res.body.details.missing).toEqual([2]);
    expect(res.body.details.received).toEqual([0, 1, 3]);
  });

  it("menolak dua kunci yang bernilai angka sama", async () => {
    // "01" dan "1" sama-sama bernilai 1, tanda penomoran frontend bermasalah
    const res = await kirim({ "0": row(0), "01": row(1), "1": row(2) });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("lebih dari sekali");
    expect(employeeModel.createEmployees).not.toHaveBeenCalled();
  });

  it("menerima nomor berpadding selama nilainya tetap berurutan", async () => {
    // frontend yang memformat "000", "001" tetap sah karena nilainya 0 dan 1
    const res = await kirim({ "000": row(0), "001": row(1) });

    expect(res.status).toBe(201);
    expect(res.body.meta.created).toBe(2);
  });

  it("galat menunjuk nomor kunci yang sama dengan yang dikirim", async () => {
    const res = await kirim({
      "0": row(0),
      "1": { email: "rusak" },
      "2": row(2),
    });

    expect(res.status).toBe(400);
    expect(res.body.details.failed_rows[0].index).toBe(1);
    expect(res.body.details.total).toBe(3);
    expect(res.body.details.valid).toBe(2);
  });

  it("objek karyawan biasa tetap dibaca sebagai satu karyawan", async () => {
    const res = await kirim(row(0));

    expect(res.status).toBe(201);
    expect(Array.isArray(res.body.data)).toBe(false);
    expect(res.body.meta).toBeUndefined();
  });

  it("dicatat sebagai penambahan massal pada log", async () => {
    await kirim({ "0": row(0), "1": row(1) });

    const panggilan = (logger.info as jest.Mock).mock.calls.at(-1) as [
      { activity: { action: string; metadata: { created: number } } },
    ];

    expect(panggilan[0].activity.action).toBe("employee.create_bulk");
    expect(panggilan[0].activity.metadata.created).toBe(2);
  });
});

describe("respons menyebut index untuk yang berhasil maupun yang gagal", () => {
  const row = (n: number) => ({
    email: `hasil${n}@awan.io`,
    password: "12345678",
    full_name: `Karyawan Hasil ${n}`,
    phone: "+628110000905",
    gender: "male",
  });

  function kirim(body: unknown) {
    return request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(body as never);
  }

  beforeEach(() => {
    (userModel.findExistingEmails as jest.Mock).mockResolvedValue([] as never);
    (userModel.insertUsersByAdmin as jest.Mock).mockImplementation((_db, list) =>
      Promise.resolve(
        (list as { email: string }[]).map((b, i) => ({
          id: `u${i}`,
          email: b.email,
          role: "employee",
          must_change_password: true,
        })),
      ) as never,
    );
    (employeeModel.createEmployees as jest.Mock).mockImplementation((_db, list) =>
      Promise.resolve(
        (list as { data: { full_name: string } }[]).map((b, i) => ({
          ...fakeEmployee,
          id: `e${i}`,
          employee_number: String(i + 1).padStart(3, "0"),
          full_name: b.data.full_name,
        })),
      ) as never,
    );
  });

  it("setiap yang berhasil menyebut index dan siapa orangnya", async () => {
    const res = await kirim([row(0), row(1), row(2)]);

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveLength(3);

    res.body.data.forEach((entry: Record<string, unknown>, i: number) => {
      expect(entry.index).toBe(i);
      expect((entry.employee as { full_name: string }).full_name).toBe(
        `Karyawan Hasil ${i}`,
      );
      expect((entry.account as { email: string }).email).toBe(
        `hasil${i}@awan.io`,
      );
    });
  });

  it("index pada hasil sesuai kunci saat kiriman berbentuk objek", async () => {
    const res = await kirim({ "1": row(1), "0": row(0) });

    expect(res.status).toBe(201);
    expect(res.body.data[0].index).toBe(0);
    expect(res.body.data[0].employee.full_name).toBe("Karyawan Hasil 0");
    expect(res.body.data[1].index).toBe(1);
  });

  it("setiap yang gagal menyebut index, siapa, dan alasan per kolom", async () => {
    const res = await kirim([
      row(0),
      { email: "rusak", full_name: "Ab" },
      row(2),
    ]);

    expect(res.status).toBe(400);

    const [gagal] = res.body.details.failed_rows;

    expect(gagal.index).toBe(1);
    expect(gagal.email).toBe("rusak");
    expect(gagal.errors.map((e: { field: string }) => e.field)).toEqual(
      expect.arrayContaining(["email", "full_name", "phone", "gender"]),
    );
  });

  it("kolom opsional yang dikirim kosong tidak menggagalkan baris", async () => {
    const res = await kirim([
      {
        ...row(0),
        birth_date: "",
        address: "",
        department_id: "",
        join_date: "",
      },
    ]);

    expect(res.status).toBe(201);
  });

  it("tanggal yang tidak masuk akal ditolak beserta kolomnya", async () => {
    const res = await kirim([row(0), { ...row(1), birth_date: "2021-01-01" }]);

    expect(res.status).toBe(400);
    expect(res.body.details.failed_rows[0].index).toBe(1);
    expect(
      res.body.details.failed_rows[0].errors.some(
        (e: { field: string }) => e.field === "birth_date",
      ),
    ).toBe(true);
  });
});

describe("setiap karyawan wajib punya akun", () => {
  const row = (n: number) => ({
    email: `akun${n}@awan.io`,
    password: "12345678",
    full_name: `Karyawan Akun ${n}`,
    phone: "+628110000906",
    gender: "male",
  });

  function kirim(body: unknown) {
    return request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(body as never);
  }

  beforeEach(() => {
    (userModel.findExistingEmails as jest.Mock).mockResolvedValue([] as never);
    (userModel.insertUsersByAdmin as jest.Mock).mockImplementation((_db, list) =>
      Promise.resolve(
        (list as { email: string }[]).map((b, i) => ({
          id: `u${i}`,
          email: b.email,
          role: "employee",
          must_change_password: true,
        })),
      ) as never,
    );
    (employeeModel.createEmployees as jest.Mock).mockImplementation((_db, list) =>
      Promise.resolve(
        (list as unknown[]).map((_b, i) => ({ ...fakeEmployee, id: `e${i}` })),
      ) as never,
    );
  });

  it("akun dibuat lebih dulu, karyawan menyusul dengan user_id-nya", async () => {
    await kirim([row(0), row(1)]);

    const urutanAkun = (userModel.insertUsersByAdmin as jest.Mock).mock
      .invocationCallOrder[0]!;
    const urutanKaryawan = (employeeModel.createEmployees as jest.Mock).mock
      .invocationCallOrder[0]!;

    expect(urutanAkun).toBeLessThan(urutanKaryawan);
  });

  it("setiap karyawan yang disimpan membawa user_id", async () => {
    await kirim([row(0), row(1), row(2)]);

    const [, list] = (employeeModel.createEmployees as jest.Mock).mock
      .calls[0] as [unknown, { user_id: string }[]];

    expect(list).toHaveLength(3);
    for (const entry of list) {
      expect(entry.user_id).toBeTruthy();
    }
  });

  it("setiap hasil selalu menyertakan akunnya", async () => {
    const res = await kirim([row(0), row(1)]);

    for (const entry of res.body.data) {
      expect(entry.account.id).toBeTruthy();
      expect(entry.account.email).toBeTruthy();
      expect(entry.account.must_change_password).toBe(true);
    }
  });

  it("gagal seluruhnya kalau jumlah akun tidak cocok dengan jumlah karyawan", async () => {
    // hanya satu akun dikembalikan padahal dua baris dikirim
    (userModel.insertUsersByAdmin as jest.Mock).mockResolvedValue([
      { id: "u0", email: "akun0@awan.io", role: "employee", must_change_password: true },
    ] as never);

    const res = await kirim([row(0), row(1)]);

    expect(res.status).toBe(500);
    expect(employeeModel.createEmployees).not.toHaveBeenCalled();
    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("kegagalan pembuatan akun membatalkan penyimpanan karyawan", async () => {
    (userModel.insertUsersByAdmin as jest.Mock).mockRejectedValue(
      new Error("email bentrok") as never,
    );

    const res = await kirim([row(0)]);

    expect(res.status).toBe(500);
    expect(employeeModel.createEmployees).not.toHaveBeenCalled();
    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    expect(mockClient.query).not.toHaveBeenCalledWith("COMMIT");
  });
});
