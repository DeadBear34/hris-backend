import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import request from "supertest";

const mockPoolQuery = jest.fn(() => Promise.resolve({ rows: [] }));
const mockClient = {
  query: jest.fn((_sql: string) => Promise.resolve({ rows: [] })),
  release: jest.fn(),
};

jest.unstable_mockModule("../../src/config/databaseConnection.js", () => ({
  pool: {
    connect: jest.fn(() => Promise.resolve(mockClient)),
    query: mockPoolQuery,
  },
}));

jest.unstable_mockModule("../../src/models/user.js", () => ({
  findSessionInfo: jest.fn(),
  findById: jest.fn(),
  findByEmail: jest.fn(),
}));

jest.unstable_mockModule("../../src/models/employee.js", () => ({
  findByUserId: jest.fn(),
  findById: jest.fn(),
}));

jest.unstable_mockModule("../../src/models/leaveType.js", () => ({
  findById: jest.fn(),
}));

jest.unstable_mockModule("../../src/models/leaveBalance.js", () => ({
  summaryFor: jest.fn(),
  balanceFor: jest.fn(),
  listLedger: jest.fn(),
  createTransaction: jest.fn(),
  convertHoldToDeduction: jest.fn(),
  findByRequest: jest.fn(),
  lockEmployeeBalance: jest.fn(),
}));

const userModel = await import("../../src/models/user.js");
const employeeModel = await import("../../src/models/employee.js");
const leaveTypeModel = await import("../../src/models/leaveType.js");
const balanceModel = await import("../../src/models/leaveBalance.js");
const { createToken } = await import("../../src/helpers/jwt.js");
const { app } = await import("../../src/app.js");

const USER_ID = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ID = "33333333-3333-4333-8333-333333333333";
const LEAVE_TYPE_ID = "44444444-4444-4444-8444-444444444444";

const employeeToken = createToken({
  id: USER_ID,
  email: "karyawan@awan.io",
  role: "employee",
});
const adminToken = createToken({
  id: USER_ID,
  email: "admin2@awan.io",
  role: "admin",
});

const THIS_YEAR = new Date().getUTCFullYear();

const fakeEmployee = {
  id: EMPLOYEE_ID,
  user_id: USER_ID,
  full_name: "Ismail Muhammad",
};

const fakeSummary = [
  {
    leave_type_id: LEAVE_TYPE_ID,
    leave_type_code: "ANNUAL",
    leave_type_name: "Cuti Tahunan",
    period_year: THIS_YEAR,
    balance: 9,
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  (userModel.findSessionInfo as jest.Mock).mockResolvedValue(null as never);
  (employeeModel.findByUserId as jest.Mock).mockResolvedValue(
    fakeEmployee as never,
  );
  (employeeModel.findById as jest.Mock).mockResolvedValue({
    ...fakeEmployee,
    id: OTHER_ID,
  } as never);
  (leaveTypeModel.findById as jest.Mock).mockResolvedValue({
    id: LEAVE_TYPE_ID,
    name: "Cuti Tahunan",
  } as never);
  (balanceModel.summaryFor as jest.Mock).mockResolvedValue(
    fakeSummary as never,
  );
  (balanceModel.balanceFor as jest.Mock).mockResolvedValue(9 as never);
  (balanceModel.listLedger as jest.Mock).mockResolvedValue({
    rows: [],
    total: 0,
  } as never);
  (balanceModel.createTransaction as jest.Mock).mockResolvedValue({
    id: "transaksi",
    amount: 3,
    type: "adjustment",
  } as never);
});

describe("GET /api/v1/leave-balances/me", () => {
  it("menolak tamu", async () => {
    const res = await request(app).get("/api/v1/leave-balances/me");

    expect(res.status).toBe(401);
  });

  it("menampilkan saldo tahun berjalan secara bawaan", async () => {
    const res = await request(app)
      .get("/api/v1/leave-balances/me")
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.period_year).toBe(THIS_YEAR);
    expect(balanceModel.summaryFor).toHaveBeenCalledWith(
      EMPLOYEE_ID,
      THIS_YEAR,
    );
  });

  it("dapat menampilkan periode lain", async () => {
    await request(app)
      .get("/api/v1/leave-balances/me")
      .query({ period_year: "2025" })
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(balanceModel.summaryFor).toHaveBeenCalledWith(EMPLOYEE_ID, 2025);
  });

  it("menolak periode di luar rentang", async () => {
    const res = await request(app)
      .get("/api/v1/leave-balances/me")
      .query({ period_year: "1990" })
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(400);
  });

  it("memberi pesan jelas jika akun belum terhubung ke karyawan", async () => {
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue(null as never);

    const res = await request(app)
      .get("/api/v1/leave-balances/me")
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("not linked to an employee record");
  });
});

describe("GET /api/v1/leave-balances/me/ledger", () => {
  it("menyaring ledger berdasarkan karyawan yang login", async () => {
    await request(app)
      .get("/api/v1/leave-balances/me/ledger")
      .set("Authorization", `Bearer ${employeeToken}`);

    const [params] = (balanceModel.listLedger as jest.Mock).mock.calls[0] as [
      { employee_id: string },
    ];

    expect(params.employee_id).toBe(EMPLOYEE_ID);
  });

  it("memakai bentuk meta paginasi yang sama", async () => {
    (balanceModel.listLedger as jest.Mock).mockResolvedValue({
      rows: [],
      total: 12,
    } as never);

    const res = await request(app)
      .get("/api/v1/leave-balances/me/ledger")
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.body.meta).toEqual({
      page: 1,
      limit: 10,
      total: 12,
      total_pages: 2,
    });
  });
});

describe("GET /api/v1/leave-balances/:id", () => {
  it("menolak karyawan biasa melihat saldo orang lain", async () => {
    const res = await request(app)
      .get(`/api/v1/leave-balances/${OTHER_ID}`)
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
  });

  it("mengizinkan admin melihat saldo karyawan lain", async () => {
    const res = await request(app)
      .get(`/api/v1/leave-balances/${OTHER_ID}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.employee_id).toBe(OTHER_ID);
  });

  it("mengembalikan 404 untuk karyawan yang tidak ada", async () => {
    (employeeModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await request(app)
      .get(`/api/v1/leave-balances/${OTHER_ID}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/leave-balances/adjustments", () => {
  const body = {
    employee_id: OTHER_ID,
    leave_type_id: LEAVE_TYPE_ID,
    period_year: THIS_YEAR,
    amount: 3,
    note: "Kompensasi lembur",
  };

  it("menolak karyawan biasa", async () => {
    const res = await request(app)
      .post("/api/v1/leave-balances/adjustments")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send(body);

    expect(res.status).toBe(403);
    expect(balanceModel.createTransaction).not.toHaveBeenCalled();
  });

  it("mencatat penyesuaian sebagai transaksi adjustment", async () => {
    const res = await request(app)
      .post("/api/v1/leave-balances/adjustments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(body);

    expect(res.status).toBe(201);

    const [, data] = (balanceModel.createTransaction as jest.Mock).mock
      .calls[0] as [unknown, Record<string, unknown>];

    expect(data.type).toBe("adjustment");
    expect(data.amount).toBe(3);
    expect(data.note).toBe("Kompensasi lembur");
  });

  it("mencatat siapa yang melakukan penyesuaian", async () => {
    await request(app)
      .post("/api/v1/leave-balances/adjustments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(body);

    const [, data] = (balanceModel.createTransaction as jest.Mock).mock
      .calls[0] as [unknown, { created_by: string | null }];

    expect(data.created_by).toBe(EMPLOYEE_ID);
  });

  it("menerima penyesuaian bernilai negatif", async () => {
    const res = await request(app)
      .post("/api/v1/leave-balances/adjustments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...body, amount: -2 });

    expect(res.status).toBe(201);
  });

  it("menolak penyesuaian bernilai nol", async () => {
    const res = await request(app)
      .post("/api/v1/leave-balances/adjustments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...body, amount: 0 });

    expect(res.status).toBe(400);
  });

  it("mewajibkan alasan penyesuaian", async () => {
    const { note, ...withoutReason } = body;

    const res = await request(app)
      .post("/api/v1/leave-balances/adjustments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(withoutReason);

    expect(res.status).toBe(400);
  });

  it("menolak karyawan yang tidak ada", async () => {
    (employeeModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await request(app)
      .post("/api/v1/leave-balances/adjustments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Employee not found");
  });

  it("menolak jenis cuti yang tidak ada", async () => {
    (leaveTypeModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await request(app)
      .post("/api/v1/leave-balances/adjustments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Leave type not found");
  });

  it("mengunci saldo karyawan di dalam transaksi sebelum mencatat", async () => {
    await request(app)
      .post("/api/v1/leave-balances/adjustments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(body);

    const sqls = mockClient.query.mock.calls.map(([sql]) => sql);
    const [lockedAt] = (balanceModel.lockEmployeeBalance as jest.Mock).mock
      .invocationCallOrder;
    const [writtenAt] = (balanceModel.createTransaction as jest.Mock).mock
      .invocationCallOrder;

    expect(balanceModel.lockEmployeeBalance).toHaveBeenCalledWith(
      mockClient,
      OTHER_ID,
    );
    expect(lockedAt).toBeLessThan(writtenAt!);
    expect(sqls).toEqual(["BEGIN", "COMMIT"]);
  });

  it("membatalkan penyesuaian bila penyimpanan gagal", async () => {
    (balanceModel.createTransaction as jest.Mock).mockRejectedValue(
      new Error("gagal") as never,
    );

    const res = await request(app)
      .post("/api/v1/leave-balances/adjustments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(body);

    expect(res.status).toBe(500);
    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    expect(mockClient.release).toHaveBeenCalled();
  });

  it("mengembalikan saldo terbaru setelah penyesuaian", async () => {
    const res = await request(app)
      .post("/api/v1/leave-balances/adjustments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(body);

    expect(res.body.data.balance).toBe(9);
  });
});
