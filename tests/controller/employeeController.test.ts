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
const { MAX_EMPLOYEES_PER_REQUEST } =
  await import("../../src/schema/employeeSchema.js");

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

function fakeAccountRow(index: number, email: string, role = "employee") {
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
  (userModel.insertUsersByAdmin as jest.Mock).mockImplementation(
    (_db, inputRows) =>
      Promise.resolve(
        (inputRows as { email: string; role: string }[]).map((row, i) =>
          fakeAccountRow(i, row.email, row.role),
        ),
      ) as never,
  );
  (employeeModel.createEmployees as jest.Mock).mockImplementation(
    (_db, inputRows) =>
      Promise.resolve(
        (inputRows as { data: { full_name: string } }[]).map((row, i) => ({
          ...fakeEmployee,
          id: `emp-${i}`,
          full_name: row.data.full_name,
        })),
      ) as never,
  );
});

describe("GET /api/v1/employees", () => {
  function prepareBulkInsert(total = 25) {
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
    prepareBulkInsert();

    const res = await request(app)
      .get("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("mengizinkan admin", async () => {
    prepareBulkInsert();

    const res = await request(app)
      .get("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
  });

  it("memakai halaman dan batas bawaan", async () => {
    prepareBulkInsert();

    const res = await request(app)
      .get("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.limit).toBe(10);
  });

  it("menghitung jumlah halaman dari total data", async () => {
    prepareBulkInsert(25);

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
    prepareBulkInsert();

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
  function prepareSuccess() {
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
    prepareSuccess();
    (departmentModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...validCreate, department_id: DEPARTMENT_ID });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Department not found");
  });

  it("menolak jabatan yang tidak ada", async () => {
    prepareSuccess();
    (positionModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...validCreate, position_id: POSITION_ID });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Position not found");
  });

  it("menolak manajer yang tidak ada", async () => {
    prepareSuccess();
    (employeeModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...validCreate, manager_id: MANAGER_ID });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Manager not found");
  });

  it("membuat karyawan dan mengembalikan 201", async () => {
    prepareSuccess();

    const res = await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(validCreate);

    expect(res.status).toBe(201);
    expect(res.body.data.employee.full_name).toBe("Karyawan Baru");
  });

  it("menyimpan password dalam bentuk hash argon2", async () => {
    prepareSuccess();

    await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(validCreate);

    const [, inputRows] = (userModel.insertUsersByAdmin as jest.Mock).mock
      .calls[0] as [unknown, { password: string }[]];
    const storedPassword = inputRows[0]!.password;

    expect(storedPassword).not.toBe("password123");
    expect(storedPassword).toContain("$argon2id$");
  });

  it("tidak mengembalikan password dalam respons", async () => {
    prepareSuccess();

    const res = await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(validCreate);

    expect(JSON.stringify(res.body)).not.toContain("password123");
  });

  it("memakai role employee jika tidak ditentukan", async () => {
    prepareSuccess();

    await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(validCreate);

    const [, roleList] = (userModel.insertUsersByAdmin as jest.Mock).mock
      .calls[0] as [unknown, { role: string }[]];
    const role = roleList[0]!.role;

    expect(role).toBe("employee");
  });

  it("memakai role yang dipilih admin", async () => {
    prepareSuccess();

    await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...validCreate, role: "admin" });

    const [, roleList] = (userModel.insertUsersByAdmin as jest.Mock).mock
      .calls[0] as [unknown, { role: string }[]];
    const role = roleList[0]!.role;

    expect(role).toBe("admin");
  });

  it("mencatat Admin yang membuat akun", async () => {
    prepareSuccess();

    await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(validCreate);

    const [, , approvedBy] = (userModel.insertUsersByAdmin as jest.Mock).mock
      .calls[0] as [unknown, unknown, string];

    expect(approvedBy).toBe(ADMIN_ID);
  });

  it("tidak menyimpan data akun ke tabel karyawan", async () => {
    prepareSuccess();

    await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...validCreate, role: "admin" });

    const [, dataList] = (employeeModel.createEmployees as jest.Mock).mock
      .calls[0] as [unknown, { data: Record<string, unknown> }[]];
    const data = dataList[0]!.data;

    expect(data).not.toHaveProperty("email");
    expect(data).not.toHaveProperty("password");
    expect(data).not.toHaveProperty("role");
    expect(data.full_name).toBe("Karyawan Baru");
  });

  it("memberi tahu bahwa password awal harus diganti", async () => {
    prepareSuccess();

    const res = await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(validCreate);

    expect(res.body.data.account.must_change_password).toBe(true);
  });

  it("menyimpan akun dan karyawan dalam satu transaksi", async () => {
    prepareSuccess();

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
    prepareSuccess();

    await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(validCreate);

    const [, inputRows] = (employeeModel.createEmployees as jest.Mock).mock
      .calls[0] as [unknown, { user_id: string }[]];

    expect(inputRows[0]!.user_id).toBe("user-0");
  });

  it("menjalankan ROLLBACK saat penyimpanan karyawan gagal", async () => {
    prepareSuccess();
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
    prepareSuccess();
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
  function prepareSuccess() {
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
    prepareSuccess();

    const res = await request(app)
      .patch(`/api/v1/employees/${EMPLOYEE_ID}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ full_name: "Nama Baru" });

    expect(res.status).toBe(200);
    expect(res.body.data.full_name).toBe("Nama Baru");
  });

  it("meneruskan id dan perubahan ke model", async () => {
    prepareSuccess();

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
    prepareSuccess();

    const res = await request(app)
      .patch(`/api/v1/employees/${EMPLOYEE_ID}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ manager_id: EMPLOYEE_ID });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("their own manager");
    expect(employeeModel.updateEmployee).not.toHaveBeenCalled();
  });

  it("menolak struktur manajer yang melingkar", async () => {
    prepareSuccess();
    (employeeModel.isDescendantOf as jest.Mock).mockResolvedValue(
      true as never,
    );

    const res = await request(app)
      .patch(`/api/v1/employees/${EMPLOYEE_ID}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ manager_id: MANAGER_ID });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("circular");
    expect(employeeModel.updateEmployee).not.toHaveBeenCalled();
  });

  it("menerima manajer yang tidak membentuk lingkaran", async () => {
    prepareSuccess();

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
    prepareSuccess();
    (departmentModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await request(app)
      .patch(`/api/v1/employees/${EMPLOYEE_ID}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ department_id: DEPARTMENT_ID });

    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/v1/employees/:id", () => {
  function prepareSuccess() {
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
    prepareSuccess();
    (employeeModel.findSubordinates as jest.Mock).mockResolvedValue([
      { id: "1", employee_number: "002", full_name: "Bawahan Satu" },
      { id: "2", employee_number: "003", full_name: "Bawahan Dua" },
    ] as never);

    const res = await request(app)
      .delete(`/api/v1/employees/${EMPLOYEE_ID}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("2 employees");
    expect(employeeModel.softDeleteEmployee).not.toHaveBeenCalled();
  });

  it("menyertakan daftar bawahan agar Admin tahu siapa yang harus dipindah", async () => {
    prepareSuccess();
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
    prepareSuccess();

    const res = await request(app)
      .delete(`/api/v1/employees/${EMPLOYEE_ID}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("deleted successfully");
  });

  it("menonaktifkan akun pengguna di transaksi yang sama", async () => {
    prepareSuccess();

    await request(app)
      .delete(`/api/v1/employees/${EMPLOYEE_ID}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(userModel.softDeleteUser).toHaveBeenCalledWith(mockClient, USER_ID);
    expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
    expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
  });

  it("melewati penghapusan akun jika karyawan tidak punya akun", async () => {
    prepareSuccess();
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
    prepareSuccess();
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
    prepareSuccess();

    await request(app)
      .delete(`/api/v1/employees/${EMPLOYEE_ID}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(mockClient.release).toHaveBeenCalled();
  });
});

describe("POST /api/v1/employees dengan array", () => {
  const row = (rowNumber: number) => ({
    ...validCreate,
    email: `karyawan${rowNumber}@awan.io`,
    full_name: `Karyawan Nomor ${rowNumber}`,
  });

  function bulkCreate(employees: unknown[], token = adminToken) {
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
    const res = await bulkCreate([row(1)], employeeToken);

    expect(res.status).toBe(403);
    expect(res.body.details.required_feature).toBe("employee.create");
  });

  it("menambah beberapa karyawan sekaligus", async () => {
    const res = await bulkCreate([row(1), row(2), row(3)]);

    expect(res.status).toBe(201);
    expect(res.body.meta.created).toBe(3);
    expect(res.body.data).toHaveLength(3);
    expect(employeeModel.createEmployees).toHaveBeenCalledTimes(1);
  });

  it("membungkus seluruh baris dalam satu transaksi", async () => {
    await bulkCreate([row(1), row(2)]);

    expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
    expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
  });

  it("menolak daftar kosong", async () => {
    const res = await bulkCreate([]);

    expect(res.status).toBe(400);
  });

  it("menolak jumlah melebihi batas per permintaan", async () => {
    const many = Array.from({ length: MAX_EMPLOYEES_PER_REQUEST + 1 }, (_, i) =>
      row(i),
    );

    const res = await bulkCreate(many);

    expect(res.status).toBe(400);
    expect(employeeModel.createEmployees).not.toHaveBeenCalled();
  });

  it("menolak seluruh permintaan bila ada satu email kembar di dalamnya", async () => {
    const res = await bulkCreate([row(1), row(2), row(1)]);

    expect(res.status).toBe(400);
    expect(res.body.details.failed_rows).toHaveLength(1);
    expect(res.body.details.failed_rows[0].index).toBe(2);
    expect(res.body.details.failed_rows[0].message).toContain("row 1");
    expect(employeeModel.createEmployees).not.toHaveBeenCalled();
  });

  it("menolak seluruh permintaan bila ada email yang sudah terdaftar", async () => {
    (userModel.findExistingEmails as jest.Mock).mockResolvedValue([
      "karyawan2@awan.io",
    ] as never);

    const res = await bulkCreate([row(1), row(2), row(3)]);

    expect(res.status).toBe(400);
    expect(res.body.details.failed_rows[0].email).toBe("karyawan2@awan.io");
    expect(res.body.details.failed_rows[0].message).toContain(
      "already registered",
    );
  });

  it("melaporkan seluruh baris bermasalah sekaligus, bukan satu per satu", async () => {
    (userModel.findExistingEmails as jest.Mock).mockResolvedValue([
      "karyawan1@awan.io",
      "karyawan3@awan.io",
    ] as never);

    const res = await bulkCreate([row(1), row(2), row(3)]);

    expect(res.body.details.failed_rows).toHaveLength(2);
    expect(res.body.message).toContain("2 of 3 rows");
  });

  it("menolak baris yang departemennya tidak ditemukan", async () => {
    (departmentModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await bulkCreate([{ ...row(1), department_id: DEPARTMENT_ID }]);

    expect(res.status).toBe(400);
    expect(res.body.details.failed_rows[0].message).toContain(
      "Department not found",
    );
  });

  it("menolak baris yang kolomnya kosong atau datanya tidak sesuai", async () => {
    const res = await bulkCreate([row(1), { email: "bukan-email" }]);

    expect(res.status).toBe(400);
    expect(res.body.details.failed_rows[0].index).toBe(1);
    expect(employeeModel.createEmployees).not.toHaveBeenCalled();
  });

  it("tidak pernah mengembalikan password pada responsnya", async () => {
    const res = await bulkCreate([row(1)]);

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
  const single = {
    email: "tunggal@awan.io",
    password: "12345678",
    full_name: "Karyawan Tunggal",
    phone: "+628110000301",
    gender: "male",
  };

  function submit(body: unknown) {
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
    const res = await submit(single);

    expect(res.status).toBe(201);
    expect(Array.isArray(res.body.data)).toBe(false);
    expect(res.body.data.employee).toBeDefined();
    expect(res.body.data.account).toBeDefined();
    expect(res.body.meta).toBeUndefined();
  });

  it("array menghasilkan data berbentuk array beserta meta", async () => {
    const res = await submit([
      single,
      { ...single, email: "tunggal2@awan.io" },
    ]);

    expect(res.status).toBe(201);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.created).toBe(2);
  });

  it("array berisi satu tetap dijawab sebagai array", async () => {
    const res = await submit([single]);

    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.created).toBe(1);
  });

  it("galat objek tunggal menunjuk kolom tanpa nomor baris", async () => {
    const res = await submit({ ...single, email: "bukan-email" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(
      res.body.errors.some((e: { field: string }) => e.field === "email"),
    ).toBe(true);
  });

  it("galat array menunjuk nomor baris beserta kolomnya", async () => {
    const res = await submit([single, { ...single, email: "bukan-email" }]);

    expect(res.status).toBe(400);

    const [failedRows] = res.body.details.failed_rows;

    expect(failedRows.index).toBe(1);
    expect(
      failedRows.errors.some((e: { field: string }) => e.field === "email"),
    ).toBe(true);
  });

  it("email duplikat pada kiriman tunggal tetap dijawab 409", async () => {
    (userModel.findExistingEmails as jest.Mock).mockResolvedValue([
      "tunggal@awan.io",
    ] as never);

    const res = await submit(single);

    expect(res.status).toBe(409);
    expect(res.body.message).toContain("already registered");
  });

  it("email duplikat pada kiriman array dijawab 400 beserta daftar barisnya", async () => {
    (userModel.findExistingEmails as jest.Mock).mockResolvedValue([
      "tunggal@awan.io",
    ] as never);

    const res = await submit([single]);

    expect(res.status).toBe(400);
    expect(res.body.details.failed_rows[0].index).toBe(0);
  });

  it("tidak membocorkan penanda internal pada daftar baris gagal", async () => {
    (userModel.findExistingEmails as jest.Mock).mockResolvedValue([
      "tunggal@awan.io",
    ] as never);

    const res = await submit([single]);

    expect(res.body.details.failed_rows[0]).toEqual({
      index: 0,
      email: "tunggal@awan.io",
      message: "Email is already registered",
      errors: [{ field: "email", message: "Email is already registered" }],
    });
  });

  it("menolak array kosong", async () => {
    const res = await submit([]);

    expect(res.status).toBe(400);
    expect(employeeModel.createEmployees).not.toHaveBeenCalled();
  });
});

describe("laporan per baris pada impor massal", () => {
  const intact = (n: number) => ({
    email: `orang${n}@awan.io`,
    password: "12345678",
    full_name: `Orang Nomor ${n}`,
    phone: "+628110000401",
    gender: "male",
  });

  function submit(body: unknown[]) {
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
    const res = await submit([intact(1), { email: "rusak" }, intact(3)]);

    expect(res.status).toBe(400);
    expect(res.body.details.total).toBe(3);
    expect(res.body.details.valid).toBe(2);
    expect(res.body.details.invalid).toBe(1);
  });

  it("menyebut setiap kolom yang kosong pada satu baris", async () => {
    const res = await submit([intact(1), { email: "ada@awan.io" }]);

    const column = res.body.details.failed_rows[0].errors.map(
      (e: { field: string }) => e.field,
    );

    expect(column).toEqual(
      expect.arrayContaining(["password", "full_name", "phone", "gender"]),
    );
  });

  it("membedakan kolom kosong dari data yang tidak sesuai", async () => {
    const res = await submit([
      { ...intact(1), email: "bukan-email", gender: "" },
    ]);

    const errors = res.body.details.failed_rows[0].errors as {
      field: string;
      message: string;
    }[];

    expect(errors.find((e) => e.field === "email")?.message).toContain(
      "Invalid email format",
    );
    expect(errors.find((e) => e.field === "gender")).toBeDefined();
  });

  it("menandai kolom relasi yang tidak ditemukan, bukan kolom email", async () => {
    (departmentModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await submit([{ ...intact(1), department_id: DEPARTMENT_ID }]);

    expect(res.body.details.failed_rows[0].errors).toEqual([
      { field: "department_id", message: "Department not found" },
    ]);
  });

  it("nomor baris tetap benar walau yang gagal ada di tahap berbeda", async () => {
    (userModel.findExistingEmails as jest.Mock).mockResolvedValue([
      "orang3@awan.io",
    ] as never);

    // baris 1 gagal bentuk, baris 3 gagal isi
    const res = await submit([
      intact(0),
      { email: "rusak" },
      intact(2),
      intact(3),
    ]);

    const itemIndex = res.body.details.failed_rows.map(
      (r: { index: number }) => r.index,
    );

    expect(itemIndex).toEqual([1, 3]);
  });

  it("ringkasan pesan tetap ada agar klien lama tidak rusak", async () => {
    const res = await submit([{ email: "ada@awan.io" }]);

    expect(typeof res.body.details.failed_rows[0].message).toBe("string");
    expect(res.body.details.failed_rows[0].message.length).toBeGreaterThan(0);
  });

  it("password yang sama hanya di-hash sekali", async () => {
    const inputRows = Array.from({ length: 5 }, (_, i) => intact(i));

    const res = await submit(inputRows);

    expect(res.status).toBe(201);

    const [, hashList] = (userModel.insertUsersByAdmin as jest.Mock).mock
      .calls[0] as [unknown, { password: string }[]];
    const storedHash = hashList.map((row) => row.password);

    expect(storedHash).toHaveLength(5);
    expect(new Set(storedHash).size).toBe(1);
  });

  it("password berbeda tetap menghasilkan hash yang berbeda", async () => {
    const res = await submit([
      { ...intact(1), password: "12345678" },
      { ...intact(2), password: "87654321" },
    ]);

    expect(res.status).toBe(201);

    const [, hashList] = (userModel.insertUsersByAdmin as jest.Mock).mock
      .calls[0] as [unknown, { password: string }[]];
    const storedHash = hashList.map((row) => row.password);

    expect(new Set(storedHash).size).toBe(2);
  });

  it("menerima jumlah baris tepat di batas", async () => {
    const inputRows = Array.from(
      { length: MAX_EMPLOYEES_PER_REQUEST },
      (_, i) => intact(i),
    );

    const res = await submit(inputRows);

    expect(res.status).toBe(201);
    expect(res.body.meta.created).toBe(MAX_EMPLOYEES_PER_REQUEST);
  });
});

describe("catatan aktivitas penambahan karyawan", () => {
  const single = {
    email: "arif@awan.io",
    password: "rahasia12345",
    full_name: "Arif Budiman",
    phone: "+628110000601",
    gender: "male",
  };

  function submit(body: unknown) {
    return request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("User-Agent", "PengujiHRIS/1.0")
      .send(body as never);
  }

  function lastLogEntry(mock: jest.Mock) {
    const calls = mock.mock.calls.at(-1) as [
      { activity: Record<string, unknown> },
      string,
    ];

    return calls[0].activity;
  }

  beforeEach(() => {
    (userModel.findExistingEmails as jest.Mock).mockResolvedValue([] as never);
    (userModel.insertUsersByAdmin as jest.Mock).mockResolvedValue([
      fakeAccount,
    ] as never);
    (employeeModel.createEmployees as jest.Mock).mockResolvedValue([
      fakeEmployee,
    ] as never);
  });

  it("mencatat penambahan satu karyawan sebagai berhasil", async () => {
    const res = await submit(single);

    expect(res.status).toBe(201);

    const noteField = lastLogEntry(logger.info as jest.Mock);

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

    await submit([single, { ...single, email: "arif2@awan.io" }]);

    const noteField = lastLogEntry(logger.info as jest.Mock);

    expect(noteField.action).toBe("employee.create_bulk");
    expect(noteField.entity_id).toBeNull();
    expect((noteField.metadata as { created: number }).created).toBe(2);
  });

  it("mencatat siapa pelakunya beserta alamat dan perangkatnya", async () => {
    await submit(single);

    const noteField = lastLogEntry(logger.info as jest.Mock);

    expect(noteField.actor_user_id).toBe(ADMIN_ID);
    expect(noteField.user_agent).toBe("PengujiHRIS/1.0");
    expect(noteField.ip_address).not.toBeUndefined();
  });

  it("mencatat waktu peristiwa, waktu catatan, dan lama prosesnya", async () => {
    await submit(single);

    const noteField = lastLogEntry(logger.info as jest.Mock);

    const thrown = new Date(noteField.occurred_at as string).getTime();
    const recorded = new Date(noteField.created_at as string).getTime();

    expect(Number.isNaN(thrown)).toBe(false);
    expect(recorded).toBeGreaterThanOrEqual(thrown);
    expect(noteField.duration_ms).toBe(recorded - thrown);
  });

  it("waktu peristiwa diambil sebelum penyimpanan, bukan sesudahnya", async () => {
    const before = Date.now();
    await submit(single);

    const noteField = lastLogEntry(logger.info as jest.Mock);
    const thrown = new Date(noteField.occurred_at as string).getTime();

    // peristiwanya mulai sebelum respons selesai, bukan pada detik penulisan log
    expect(thrown).toBeGreaterThanOrEqual(before);
    expect(thrown).toBeLessThanOrEqual(
      new Date(noteField.created_at as string).getTime(),
    );
  });

  it("tidak pernah mencatat password maupun hash-nya", async () => {
    await submit(single);

    const noteField = JSON.stringify(lastLogEntry(logger.info as jest.Mock));

    expect(noteField).not.toContain("rahasia12345");
    expect(noteField).not.toContain("password");
    expect(noteField).not.toContain("$argon2");
  });

  it("mencatat penolakan sebagai gagal beserta kolom yang bermasalah", async () => {
    await submit([single, { email: "rusak" }]);

    const noteField = lastLogEntry(logger.warn as jest.Mock);

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

    const res = await submit(single);

    expect(res.status).toBe(409);

    const noteField = lastLogEntry(logger.warn as jest.Mock);

    expect(noteField.action).toBe("employee.create");
    expect(noteField.status).toBe("failed");
    expect((noteField.metadata as { email: string }).email).toBe(
      "arif@awan.io",
    );
  });

  it("tidak mencatat keberhasilan ketika permintaan ditolak", async () => {
    (userModel.findExistingEmails as jest.Mock).mockResolvedValue([
      "arif@awan.io",
    ] as never);

    await submit(single);

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

  function lastLogEntry(mock: jest.Mock) {
    const callList = mock.mock.calls.at(-1) as [
      { activity: Record<string, unknown> },
      string,
    ];

    return callList[0].activity;
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

    const noteField = lastLogEntry(logger.warn as jest.Mock);

    expect(noteField.status).toBe("failed");
    expect(noteField.summary).toContain("unexpected error");
    expect((noteField.metadata as { error: string }).error).toContain(
      "koneksi ke database putus",
    );
  });

  it("waktu peristiwa pada catatan galat tetap yang sebenarnya", async () => {
    (employeeModel.createEmployees as jest.Mock).mockRejectedValue(
      new Error("gagal menyimpan") as never,
    );

    const before = Date.now();
    await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(row);

    const noteField = lastLogEntry(logger.warn as jest.Mock);
    const thrown = new Date(noteField.occurred_at as string).getTime();

    expect(thrown).toBeGreaterThanOrEqual(before);
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

  // Pemotongan sendiri diuji langsung di tests/helpers/activityLog.test.ts.
  // Lewat endpoint sudah tidak bisa dipicu karena batas kiriman sama dengan
  // batas rincian, jadi yang dijaga di sini justru catatannya tetap utuh
  it("rincian tetap utuh pada kiriman sebesar batas", async () => {
    const many = Array.from({ length: MAX_EMPLOYEES_PER_REQUEST }, (_, i) =>
      row(i),
    );

    (userModel.findExistingEmails as jest.Mock).mockResolvedValue([] as never);
    (userModel.insertUsersByAdmin as jest.Mock).mockResolvedValue(
      many.map((b, i) => ({
        id: `u${i}`,
        email: b.email,
        role: "employee",
        must_change_password: true,
      })) as never,
    );
    (employeeModel.createEmployees as jest.Mock).mockResolvedValue(
      many.map((b, i) => ({
        ...fakeEmployee,
        id: `e${i}`,
        full_name: b.full_name,
      })) as never,
    );

    const res = await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(many);

    expect(res.status).toBe(201);

    const calls = (logger.info as jest.Mock).mock.calls.at(-1) as [
      { activity: { metadata: Record<string, unknown> } },
    ];
    const meta = calls[0].activity.metadata as {
      created: number;
      employees: { total: number; sample: unknown[]; truncated: boolean };
    };

    expect(meta.created).toBe(MAX_EMPLOYEES_PER_REQUEST);
    expect(meta.employees.total).toBe(MAX_EMPLOYEES_PER_REQUEST);
    expect(meta.employees.truncated).toBe(false);
    expect(meta.employees.sample).toHaveLength(MAX_EMPLOYEES_PER_REQUEST);
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

  function submit(body: unknown) {
    return request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(body as never);
  }

  beforeEach(() => {
    (userModel.findExistingEmails as jest.Mock).mockResolvedValue([] as never);
    (userModel.insertUsersByAdmin as jest.Mock).mockImplementation(
      (_db, list) =>
        Promise.resolve(
          (list as { email: string }[]).map((b, i) => ({
            id: `u${i}`,
            email: b.email,
            role: "employee",
            must_change_password: true,
          })),
        ) as never,
    );
    (employeeModel.createEmployees as jest.Mock).mockImplementation(
      (_db, list) =>
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
    const res = await submit({ "0": row(0), "1": row(1), "2": row(2) });

    expect(res.status).toBe(201);
    expect(res.body.meta.created).toBe(3);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("memakai urutan nomor kuncinya, bukan urutan kiriman", async () => {
    const res = await submit({ "2": row(2), "0": row(0), "1": row(1) });

    expect(res.status).toBe(201);
    expect(res.body.data[0].employee.full_name).toBe("Karyawan Indeks 0");
    expect(res.body.data[1].employee.full_name).toBe("Karyawan Indeks 1");
    expect(res.body.data[2].employee.full_name).toBe("Karyawan Indeks 2");
  });

  it("mengurutkan nomor secara angka, bukan secara teks", async () => {
    const many: Record<string, unknown> = {};
    for (let i = 0; i < 12; i++) many[String(i)] = row(i);

    const res = await submit(many);

    expect(res.status).toBe(201);
    // kalau diurutkan sebagai teks, "10" akan mendahului "2"
    expect(res.body.data[2].employee.full_name).toBe("Karyawan Indeks 2");
    expect(res.body.data[10].employee.full_name).toBe("Karyawan Indeks 10");
  });

  it("menolak kunci yang tidak mulai dari nol", async () => {
    const res = await submit({ "1": row(1), "2": row(2) });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("run from 0");
    expect(employeeModel.createEmployees).not.toHaveBeenCalled();
  });

  it("menolak kunci yang bolong, tanda ada baris hilang", async () => {
    const res = await submit({ "0": row(0), "1": row(1), "3": row(3) });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Missing: 2");
    expect(res.body.details.missing).toEqual([2]);
    expect(res.body.details.received).toEqual([0, 1, 3]);
  });

  it("menolak dua kunci yang bernilai angka sama", async () => {
    // "01" dan "1" sama-sama bernilai 1, tanda penomoran frontend bermasalah
    const res = await submit({ "0": row(0), "01": row(1), "1": row(2) });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("more than once");
    expect(employeeModel.createEmployees).not.toHaveBeenCalled();
  });

  it("menerima nomor berpadding selama nilainya tetap berurutan", async () => {
    // frontend yang memformat "000", "001" tetap sah karena nilainya 0 dan 1
    const res = await submit({ "000": row(0), "001": row(1) });

    expect(res.status).toBe(201);
    expect(res.body.meta.created).toBe(2);
  });

  it("galat menunjuk nomor kunci yang sama dengan yang dikirim", async () => {
    const res = await submit({
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
    const res = await submit(row(0));

    expect(res.status).toBe(201);
    expect(Array.isArray(res.body.data)).toBe(false);
    expect(res.body.meta).toBeUndefined();
  });

  it("dicatat sebagai penambahan massal pada log", async () => {
    await submit({ "0": row(0), "1": row(1) });

    const calls = (logger.info as jest.Mock).mock.calls.at(-1) as [
      { activity: { action: string; metadata: { created: number } } },
    ];

    expect(calls[0].activity.action).toBe("employee.create_bulk");
    expect(calls[0].activity.metadata.created).toBe(2);
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

  function submit(body: unknown) {
    return request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(body as never);
  }

  beforeEach(() => {
    (userModel.findExistingEmails as jest.Mock).mockResolvedValue([] as never);
    (userModel.insertUsersByAdmin as jest.Mock).mockImplementation(
      (_db, list) =>
        Promise.resolve(
          (list as { email: string }[]).map((b, i) => ({
            id: `u${i}`,
            email: b.email,
            role: "employee",
            must_change_password: true,
          })),
        ) as never,
    );
    (employeeModel.createEmployees as jest.Mock).mockImplementation(
      (_db, list) =>
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
    const res = await submit([row(0), row(1), row(2)]);

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
    const res = await submit({ "1": row(1), "0": row(0) });

    expect(res.status).toBe(201);
    expect(res.body.data[0].index).toBe(0);
    expect(res.body.data[0].employee.full_name).toBe("Karyawan Hasil 0");
    expect(res.body.data[1].index).toBe(1);
  });

  it("setiap yang gagal menyebut index, siapa, dan alasan per kolom", async () => {
    const res = await submit([
      row(0),
      { email: "rusak", full_name: "Ab" },
      row(2),
    ]);

    expect(res.status).toBe(400);

    const [failedRows] = res.body.details.failed_rows;

    expect(failedRows.index).toBe(1);
    expect(failedRows.email).toBe("rusak");
    expect(failedRows.errors.map((e: { field: string }) => e.field)).toEqual(
      expect.arrayContaining(["email", "full_name", "phone", "gender"]),
    );
  });

  it("kolom opsional yang dikirim kosong tidak menggagalkan baris", async () => {
    const res = await submit([
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
    const res = await submit([row(0), { ...row(1), birth_date: "2021-01-01" }]);

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

  function submit(body: unknown) {
    return request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(body as never);
  }

  beforeEach(() => {
    (userModel.findExistingEmails as jest.Mock).mockResolvedValue([] as never);
    (userModel.insertUsersByAdmin as jest.Mock).mockImplementation(
      (_db, list) =>
        Promise.resolve(
          (list as { email: string }[]).map((b, i) => ({
            id: `u${i}`,
            email: b.email,
            role: "employee",
            must_change_password: true,
          })),
        ) as never,
    );
    (employeeModel.createEmployees as jest.Mock).mockImplementation(
      (_db, list) =>
        Promise.resolve(
          (list as unknown[]).map((_b, i) => ({
            ...fakeEmployee,
            id: `e${i}`,
          })),
        ) as never,
    );
  });

  it("akun dibuat lebih dulu, karyawan menyusul dengan user_id-nya", async () => {
    await submit([row(0), row(1)]);

    const accountOrder = (userModel.insertUsersByAdmin as jest.Mock).mock
      .invocationCallOrder[0]!;
    const employeeOrder = (employeeModel.createEmployees as jest.Mock).mock
      .invocationCallOrder[0]!;

    expect(accountOrder).toBeLessThan(employeeOrder);
  });

  it("setiap karyawan yang disimpan membawa user_id", async () => {
    await submit([row(0), row(1), row(2)]);

    const [, list] = (employeeModel.createEmployees as jest.Mock).mock
      .calls[0] as [unknown, { user_id: string }[]];

    expect(list).toHaveLength(3);
    for (const entry of list) {
      expect(entry.user_id).toBeTruthy();
    }
  });

  it("setiap hasil selalu menyertakan akunnya", async () => {
    const res = await submit([row(0), row(1)]);

    for (const entry of res.body.data) {
      expect(entry.account.id).toBeTruthy();
      expect(entry.account.email).toBeTruthy();
      expect(entry.account.must_change_password).toBe(true);
    }
  });

  it("gagal seluruhnya kalau jumlah akun tidak cocok dengan jumlah karyawan", async () => {
    // hanya satu akun dikembalikan padahal dua baris dikirim
    (userModel.insertUsersByAdmin as jest.Mock).mockResolvedValue([
      {
        id: "u0",
        email: "akun0@awan.io",
        role: "employee",
        must_change_password: true,
      },
    ] as never);

    const res = await submit([row(0), row(1)]);

    expect(res.status).toBe(500);
    expect(employeeModel.createEmployees).not.toHaveBeenCalled();
    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("kegagalan pembuatan akun membatalkan penyimpanan karyawan", async () => {
    (userModel.insertUsersByAdmin as jest.Mock).mockRejectedValue(
      new Error("email bentrok") as never,
    );

    const res = await submit([row(0)]);

    expect(res.status).toBe(500);
    expect(employeeModel.createEmployees).not.toHaveBeenCalled();
    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    expect(mockClient.query).not.toHaveBeenCalledWith("COMMIT");
  });
});
