import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import request from "supertest";

jest.unstable_mockModule("../../src/config/databaseConnection.js", () => ({
  pool: {
    connect: jest.fn(),
    query: jest.fn(() => Promise.resolve({ rows: [] })),
  },
}));

jest.unstable_mockModule("../../src/models/holiday.js", () => ({
  listHolidays: jest.fn(),
  findById: jest.fn(),
  findByDate: jest.fn(),
  findDatesBetween: jest.fn(),
  createHoliday: jest.fn(),
  updateHoliday: jest.fn(),
  deleteHoliday: jest.fn(),
}));

jest.unstable_mockModule("../../src/models/leaveType.js", () => ({
  findAll: jest.fn(),
  findById: jest.fn(),
  findByCode: jest.fn(),
  createLeaveType: jest.fn(),
  updateLeaveType: jest.fn(),
  softDeleteLeaveType: jest.fn(),
  countLeaveRequests: jest.fn(),
}));

const holidayModel = await import("../../src/models/holiday.js");
const leaveTypeModel = await import("../../src/models/leaveType.js");
const { createToken } = await import("../../src/helpers/jwt.js");
const { app } = await import("../../src/app.js");

const HOLIDAY_ID = "11111111-1111-4111-8111-111111111111";
const LEAVE_TYPE_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";

const employeeToken = createToken({
  id: USER_ID,
  email: "karyawan@awan.io",
  role: "employee",
});
const hrToken = createToken({ id: USER_ID, email: "hr@awan.io", role: "hr" });
const adminToken = createToken({
  id: USER_ID,
  email: "admin@awan.io",
  role: "admin",
});

const fakeHoliday = {
  id: HOLIDAY_ID,
  holiday_date: "2026-08-17",
  name: "Hari Kemerdekaan Republik Indonesia",
  is_collective_leave: false,
};

const fakeLeaveType = {
  id: LEAVE_TYPE_ID,
  code: "ANNUAL",
  name: "Cuti Tahunan",
  default_quota: 12,
  deducts_balance: true,
  is_active: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  (holidayModel.listHolidays as jest.Mock).mockResolvedValue({
    rows: [fakeHoliday],
    total: 9,
  } as never);
  (holidayModel.findById as jest.Mock).mockResolvedValue(fakeHoliday as never);
  (holidayModel.findByDate as jest.Mock).mockResolvedValue(null as never);
  (holidayModel.createHoliday as jest.Mock).mockResolvedValue(
    fakeHoliday as never,
  );
  (holidayModel.updateHoliday as jest.Mock).mockResolvedValue(
    fakeHoliday as never,
  );
  (leaveTypeModel.findAll as jest.Mock).mockResolvedValue([
    fakeLeaveType,
  ] as never);
  (leaveTypeModel.findById as jest.Mock).mockResolvedValue(
    fakeLeaveType as never,
  );
  (leaveTypeModel.findByCode as jest.Mock).mockResolvedValue(null as never);
  (leaveTypeModel.createLeaveType as jest.Mock).mockResolvedValue(
    fakeLeaveType as never,
  );
  (leaveTypeModel.updateLeaveType as jest.Mock).mockResolvedValue(
    fakeLeaveType as never,
  );
  (leaveTypeModel.countLeaveRequests as jest.Mock).mockResolvedValue(
    0 as never,
  );
});

describe("hari libur", () => {
  const body = { holiday_date: "2026-08-17", name: "Hari Kemerdekaan" };

  it("menolak tamu", async () => {
    const res = await request(app).get("/api/v1/holidays");

    expect(res.status).toBe(401);
  });

  it("dapat dibaca karyawan biasa karena dipakai menghitung durasi cuti", async () => {
    const res = await request(app)
      .get("/api/v1/holidays")
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("memakai bentuk meta paginasi yang sama", async () => {
    const res = await request(app)
      .get("/api/v1/holidays")
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.body.meta).toEqual({
      page: 1,
      limit: 10,
      total: 9,
      total_pages: 1,
    });
  });

  it("meneruskan filter tahun ke model", async () => {
    await request(app)
      .get("/api/v1/holidays")
      .query({ year: "2026" })
      .set("Authorization", `Bearer ${employeeToken}`);

    const [params] = (holidayModel.listHolidays as jest.Mock).mock.calls[0] as [
      { year: number },
    ];

    expect(params.year).toBe(2026);
  });

  it("menolak penambahan oleh karyawan biasa", async () => {
    const res = await request(app)
      .post("/api/v1/holidays")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send(body);

    expect(res.status).toBe(403);
    expect(holidayModel.createHoliday).not.toHaveBeenCalled();
  });

  it("mengizinkan HR menambah hari libur", async () => {
    const res = await request(app)
      .post("/api/v1/holidays")
      .set("Authorization", `Bearer ${hrToken}`)
      .send(body);

    expect(res.status).toBe(201);
  });

  it("mengizinkan admin menambah hari libur", async () => {
    const res = await request(app)
      .post("/api/v1/holidays")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(body);

    expect(res.status).toBe(201);
  });

  it("menolak tanggal yang sudah terdaftar", async () => {
    (holidayModel.findByDate as jest.Mock).mockResolvedValue(
      fakeHoliday as never,
    );

    const res = await request(app)
      .post("/api/v1/holidays")
      .set("Authorization", `Bearer ${hrToken}`)
      .send(body);

    expect(res.status).toBe(409);
    expect(holidayModel.createHoliday).not.toHaveBeenCalled();
  });

  it("mengembalikan 404 saat mengubah hari libur yang tidak ada", async () => {
    (holidayModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await request(app)
      .patch(`/api/v1/holidays/${HOLIDAY_ID}`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ name: "Nama Baru" });

    expect(res.status).toBe(404);
  });

  it("tidak memeriksa duplikat saat tanggal tidak berubah", async () => {
    const res = await request(app)
      .patch(`/api/v1/holidays/${HOLIDAY_ID}`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ holiday_date: fakeHoliday.holiday_date });

    expect(res.status).toBe(200);
    expect(holidayModel.findByDate).not.toHaveBeenCalled();
  });

  it("menghapus hari libur yang ada", async () => {
    const res = await request(app)
      .delete(`/api/v1/holidays/${HOLIDAY_ID}`)
      .set("Authorization", `Bearer ${hrToken}`);

    expect(res.status).toBe(200);
    expect(holidayModel.deleteHoliday).toHaveBeenCalledWith(HOLIDAY_ID);
  });

  it("menolak id yang bukan uuid", async () => {
    const res = await request(app)
      .delete("/api/v1/holidays/123")
      .set("Authorization", `Bearer ${hrToken}`);

    expect(res.status).toBe(400);
  });
});

describe("jenis cuti", () => {
  const body = { code: "ANNUAL", name: "Cuti Tahunan", default_quota: 12 };

  it("dapat dibaca karyawan biasa untuk pilihan formulir", async () => {
    const res = await request(app)
      .get("/api/v1/leave-types")
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("menolak tamu", async () => {
    const res = await request(app).get("/api/v1/leave-types");

    expect(res.status).toBe(401);
  });

  it("menolak penambahan oleh karyawan biasa", async () => {
    const res = await request(app)
      .post("/api/v1/leave-types")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send(body);

    expect(res.status).toBe(403);
  });

  it("menolak kode yang sudah dipakai", async () => {
    (leaveTypeModel.findByCode as jest.Mock).mockResolvedValue(
      fakeLeaveType as never,
    );

    const res = await request(app)
      .post("/api/v1/leave-types")
      .set("Authorization", `Bearer ${hrToken}`)
      .send(body);

    expect(res.status).toBe(409);
  });

  it("menyimpan kode dalam huruf besar", async () => {
    await request(app)
      .post("/api/v1/leave-types")
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ ...body, code: "annual" });

    const [data] = (leaveTypeModel.createLeaveType as jest.Mock).mock
      .calls[0] as [{ code: string }];

    expect(data.code).toBe("ANNUAL");
  });

  it("menolak penghapusan jenis cuti yang sudah dipakai pengajuan", async () => {
    (leaveTypeModel.countLeaveRequests as jest.Mock).mockResolvedValue(
      4 as never,
    );

    const res = await request(app)
      .delete(`/api/v1/leave-types/${LEAVE_TYPE_ID}`)
      .set("Authorization", `Bearer ${hrToken}`);

    expect(res.status).toBe(400);
    expect(res.body.details.leave_request_count).toBe(4);
    expect(leaveTypeModel.softDeleteLeaveType).not.toHaveBeenCalled();
  });

  it("menyarankan menonaktifkan alih-alih menghapus", async () => {
    (leaveTypeModel.countLeaveRequests as jest.Mock).mockResolvedValue(
      2 as never,
    );

    const res = await request(app)
      .delete(`/api/v1/leave-types/${LEAVE_TYPE_ID}`)
      .set("Authorization", `Bearer ${hrToken}`);

    expect(res.body.message).toContain("Nonaktifkan");
  });

  it("menghapus jenis cuti yang belum pernah dipakai", async () => {
    const res = await request(app)
      .delete(`/api/v1/leave-types/${LEAVE_TYPE_ID}`)
      .set("Authorization", `Bearer ${hrToken}`);

    expect(res.status).toBe(200);
    expect(leaveTypeModel.softDeleteLeaveType).toHaveBeenCalledWith(
      LEAVE_TYPE_ID,
    );
  });

  it("mengembalikan 404 untuk jenis cuti yang tidak ada", async () => {
    (leaveTypeModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await request(app)
      .get(`/api/v1/leave-types/${LEAVE_TYPE_ID}`)
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(404);
  });

  it("menolak batasan gender di luar pilihan", async () => {
    const res = await request(app)
      .post("/api/v1/leave-types")
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ ...body, gender_restriction: "lainnya" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });
});
