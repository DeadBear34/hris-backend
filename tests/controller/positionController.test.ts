import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import request from "supertest";

jest.unstable_mockModule("../../src/config/databaseConnection.js", () => ({
  pool: {
    connect: jest.fn(),
    query: jest.fn(),
  },
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

const positionModel = await import("../../src/models/position.js");
const { createToken } = await import("../../src/helpers/jwt.js");
const { app } = await import("../../src/app.js");

const POSITION_ID = "44444444-4444-4444-8444-444444444444";
const HR_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "66666666-6666-4666-8666-666666666666";

const hrToken = createToken({ id: HR_ID, email: "hr@awan.io", role: "hr" });
const adminToken = createToken({
  id: HR_ID,
  email: "admin@awan.io",
  role: "admin",
});
const employeeToken = createToken({
  id: USER_ID,
  email: "karyawan@awan.io",
  role: "employee",
});

const fakePosition = {
  id: POSITION_ID,
  code: "SWE",
  name: "Software Engineer",
  level: 3,
  is_active: true,
  deleted_at: null,
  created_at: new Date(),
  updated_at: new Date(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("GET /api/v1/positions", () => {
  it("menolak request tanpa token", async () => {
    const res = await request(app).get("/api/v1/positions");

    expect(res.status).toBe(401);
  });

  it("dapat diakses karyawan biasa karena dipakai untuk pilihan formulir", async () => {
    (positionModel.findAll as jest.Mock).mockResolvedValue([
      fakePosition,
    ] as never);

    const res = await request(app)
      .get("/api/v1/positions")
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("mengembalikan daftar kosong jika belum ada jabatan", async () => {
    (positionModel.findAll as jest.Mock).mockResolvedValue([] as never);

    const res = await request(app)
      .get("/api/v1/positions")
      .set("Authorization", `Bearer ${hrToken}`);

    expect(res.body.data).toEqual([]);
  });

  it("meneruskan error tak terduga sebagai 500", async () => {
    (positionModel.findAll as jest.Mock).mockRejectedValue(
      new Error("koneksi putus") as never,
    );

    const res = await request(app)
      .get("/api/v1/positions")
      .set("Authorization", `Bearer ${hrToken}`);

    expect(res.status).toBe(500);
  });
});

describe("GET /api/v1/positions/:id", () => {
  it("menolak request tanpa token", async () => {
    const res = await request(app).get(`/api/v1/positions/${POSITION_ID}`);

    expect(res.status).toBe(401);
  });

  it("menolak id yang bukan uuid", async () => {
    const res = await request(app)
      .get("/api/v1/positions/123")
      .set("Authorization", `Bearer ${hrToken}`);

    expect(res.status).toBe(400);
    expect(positionModel.findById).not.toHaveBeenCalled();
  });

  it("mengembalikan 404 jika jabatan tidak ada", async () => {
    (positionModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await request(app)
      .get(`/api/v1/positions/${POSITION_ID}`)
      .set("Authorization", `Bearer ${hrToken}`);

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Jabatan tidak ditemukan");
  });

  it("mengembalikan detail jabatan", async () => {
    (positionModel.findById as jest.Mock).mockResolvedValue(
      fakePosition as never,
    );

    const res = await request(app)
      .get(`/api/v1/positions/${POSITION_ID}`)
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.level).toBe(3);
  });
});

describe("POST /api/v1/positions", () => {
  const validBody = { code: "SWE", name: "Software Engineer", level: 3 };

  it("menolak request tanpa token", async () => {
    const res = await request(app).post("/api/v1/positions").send(validBody);

    expect(res.status).toBe(401);
  });

  it("menolak karyawan biasa", async () => {
    const res = await request(app)
      .post("/api/v1/positions")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send(validBody);

    expect(res.status).toBe(403);
    expect(positionModel.createPosition).not.toHaveBeenCalled();
  });

  it("mengizinkan admin", async () => {
    (positionModel.findByCode as jest.Mock).mockResolvedValue(null as never);
    (positionModel.createPosition as jest.Mock).mockResolvedValue(
      fakePosition as never,
    );

    const res = await request(app)
      .post("/api/v1/positions")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(validBody);

    expect(res.status).toBe(201);
  });

  it("menolak body kosong", async () => {
    const res = await request(app)
      .post("/api/v1/positions")
      .set("Authorization", `Bearer ${hrToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("menolak level di luar rentang 1 sampai 10", async () => {
    const res = await request(app)
      .post("/api/v1/positions")
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ ...validBody, level: 99 });

    expect(res.status).toBe(400);
    expect(positionModel.createPosition).not.toHaveBeenCalled();
  });

  it("menolak kode yang sudah dipakai", async () => {
    (positionModel.findByCode as jest.Mock).mockResolvedValue(
      fakePosition as never,
    );

    const res = await request(app)
      .post("/api/v1/positions")
      .set("Authorization", `Bearer ${hrToken}`)
      .send(validBody);

    expect(res.status).toBe(409);
    expect(positionModel.createPosition).not.toHaveBeenCalled();
  });

  it("membuat jabatan dan mengembalikan 201", async () => {
    (positionModel.findByCode as jest.Mock).mockResolvedValue(null as never);
    (positionModel.createPosition as jest.Mock).mockResolvedValue(
      fakePosition as never,
    );

    const res = await request(app)
      .post("/api/v1/positions")
      .set("Authorization", `Bearer ${hrToken}`)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(POSITION_ID);
  });

  it("menyimpan kode dalam huruf besar", async () => {
    (positionModel.findByCode as jest.Mock).mockResolvedValue(null as never);
    (positionModel.createPosition as jest.Mock).mockResolvedValue(
      fakePosition as never,
    );

    await request(app)
      .post("/api/v1/positions")
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ code: "swe", name: "Software Engineer" });

    const [data] = (positionModel.createPosition as jest.Mock).mock
      .calls[0] as [Record<string, unknown>];

    expect(data.code).toBe("SWE");
  });

  it("membiarkan level kosong agar model memakai nilai bawaan", async () => {
    (positionModel.findByCode as jest.Mock).mockResolvedValue(null as never);
    (positionModel.createPosition as jest.Mock).mockResolvedValue(
      fakePosition as never,
    );

    await request(app)
      .post("/api/v1/positions")
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ code: "SWE", name: "Software Engineer" });

    const [data] = (positionModel.createPosition as jest.Mock).mock
      .calls[0] as [Record<string, unknown>];

    expect(data).not.toHaveProperty("level");
  });
});

describe("PATCH /api/v1/positions/:id", () => {
  it("menolak karyawan biasa", async () => {
    const res = await request(app)
      .patch(`/api/v1/positions/${POSITION_ID}`)
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ level: 5 });

    expect(res.status).toBe(403);
  });

  it("menolak id yang bukan uuid", async () => {
    const res = await request(app)
      .patch("/api/v1/positions/123")
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ level: 5 });

    expect(res.status).toBe(400);
  });

  it("mengembalikan 404 jika jabatan tidak ada", async () => {
    (positionModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await request(app)
      .patch(`/api/v1/positions/${POSITION_ID}`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ level: 5 });

    expect(res.status).toBe(404);
  });

  it("memperbarui level jabatan", async () => {
    (positionModel.findById as jest.Mock).mockResolvedValue(
      fakePosition as never,
    );
    (positionModel.updatePosition as jest.Mock).mockResolvedValue({
      ...fakePosition,
      level: 5,
    } as never);

    const res = await request(app)
      .patch(`/api/v1/positions/${POSITION_ID}`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ level: 5 });

    expect(res.status).toBe(200);
    expect(res.body.data.level).toBe(5);
  });

  it("menolak kode yang sudah dipakai jabatan lain", async () => {
    (positionModel.findById as jest.Mock).mockResolvedValue(
      fakePosition as never,
    );
    (positionModel.findByCode as jest.Mock).mockResolvedValue({
      ...fakePosition,
      id: "lain",
    } as never);

    const res = await request(app)
      .patch(`/api/v1/positions/${POSITION_ID}`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ code: "PM" });

    expect(res.status).toBe(409);
    expect(positionModel.updatePosition).not.toHaveBeenCalled();
  });

  it("tidak memeriksa duplikat jika kode tidak berubah", async () => {
    (positionModel.findById as jest.Mock).mockResolvedValue(
      fakePosition as never,
    );
    (positionModel.updatePosition as jest.Mock).mockResolvedValue(
      fakePosition as never,
    );

    const res = await request(app)
      .patch(`/api/v1/positions/${POSITION_ID}`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ code: "SWE" });

    expect(res.status).toBe(200);
    expect(positionModel.findByCode).not.toHaveBeenCalled();
  });

  it("menolak penonaktifan jabatan yang masih dipakai karyawan", async () => {
    (positionModel.findById as jest.Mock).mockResolvedValue(
      fakePosition as never,
    );
    (positionModel.countEmployees as jest.Mock).mockResolvedValue(4 as never);

    const res = await request(app)
      .patch(`/api/v1/positions/${POSITION_ID}`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ is_active: false });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("4 karyawan");
    expect(res.body.details.employee_count).toBe(4);
    expect(positionModel.updatePosition).not.toHaveBeenCalled();
  });

  it("mengizinkan penonaktifan jika sudah tidak dipakai", async () => {
    (positionModel.findById as jest.Mock).mockResolvedValue(
      fakePosition as never,
    );
    (positionModel.countEmployees as jest.Mock).mockResolvedValue(0 as never);
    (positionModel.updatePosition as jest.Mock).mockResolvedValue({
      ...fakePosition,
      is_active: false,
    } as never);

    const res = await request(app)
      .patch(`/api/v1/positions/${POSITION_ID}`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ is_active: false });

    expect(res.status).toBe(200);
  });

  it("tidak menghitung karyawan saat jabatan diaktifkan kembali", async () => {
    (positionModel.findById as jest.Mock).mockResolvedValue({
      ...fakePosition,
      is_active: false,
    } as never);
    (positionModel.updatePosition as jest.Mock).mockResolvedValue(
      fakePosition as never,
    );

    await request(app)
      .patch(`/api/v1/positions/${POSITION_ID}`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ is_active: true });

    expect(positionModel.countEmployees).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/v1/positions/:id", () => {
  it("menolak karyawan biasa", async () => {
    const res = await request(app)
      .delete(`/api/v1/positions/${POSITION_ID}`)
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
  });

  it("menolak id yang bukan uuid", async () => {
    const res = await request(app)
      .delete("/api/v1/positions/123")
      .set("Authorization", `Bearer ${hrToken}`);

    expect(res.status).toBe(400);
  });

  it("mengembalikan 404 jika jabatan tidak ada", async () => {
    (positionModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await request(app)
      .delete(`/api/v1/positions/${POSITION_ID}`)
      .set("Authorization", `Bearer ${hrToken}`);

    expect(res.status).toBe(404);
    expect(positionModel.softDeletePosition).not.toHaveBeenCalled();
  });

  it("menolak penghapusan jabatan yang masih dipakai karyawan", async () => {
    (positionModel.findById as jest.Mock).mockResolvedValue(
      fakePosition as never,
    );
    (positionModel.countEmployees as jest.Mock).mockResolvedValue(2 as never);

    const res = await request(app)
      .delete(`/api/v1/positions/${POSITION_ID}`)
      .set("Authorization", `Bearer ${hrToken}`);

    expect(res.status).toBe(400);
    expect(res.body.details.employee_count).toBe(2);
    expect(positionModel.softDeletePosition).not.toHaveBeenCalled();
  });

  it("menghapus jabatan yang sudah tidak dipakai", async () => {
    (positionModel.findById as jest.Mock).mockResolvedValue(
      fakePosition as never,
    );
    (positionModel.countEmployees as jest.Mock).mockResolvedValue(0 as never);
    (positionModel.softDeletePosition as jest.Mock).mockResolvedValue(
      fakePosition as never,
    );

    const res = await request(app)
      .delete(`/api/v1/positions/${POSITION_ID}`)
      .set("Authorization", `Bearer ${hrToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("berhasil dihapus");
    expect(positionModel.softDeletePosition).toHaveBeenCalledWith(POSITION_ID);
  });
});
