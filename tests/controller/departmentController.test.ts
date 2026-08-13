import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import request from "supertest";

// middleware authenticate memeriksa password_changed_at lewat model user,
// jadi pool harus mengembalikan hasil kosong alih-alih undefined
jest.unstable_mockModule("../../src/config/databaseConnection.js", () => ({
  pool: {
    connect: jest.fn(),
    query: jest.fn(() => Promise.resolve({ rows: [] })),
  },
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

const departmentModel = await import("../../src/models/department.js");
const { createToken } = await import("../../src/helpers/jwt.js");
const { app } = await import("../../src/app.js");

const DEPARTMENT_ID = "33333333-3333-4333-8333-333333333333";
const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
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

const fakeDepartment = {
  id: DEPARTMENT_ID,
  code: "IT",
  name: "Teknologi Informasi",
  is_active: true,
  deleted_at: null,
  created_at: new Date(),
  updated_at: new Date(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("GET /api/v1/departments", () => {
  it("menolak request tanpa token", async () => {
    const res = await request(app).get("/api/v1/departments");

    expect(res.status).toBe(401);
  });

  it("dapat diakses karyawan biasa karena dipakai untuk pilihan formulir", async () => {
    (departmentModel.findAll as jest.Mock).mockResolvedValue([
      fakeDepartment,
    ] as never);

    const res = await request(app)
      .get("/api/v1/departments")
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("mengembalikan daftar kosong jika belum ada departemen", async () => {
    (departmentModel.findAll as jest.Mock).mockResolvedValue([] as never);

    const res = await request(app)
      .get("/api/v1/departments")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("meneruskan error tak terduga sebagai 500", async () => {
    (departmentModel.findAll as jest.Mock).mockRejectedValue(
      new Error("koneksi putus") as never,
    );

    const res = await request(app)
      .get("/api/v1/departments")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(500);
  });
});

describe("GET /api/v1/departments/:id", () => {
  it("menolak request tanpa token", async () => {
    const res = await request(app).get(`/api/v1/departments/${DEPARTMENT_ID}`);

    expect(res.status).toBe(401);
  });

  it("menolak id yang bukan uuid", async () => {
    const res = await request(app)
      .get("/api/v1/departments/123")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(departmentModel.findById).not.toHaveBeenCalled();
  });

  it("mengembalikan 404 jika departemen tidak ada", async () => {
    (departmentModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await request(app)
      .get(`/api/v1/departments/${DEPARTMENT_ID}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Departemen tidak ditemukan");
  });

  it("mengembalikan detail departemen", async () => {
    (departmentModel.findById as jest.Mock).mockResolvedValue(
      fakeDepartment as never,
    );

    const res = await request(app)
      .get(`/api/v1/departments/${DEPARTMENT_ID}`)
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.code).toBe("IT");
  });
});

describe("POST /api/v1/departments", () => {
  const validBody = { code: "IT", name: "Teknologi Informasi" };

  it("menolak request tanpa token", async () => {
    const res = await request(app).post("/api/v1/departments").send(validBody);

    expect(res.status).toBe(401);
  });

  it("menolak karyawan biasa", async () => {
    const res = await request(app)
      .post("/api/v1/departments")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send(validBody);

    expect(res.status).toBe(403);
    expect(departmentModel.createDepartment).not.toHaveBeenCalled();
  });

  it("mengizinkan admin", async () => {
    (departmentModel.findByCode as jest.Mock).mockResolvedValue(null as never);
    (departmentModel.createDepartment as jest.Mock).mockResolvedValue(
      fakeDepartment as never,
    );

    const res = await request(app)
      .post("/api/v1/departments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(validBody);

    expect(res.status).toBe(201);
  });

  it("menolak body kosong", async () => {
    const res = await request(app)
      .post("/api/v1/departments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("menolak kode yang sudah dipakai", async () => {
    (departmentModel.findByCode as jest.Mock).mockResolvedValue(
      fakeDepartment as never,
    );

    const res = await request(app)
      .post("/api/v1/departments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(validBody);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CONFLICT");
    expect(departmentModel.createDepartment).not.toHaveBeenCalled();
  });

  it("membuat departemen dan mengembalikan 201", async () => {
    (departmentModel.findByCode as jest.Mock).mockResolvedValue(null as never);
    (departmentModel.createDepartment as jest.Mock).mockResolvedValue(
      fakeDepartment as never,
    );

    const res = await request(app)
      .post("/api/v1/departments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(DEPARTMENT_ID);
  });

  it("menyimpan kode dalam huruf besar", async () => {
    (departmentModel.findByCode as jest.Mock).mockResolvedValue(null as never);
    (departmentModel.createDepartment as jest.Mock).mockResolvedValue(
      fakeDepartment as never,
    );

    await request(app)
      .post("/api/v1/departments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ code: "it", name: "Teknologi Informasi" });

    const [data] = (departmentModel.createDepartment as jest.Mock).mock
      .calls[0] as [Record<string, unknown>];

    expect(data.code).toBe("IT");
  });

  it("memeriksa duplikat memakai kode yang sudah dinormalkan", async () => {
    (departmentModel.findByCode as jest.Mock).mockResolvedValue(null as never);
    (departmentModel.createDepartment as jest.Mock).mockResolvedValue(
      fakeDepartment as never,
    );

    await request(app)
      .post("/api/v1/departments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ code: "  it  ", name: "Teknologi Informasi" });

    expect(departmentModel.findByCode).toHaveBeenCalledWith("IT");
  });
});

describe("PATCH /api/v1/departments/:id", () => {
  it("menolak karyawan biasa", async () => {
    const res = await request(app)
      .patch(`/api/v1/departments/${DEPARTMENT_ID}`)
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ name: "Keuangan" });

    expect(res.status).toBe(403);
  });

  it("menolak id yang bukan uuid", async () => {
    const res = await request(app)
      .patch("/api/v1/departments/123")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Keuangan" });

    expect(res.status).toBe(400);
  });

  it("mengembalikan 404 jika departemen tidak ada", async () => {
    (departmentModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await request(app)
      .patch(`/api/v1/departments/${DEPARTMENT_ID}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Keuangan" });

    expect(res.status).toBe(404);
  });

  it("memperbarui nama departemen", async () => {
    (departmentModel.findById as jest.Mock).mockResolvedValue(
      fakeDepartment as never,
    );
    (departmentModel.updateDepartment as jest.Mock).mockResolvedValue({
      ...fakeDepartment,
      name: "Keuangan",
    } as never);

    const res = await request(app)
      .patch(`/api/v1/departments/${DEPARTMENT_ID}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Keuangan" });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("Keuangan");
  });

  it("menolak kode yang sudah dipakai departemen lain", async () => {
    (departmentModel.findById as jest.Mock).mockResolvedValue(
      fakeDepartment as never,
    );
    (departmentModel.findByCode as jest.Mock).mockResolvedValue({
      ...fakeDepartment,
      id: "lain",
    } as never);

    const res = await request(app)
      .patch(`/api/v1/departments/${DEPARTMENT_ID}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ code: "HRD" });

    expect(res.status).toBe(409);
    expect(departmentModel.updateDepartment).not.toHaveBeenCalled();
  });

  it("tidak memeriksa duplikat jika kode tidak berubah", async () => {
    (departmentModel.findById as jest.Mock).mockResolvedValue(
      fakeDepartment as never,
    );
    (departmentModel.updateDepartment as jest.Mock).mockResolvedValue(
      fakeDepartment as never,
    );

    const res = await request(app)
      .patch(`/api/v1/departments/${DEPARTMENT_ID}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ code: "IT" });

    expect(res.status).toBe(200);
    expect(departmentModel.findByCode).not.toHaveBeenCalled();
  });

  it("menolak penonaktifan departemen yang masih punya karyawan", async () => {
    (departmentModel.findById as jest.Mock).mockResolvedValue(
      fakeDepartment as never,
    );
    (departmentModel.countEmployees as jest.Mock).mockResolvedValue(5 as never);

    const res = await request(app)
      .patch(`/api/v1/departments/${DEPARTMENT_ID}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ is_active: false });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("5 karyawan");
    expect(res.body.details.employee_count).toBe(5);
    expect(departmentModel.updateDepartment).not.toHaveBeenCalled();
  });

  it("mengizinkan penonaktifan jika sudah tidak ada karyawan", async () => {
    (departmentModel.findById as jest.Mock).mockResolvedValue(
      fakeDepartment as never,
    );
    (departmentModel.countEmployees as jest.Mock).mockResolvedValue(0 as never);
    (departmentModel.updateDepartment as jest.Mock).mockResolvedValue({
      ...fakeDepartment,
      is_active: false,
    } as never);

    const res = await request(app)
      .patch(`/api/v1/departments/${DEPARTMENT_ID}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ is_active: false });

    expect(res.status).toBe(200);
    expect(res.body.data.is_active).toBe(false);
  });

  it("tidak menghitung karyawan saat departemen diaktifkan kembali", async () => {
    (departmentModel.findById as jest.Mock).mockResolvedValue({
      ...fakeDepartment,
      is_active: false,
    } as never);
    (departmentModel.updateDepartment as jest.Mock).mockResolvedValue(
      fakeDepartment as never,
    );

    const res = await request(app)
      .patch(`/api/v1/departments/${DEPARTMENT_ID}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ is_active: true });

    expect(res.status).toBe(200);
    expect(departmentModel.countEmployees).not.toHaveBeenCalled();
  });

  it("menolak nama yang terlalu pendek", async () => {
    const res = await request(app)
      .patch(`/api/v1/departments/${DEPARTMENT_ID}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "IT" });

    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/v1/departments/:id", () => {
  it("menolak karyawan biasa", async () => {
    const res = await request(app)
      .delete(`/api/v1/departments/${DEPARTMENT_ID}`)
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
  });

  it("menolak id yang bukan uuid", async () => {
    const res = await request(app)
      .delete("/api/v1/departments/123")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });

  it("mengembalikan 404 jika departemen tidak ada", async () => {
    (departmentModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await request(app)
      .delete(`/api/v1/departments/${DEPARTMENT_ID}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(departmentModel.softDeleteDepartment).not.toHaveBeenCalled();
  });

  it("menolak penghapusan departemen yang masih punya karyawan", async () => {
    (departmentModel.findById as jest.Mock).mockResolvedValue(
      fakeDepartment as never,
    );
    (departmentModel.countEmployees as jest.Mock).mockResolvedValue(3 as never);

    const res = await request(app)
      .delete(`/api/v1/departments/${DEPARTMENT_ID}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.details.employee_count).toBe(3);
    expect(departmentModel.softDeleteDepartment).not.toHaveBeenCalled();
  });

  it("menghapus departemen yang sudah kosong", async () => {
    (departmentModel.findById as jest.Mock).mockResolvedValue(
      fakeDepartment as never,
    );
    (departmentModel.countEmployees as jest.Mock).mockResolvedValue(0 as never);
    (departmentModel.softDeleteDepartment as jest.Mock).mockResolvedValue(
      fakeDepartment as never,
    );

    const res = await request(app)
      .delete(`/api/v1/departments/${DEPARTMENT_ID}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("berhasil dihapus");
    expect(departmentModel.softDeleteDepartment).toHaveBeenCalledWith(
      DEPARTMENT_ID,
    );
  });
});
