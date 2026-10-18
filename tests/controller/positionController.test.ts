import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import request from "supertest";

// middleware authenticate memeriksa sesi lewat model user, jadi pool harus
// mengembalikan akun aktif untuk query itu dan hasil kosong untuk yang lain
const mockClient = {
  query: jest.fn(() => Promise.resolve({ rows: [] })),
  release: jest.fn(),
};

jest.unstable_mockModule("../../src/config/databaseConnection.js", () => ({
  pool: {
    connect: jest.fn(() => Promise.resolve(mockClient)),
    // query sesi di middleware authenticate dijawab akun aktif, sisanya kosong
    query: jest.fn((sql: unknown) =>
      Promise.resolve(
        String(sql).includes("is_active FROM users")
          ? {
              rows: [
                {
                  id: "session-user",
                  password_changed_at: null,
                  is_active: true,
                },
              ],
            }
          : { rows: [] },
      ),
    ),
  },
}));

jest.unstable_mockModule("../../src/models/position.js", () => ({
  findAll: jest.fn(),
  findById: jest.fn(),
  findByCode: jest.fn(),
  findByName: jest.fn(),
  createPosition: jest.fn(),
  updatePosition: jest.fn(),
  softDeletePosition: jest.fn(),
  countEmployees: jest.fn(),
  countDirectReports: jest.fn(() => Promise.resolve(0)),
  syncHolderDepartments: jest.fn(() => Promise.resolve(0)),
}));

// Aturan struktur diuji tersendiri di tests/helpers/orgValidation.test.ts.
// Di sini cukup dipastikan controller memanggilnya
jest.unstable_mockModule("../../src/helpers/orgValidation.js", () => ({
  assertPositionPlacement: jest.fn(() => Promise.resolve()),
  assertPositionCapacity: jest.fn(() => Promise.resolve()),
  assertUnitParent: jest.fn(() => Promise.resolve()),
  assertUnitMove: jest.fn(() => Promise.resolve()),
}));

jest.unstable_mockModule("../../src/models/orgStructure.js", () => ({
  countHolders: jest.fn(() => Promise.resolve(0)),
  findLineManager: jest.fn(() => Promise.resolve(null)),
  loadOrgChart: jest.fn(),
}));

// Pengalihan persetujuan diuji tersendiri di tests/helpers/approvalRouting.test.ts
jest.unstable_mockModule("../../src/helpers/approvalRouting.js", () => ({
  rerouteSafely: jest.fn(() => Promise.resolve([])),
  reroutePendingApprovals: jest.fn(() => Promise.resolve([])),
}));

const positionModel = await import("../../src/models/position.js");
const approvalRouting = await import("../../src/helpers/approvalRouting.js");
const orgValidation = await import("../../src/helpers/orgValidation.js");
const orgStructure = await import("../../src/models/orgStructure.js");
const { createToken } = await import("../../src/helpers/jwt.js");
const { app } = await import("../../src/app.js");

const POSITION_ID = "44444444-4444-4444-8444-444444444444";
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
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.body.data).toEqual([]);
  });

  it("meneruskan error tak terduga sebagai 500", async () => {
    (positionModel.findAll as jest.Mock).mockRejectedValue(
      new Error("koneksi putus") as never,
    );

    const res = await request(app)
      .get("/api/v1/positions")
      .set("Authorization", `Bearer ${adminToken}`);

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
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(positionModel.findById).not.toHaveBeenCalled();
  });

  it("mengembalikan 404 jika jabatan tidak ada", async () => {
    (positionModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await request(app)
      .get(`/api/v1/positions/${POSITION_ID}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Position not found");
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
  const validBody = {
    code: "SWE",
    name: "Software Engineer",
    level: 3,
    department_id: "99999999-9999-4999-8999-999999999999",
  };

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
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("menolak level di luar rentang 1 sampai 10", async () => {
    const res = await request(app)
      .post("/api/v1/positions")
      .set("Authorization", `Bearer ${adminToken}`)
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
      .set("Authorization", `Bearer ${adminToken}`)
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
      .set("Authorization", `Bearer ${adminToken}`)
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
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        code: "swe",
        name: "Software Engineer",
        department_id: "99999999-9999-4999-8999-999999999999",
      });

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
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        code: "SWE",
        name: "Software Engineer",
        department_id: "99999999-9999-4999-8999-999999999999",
      });

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
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ level: 5 });

    expect(res.status).toBe(400);
  });

  it("mengembalikan 404 jika jabatan tidak ada", async () => {
    (positionModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await request(app)
      .patch(`/api/v1/positions/${POSITION_ID}`)
      .set("Authorization", `Bearer ${adminToken}`)
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
      .set("Authorization", `Bearer ${adminToken}`)
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
      .set("Authorization", `Bearer ${adminToken}`)
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
      .set("Authorization", `Bearer ${adminToken}`)
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
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ is_active: false });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("4 employees");
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
      .set("Authorization", `Bearer ${adminToken}`)
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
      .set("Authorization", `Bearer ${adminToken}`)
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
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });

  it("mengembalikan 404 jika jabatan tidak ada", async () => {
    (positionModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await request(app)
      .delete(`/api/v1/positions/${POSITION_ID}`)
      .set("Authorization", `Bearer ${adminToken}`);

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
      .set("Authorization", `Bearer ${adminToken}`);

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
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("deleted successfully");
    expect(positionModel.softDeletePosition).toHaveBeenCalledWith(POSITION_ID);
  });
});

describe("nama jabatan tidak boleh kembar", () => {
  it("menolak pembuatan dengan nama yang sudah dipakai", async () => {
    (positionModel.findByCode as jest.Mock).mockResolvedValue(null as never);
    (positionModel.findByName as jest.Mock).mockResolvedValue(
      fakePosition as never,
    );

    const res = await request(app)
      .post("/api/v1/positions")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        code: "SWE2",
        name: "software engineer",
        level: 3,
        department_id: "99999999-9999-4999-8999-999999999999",
      });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain("name is already in use");
    expect(positionModel.createPosition).not.toHaveBeenCalled();
  });

  it("mengubah nama tidak menganggap dirinya sendiri sebagai kembaran", async () => {
    (positionModel.findById as jest.Mock).mockResolvedValue(
      fakePosition as never,
    );
    (positionModel.findByName as jest.Mock).mockResolvedValue(null as never);

    await request(app)
      .patch(`/api/v1/positions/${POSITION_ID}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Senior Engineer" });

    // argumen kedua unit jabatan, ketiga id yang dikecualikan
    const [, , exceptId] = (positionModel.findByName as jest.Mock).mock
      .calls[0] as [string, string | null, string];

    expect(exceptId).toBe(POSITION_ID);
  });

  it("menolak perubahan nama menjadi nama jabatan lain", async () => {
    (positionModel.findById as jest.Mock).mockResolvedValue(
      fakePosition as never,
    );
    (positionModel.findByName as jest.Mock).mockResolvedValue({
      ...fakePosition,
      id: "99999999-9999-4999-8999-999999999999",
    } as never);

    const res = await request(app)
      .patch(`/api/v1/positions/${POSITION_ID}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Senior Engineer" });

    expect(res.status).toBe(409);
    expect(positionModel.updatePosition).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------
// Struktur jabatan
// ---------------------------------------------------------------
describe("struktur jabatan", () => {
  const UNIT_A = "99999999-9999-4999-8999-999999999999";
  const UNIT_B = "88888888-8888-4888-8888-888888888888";
  const SUPERIOR_ID = "55555555-5555-4555-8555-555555555555";

  const structured = {
    ...fakePosition,
    department_id: UNIT_A,
    reports_to_position_id: SUPERIOR_ID,
    is_unit_head: false,
    max_holders: null,
  };

  beforeEach(() => {
    (positionModel.findById as jest.Mock).mockResolvedValue(
      structured as never,
    );
    (positionModel.findByCode as jest.Mock).mockResolvedValue(null as never);
    (positionModel.findByName as jest.Mock).mockResolvedValue(null as never);
    (positionModel.updatePosition as jest.Mock).mockResolvedValue(
      structured as never,
    );
    (positionModel.createPosition as jest.Mock).mockResolvedValue(
      structured as never,
    );
    (positionModel.countEmployees as jest.Mock).mockResolvedValue(0 as never);
    (positionModel.countDirectReports as jest.Mock).mockResolvedValue(
      0 as never,
    );
    (orgStructure.countHolders as jest.Mock).mockResolvedValue(0 as never);
    (orgValidation.assertPositionPlacement as jest.Mock).mockResolvedValue(
      undefined as never,
    );
  });

  it("membuat jabatan memeriksa letaknya di struktur", async () => {
    await request(app)
      .post("/api/v1/positions")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        code: "SENIOR",
        name: "Senior Engineer",
        department_id: UNIT_A,
        reports_to_position_id: SUPERIOR_ID,
      });

    expect(orgValidation.assertPositionPlacement).toHaveBeenCalledWith({
      positionId: null,
      department_id: UNIT_A,
      reports_to_position_id: SUPERIOR_ID,
      is_unit_head: false,
    });
  });

  it("menolak jabatan tanpa unit", async () => {
    const res = await request(app)
      .post("/api/v1/positions")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ code: "SENIOR", name: "Senior Engineer" });

    expect(res.status).toBe(400);
    expect(positionModel.createPosition).not.toHaveBeenCalled();
  });

  it("kode yang sama boleh dipakai di unit lain", async () => {
    await request(app)
      .post("/api/v1/positions")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ code: "STAFF", name: "Staff", department_id: UNIT_B });

    expect(positionModel.findByCode).toHaveBeenCalledWith("STAFF", UNIT_B);
  });

  it("menolak letak yang melanggar aturan struktur", async () => {
    const { BadRequest } = await import("../../src/helpers/appError.js");
    (orgValidation.assertPositionPlacement as jest.Mock).mockRejectedValue(
      BadRequest("A position cannot report to itself") as never,
    );

    const res = await request(app)
      .patch(`/api/v1/positions/${POSITION_ID}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reports_to_position_id: SUPERIOR_ID });

    expect(res.status).toBe(400);
    expect(positionModel.updatePosition).not.toHaveBeenCalled();
  });

  it("perubahan yang tidak menyentuh struktur tidak memeriksa letaknya", async () => {
    await request(app)
      .patch(`/api/v1/positions/${POSITION_ID}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Staff Senior" });

    expect(orgValidation.assertPositionPlacement).not.toHaveBeenCalled();
  });

  it("pindah unit menyesuaikan departemen pemegangnya dalam satu transaksi", async () => {
    (positionModel.updatePosition as jest.Mock).mockResolvedValue({
      ...structured,
      department_id: UNIT_B,
    } as never);

    const res = await request(app)
      .patch(`/api/v1/positions/${POSITION_ID}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ department_id: UNIT_B, reports_to_position_id: SUPERIOR_ID });

    expect(res.status).toBe(200);
    expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
    expect(positionModel.syncHolderDepartments).toHaveBeenCalledWith(
      mockClient,
      POSITION_ID,
      UNIT_B,
    );
    expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
  });

  it("menolak melepas jabatan dari unitnya", async () => {
    const res = await request(app)
      .patch(`/api/v1/positions/${POSITION_ID}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ department_id: null });

    expect(res.status).toBe(400);
  });

  it("kuota kursi tidak boleh di bawah jumlah pemegang sekarang", async () => {
    (orgStructure.countHolders as jest.Mock).mockResolvedValue(3 as never);

    const res = await request(app)
      .patch(`/api/v1/positions/${POSITION_ID}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ max_holders: 2 });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("3 holders");
  });

  it("jabatan lama tanpa unit tidak boleh diberi atasan sebelum unitnya diisi", async () => {
    (positionModel.findById as jest.Mock).mockResolvedValue({
      ...structured,
      department_id: null,
      reports_to_position_id: null,
    } as never);

    const res = await request(app)
      .patch(`/api/v1/positions/${POSITION_ID}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reports_to_position_id: SUPERIOR_ID });

    expect(res.status).toBe(400);
    expect(res.body.details.field).toBe("department_id");
    expect(orgValidation.assertPositionPlacement).not.toHaveBeenCalled();
    expect(positionModel.updatePosition).not.toHaveBeenCalled();
  });

  it("menolak memindah jabatan ke unit lain selama masih punya bawahan", async () => {
    (positionModel.countDirectReports as jest.Mock).mockResolvedValue(
      2 as never,
    );

    const res = await request(app)
      .patch(`/api/v1/positions/${POSITION_ID}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ department_id: UNIT_B });

    expect(res.status).toBe(400);
    expect(res.body.details.direct_report_count).toBe(2);
    expect(positionModel.updatePosition).not.toHaveBeenCalled();
  });

  it("mengubah atasan jabatan mengalihkan pengajuan cuti yang menunggu", async () => {
    (approvalRouting.rerouteSafely as jest.Mock).mockResolvedValue([
      { request_id: "r1" },
    ] as never);

    const res = await request(app)
      .patch(`/api/v1/positions/${POSITION_ID}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reports_to_position_id: "77777777-7777-4777-8777-777777777777" });

    expect(res.status).toBe(200);
    expect(approvalRouting.rerouteSafely).toHaveBeenCalledTimes(1);
  });

  it("mengubah nama jabatan tidak memicu pengalihan", async () => {
    const res = await request(app)
      .patch(`/api/v1/positions/${POSITION_ID}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Senior Software Engineer" });

    expect(res.status).toBe(200);
    expect(approvalRouting.rerouteSafely).not.toHaveBeenCalled();
  });

  it("menolak menghapus jabatan yang masih punya bawahan", async () => {
    (positionModel.countDirectReports as jest.Mock).mockResolvedValue(
      2 as never,
    );

    const res = await request(app)
      .delete(`/api/v1/positions/${POSITION_ID}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.details.direct_report_count).toBe(2);
    expect(positionModel.softDeletePosition).not.toHaveBeenCalled();
  });
});
