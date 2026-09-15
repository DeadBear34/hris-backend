import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import request from "supertest";

const mockClient = { query: jest.fn(), release: jest.fn() };

jest.unstable_mockModule("../../src/config/databaseConnection.js", () => ({
  pool: {
    connect: jest.fn(() => Promise.resolve(mockClient)),
    query: jest.fn(() => Promise.resolve({ rows: [] })),
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

jest.unstable_mockModule("../../src/models/holiday.js", () => ({
  findDatesBetween: jest.fn(),
}));

jest.unstable_mockModule("../../src/models/leaveType.js", () => ({
  findById: jest.fn(),
}));

jest.unstable_mockModule("../../src/models/leaveRequest.js", () => ({
  listRequests: jest.fn(),
  findById: jest.fn(),
  findDetailById: jest.fn(),
  findOverlapping: jest.fn(),
  createRequest: jest.fn(),
  approveRequest: jest.fn(),
  rejectRequest: jest.fn(),
  cancelRequest: jest.fn(),
}));

jest.unstable_mockModule("../../src/models/leaveBalance.js", () => ({
  createTransaction: jest.fn(),
  balanceFor: jest.fn(),
  lockEmployeeBalance: jest.fn(),
  convertHoldToDeduction: jest.fn(),
  summaryFor: jest.fn(),
  listLedger: jest.fn(),
  findByRequest: jest.fn(),
}));

jest.unstable_mockModule("../../src/models/leaveAttachment.js", () => ({
  findByRequest: jest.fn(),
  countByRequest: jest.fn(),
  findById: jest.fn(),
  createAttachment: jest.fn(),
}));

jest.unstable_mockModule("../../src/models/attendance.js", () => ({
  upsertLeaveDays: jest.fn(),
  deleteLeaveDays: jest.fn(),
}));

jest.unstable_mockModule("../../src/models/workSchedule.js", () => ({
  resolveForEmployee: jest.fn(),
  resolveForAllActive: jest.fn(),
  workingDatesInRange: jest.fn(),
  isWorkingDay: jest.fn(() => true),
}));

jest.unstable_mockModule("../../src/config/logger.js", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const userModel = await import("../../src/models/user.js");
const employeeModel = await import("../../src/models/employee.js");
const holidayModel = await import("../../src/models/holiday.js");
const leaveTypeModel = await import("../../src/models/leaveType.js");
const leaveRequestModel = await import("../../src/models/leaveRequest.js");
const balanceModel = await import("../../src/models/leaveBalance.js");
const attachmentModel = await import("../../src/models/leaveAttachment.js");
const attendanceModel = await import("../../src/models/attendance.js");
const workScheduleModel = await import("../../src/models/workSchedule.js");
const { createToken } = await import("../../src/helpers/jwt.js");
const { toIsoDate } = await import("../../src/helpers/workdays.js");
const { app } = await import("../../src/app.js");

const USER_ID = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";
const MANAGER_ID = "33333333-3333-4333-8333-333333333333";
const LEAVE_TYPE_ID = "44444444-4444-4444-8444-444444444444";
const REQUEST_ID = "55555555-5555-4555-8555-555555555555";
const OTHER_ID = "66666666-6666-4666-8666-666666666666";

const employeeToken = createToken({
  id: USER_ID,
  email: "karyawan@awan.io",
  role: "employee",
});
const adminToken = createToken({
  id: USER_ID,
  email: "admin@awan.io",
  role: "admin",
});

/** Senin jauh di depan supaya tidak pernah dianggap tanggal lampau. */
function futureMonday(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 40);

  while (date.getUTCDay() !== 1) {
    date.setUTCDate(date.getUTCDate() + 1);
  }

  return toIsoDate(date);
}

function shiftDays(from: string, day: number): string {
  const date = new Date(`${from}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + day);

  return toIsoDate(date);
}

const START_DATE = futureMonday();
const END_DATE = shiftDays(START_DATE, 2); // Senin sampai Rabu, tiga hari kerja
const TOTAL_DAYS = 3;

const fakeEmployee = {
  id: EMPLOYEE_ID,
  user_id: USER_ID,
  employee_number: "001",
  full_name: "Ismail Muhammad",
  phone: "+628123456789",
  gender: "male",
  manager_id: MANAGER_ID,
  is_active: true,
};

const fakeLeaveType = {
  id: LEAVE_TYPE_ID,
  code: "ANNUAL",
  name: "Cuti Tahunan",
  default_quota: 12,
  deducts_balance: true,
  is_paid: true,
  requires_attachment: false,
  attachment_required_after: null,
  max_days_per_request: null,
  min_notice_days: 0,
  gender_restriction: null,
  is_active: true,
  deleted_at: null,
};

const fakeSchedule = {
  id: "77777777-7777-4777-8777-777777777777",
  name: "Jadwal Kerja Umum",
  department_id: null,
  start_time: "08:00:00",
  works_saturday: false,
  works_sunday: false,
};

// Tanggal lampau yang dijamin hari kerja. Memakai "kemarin" begitu saja membuat
// pengujian gagal setiap Minggu dan Senin, karena rentang tanpa hari kerja
// memicu galat yang berbeda sebelum aturan yang sedang diuji sempat berjalan.
function pastWorkday(): string {
  const cursor = new Date();

  do {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  } while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6);

  return toIsoDate(cursor);
}

function fakeRequest(override: Record<string, unknown> = {}) {
  return {
    id: REQUEST_ID,
    employee_id: EMPLOYEE_ID,
    leave_type_id: LEAVE_TYPE_ID,
    start_date: START_DATE,
    end_date: END_DATE,
    total_days: TOTAL_DAYS,
    reason: "Keperluan keluarga",
    status: "pending",
    approver_id: MANAGER_ID,
    decided_by: null,
    decided_at: null,
    decision_note: null,
    cancelled_at: null,
    cancelled_by: null,
    ...override,
  };
}

const requestBody = {
  leave_type_id: LEAVE_TYPE_ID,
  start_date: START_DATE,
  end_date: END_DATE,
  reason: "Keperluan keluarga",
};

function transactionsOfType(txType: string) {
  return (balanceModel.createTransaction as jest.Mock).mock.calls
    .map(([, data]) => data as Record<string, unknown>)
    .filter((data) => data.type === txType);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockClient.query.mockResolvedValue({ rows: [] } as never);
  (userModel.findSessionInfo as jest.Mock).mockResolvedValue(null as never);
  (employeeModel.findByUserId as jest.Mock).mockResolvedValue(
    fakeEmployee as never,
  );
  (holidayModel.findDatesBetween as jest.Mock).mockResolvedValue([] as never);
  (leaveTypeModel.findById as jest.Mock).mockResolvedValue(
    fakeLeaveType as never,
  );
  (leaveRequestModel.findOverlapping as jest.Mock).mockResolvedValue(
    null as never,
  );
  (leaveRequestModel.createRequest as jest.Mock).mockResolvedValue(
    fakeRequest() as never,
  );
  (balanceModel.balanceFor as jest.Mock).mockResolvedValue(12 as never);
  (balanceModel.createTransaction as jest.Mock).mockResolvedValue({} as never);
  (balanceModel.convertHoldToDeduction as jest.Mock).mockResolvedValue(
    [] as never,
  );
  (attachmentModel.countByRequest as jest.Mock).mockResolvedValue(0 as never);
  (attachmentModel.findByRequest as jest.Mock).mockResolvedValue([] as never);
  (attendanceModel.upsertLeaveDays as jest.Mock).mockResolvedValue(0 as never);
  (attendanceModel.deleteLeaveDays as jest.Mock).mockResolvedValue(0 as never);
  (workScheduleModel.resolveForEmployee as jest.Mock).mockResolvedValue(
    fakeSchedule as never,
  );
  (workScheduleModel.workingDatesInRange as jest.Mock).mockReturnValue([
    START_DATE,
    END_DATE,
  ] as never);
});

function submitRequest(body: Record<string, unknown> = requestBody) {
  return request(app)
    .post("/api/v1/leave-requests")
    .set("Authorization", `Bearer ${employeeToken}`)
    .send(body);
}

describe("POST /api/v1/leave-requests", () => {
  it("menolak request tanpa token", async () => {
    const res = await request(app)
      .post("/api/v1/leave-requests")
      .send(requestBody);

    expect(res.status).toBe(401);
  });

  it("membuat pengajuan dan mengembalikan 201", async () => {
    const res = await submitRequest();

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(REQUEST_ID);
  });

  it("menghitung total hari kerja tanpa akhir pekan", async () => {
    await submitRequest();

    const [, data] = (leaveRequestModel.createRequest as jest.Mock).mock
      .calls[0] as [unknown, { total_days: number }];

    expect(data.total_days).toBe(TOTAL_DAYS);
  });

  it("mengurangi hari libur dari perhitungan", async () => {
    (holidayModel.findDatesBetween as jest.Mock).mockResolvedValue([
      shiftDays(START_DATE, 1),
    ] as never);

    await submitRequest();

    const [, data] = (leaveRequestModel.createRequest as jest.Mock).mock
      .calls[0] as [unknown, { total_days: number }];

    expect(data.total_days).toBe(TOTAL_DAYS - 1);
  });

  it("menolak rentang yang tidak memuat hari kerja", async () => {
    (holidayModel.findDatesBetween as jest.Mock).mockResolvedValue([
      START_DATE,
      shiftDays(START_DATE, 1),
      shiftDays(START_DATE, 2),
    ] as never);

    const res = await submitRequest();

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("contains no workdays");
  });
});

describe("penentuan penyetuju", () => {
  it("mengarahkan pengajuan ke atasan langsung", async () => {
    await submitRequest();

    const [, data] = (leaveRequestModel.createRequest as jest.Mock).mock
      .calls[0] as [unknown, { approver_id: string | null }];

    expect(data.approver_id).toBe(MANAGER_ID);
  });

  it("mengosongkan penyetuju saat pemohon tidak punya atasan", async () => {
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue({
      ...fakeEmployee,
      manager_id: null,
    } as never);

    await submitRequest();

    const [, data] = (leaveRequestModel.createRequest as jest.Mock).mock
      .calls[0] as [unknown, { approver_id: string | null }];

    expect(data.approver_id).toBeNull();
  });

  it("aturan yang sama berlaku untuk pemohon berperan admin", async () => {
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue({
      ...fakeEmployee,
      manager_id: MANAGER_ID,
    } as never);

    await request(app)
      .post("/api/v1/leave-requests")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(requestBody);

    const [, data] = (leaveRequestModel.createRequest as jest.Mock).mock
      .calls[0] as [unknown, { approver_id: string | null }];

    expect(data.approver_id).toBe(MANAGER_ID);
  });

  it("admin tanpa atasan juga memakai jalur tanpa penyetuju", async () => {
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue({
      ...fakeEmployee,
      manager_id: null,
    } as never);

    await request(app)
      .post("/api/v1/leave-requests")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(requestBody);

    const [, data] = (leaveRequestModel.createRequest as jest.Mock).mock
      .calls[0] as [unknown, { approver_id: string | null }];

    expect(data.approver_id).toBeNull();
  });
});

describe("validasi pengajuan", () => {
  it("menolak pengajuan yang tumpang tindih", async () => {
    (leaveRequestModel.findOverlapping as jest.Mock).mockResolvedValue(
      fakeRequest({ id: OTHER_ID }) as never,
    );

    const res = await submitRequest();

    expect(res.status).toBe(409);
    expect(res.body.details.conflicting_request_id).toBe(OTHER_ID);
    expect(leaveRequestModel.createRequest).not.toHaveBeenCalled();
  });

  it("menolak saat saldo tidak mencukupi", async () => {
    (balanceModel.balanceFor as jest.Mock).mockResolvedValue(2 as never);

    const res = await submitRequest();

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Insufficient");
    expect(res.body.details).toEqual({ balance: 2, requested: TOTAL_DAYS });
    expect(leaveRequestModel.createRequest).not.toHaveBeenCalled();
  });

  it("mengizinkan saldo yang pas", async () => {
    (balanceModel.balanceFor as jest.Mock).mockResolvedValue(
      TOTAL_DAYS as never,
    );

    const res = await submitRequest();

    expect(res.status).toBe(201);
  });

  it("tidak memeriksa saldo untuk jenis cuti yang tidak memotong saldo", async () => {
    (leaveTypeModel.findById as jest.Mock).mockResolvedValue({
      ...fakeLeaveType,
      deducts_balance: false,
    } as never);

    const res = await submitRequest();

    expect(res.status).toBe(201);
    expect(balanceModel.balanceFor).not.toHaveBeenCalled();
  });

  it("menolak cuti melahirkan yang diajukan karyawan laki-laki", async () => {
    (leaveTypeModel.findById as jest.Mock).mockResolvedValue({
      ...fakeLeaveType,
      code: "MATERNITY",
      name: "Cuti Melahirkan",
      gender_restriction: "female",
    } as never);

    const res = await submitRequest();

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("not available for your gender");
    expect(leaveRequestModel.createRequest).not.toHaveBeenCalled();
  });

  it("mengizinkan cuti melahirkan untuk karyawan perempuan", async () => {
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue({
      ...fakeEmployee,
      gender: "female",
    } as never);
    (leaveTypeModel.findById as jest.Mock).mockResolvedValue({
      ...fakeLeaveType,
      gender_restriction: "female",
    } as never);

    const res = await submitRequest();

    expect(res.status).toBe(201);
  });

  it("menolak durasi yang melebihi batas per pengajuan", async () => {
    (leaveTypeModel.findById as jest.Mock).mockResolvedValue({
      ...fakeLeaveType,
      max_days_per_request: 2,
    } as never);

    const res = await submitRequest();

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("at most 2 workdays");
  });

  it("menolak pengajuan yang tidak memenuhi minimal pemberitahuan", async () => {
    (leaveTypeModel.findById as jest.Mock).mockResolvedValue({
      ...fakeLeaveType,
      min_notice_days: 90,
    } as never);

    const res = await submitRequest();

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("at least 90 days before");
  });

  it("menolak tanggal lampau untuk jenis cuti selain sakit", async () => {
    const past = pastWorkday();

    const res = await submitRequest({
      ...requestBody,
      start_date: past,
      end_date: past,
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("only allowed for sick leave");
  });

  it("mengizinkan tanggal lampau untuk cuti sakit", async () => {
    (leaveTypeModel.findById as jest.Mock).mockResolvedValue({
      ...fakeLeaveType,
      code: "SICK",
      name: "Cuti Sakit",
      deducts_balance: false,
    } as never);

    const past = pastWorkday();

    const res = await submitRequest({
      ...requestBody,
      start_date: past,
      end_date: past,
    });

    expect(res.status).toBe(201);
  });

  it("menolak jenis cuti yang tidak aktif", async () => {
    (leaveTypeModel.findById as jest.Mock).mockResolvedValue({
      ...fakeLeaveType,
      is_active: false,
    } as never);

    const res = await submitRequest();

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("currently inactive");
  });

  it("menolak tanggal selesai yang mendahului tanggal mulai", async () => {
    const res = await submitRequest({
      ...requestBody,
      start_date: END_DATE,
      end_date: START_DATE,
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });
});

describe("ledger saat pengajuan dibuat", () => {
  it("mencatat penahanan saldo bernilai negatif", async () => {
    await submitRequest();

    const holds = transactionsOfType("hold");

    expect(holds).toHaveLength(1);
    expect(holds[0]!.amount).toBe(-TOTAL_DAYS);
    expect(holds[0]!.leave_request_id).toBe(REQUEST_ID);
  });

  it("membungkus pengajuan dan ledger dalam satu transaksi", async () => {
    await submitRequest();

    expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
    expect(mockClient.query).toHaveBeenCalledWith("COMMIT");

    const [db] = (balanceModel.createTransaction as jest.Mock).mock
      .calls[0] as [unknown];

    expect(db).toBe(mockClient);
  });

  it("tidak menahan saldo untuk jenis cuti tanpa potongan", async () => {
    (leaveTypeModel.findById as jest.Mock).mockResolvedValue({
      ...fakeLeaveType,
      deducts_balance: false,
    } as never);

    await submitRequest();

    expect(balanceModel.createTransaction).not.toHaveBeenCalled();
  });

  it("menjalankan ROLLBACK saat pencatatan ledger gagal", async () => {
    (balanceModel.createTransaction as jest.Mock).mockRejectedValue(
      new Error("ledger gagal") as never,
    );

    const res = await submitRequest();

    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    expect(mockClient.query).not.toHaveBeenCalledWith("COMMIT");
    expect(res.status).toBe(500);
  });

  it("selalu mengembalikan koneksi ke pool", async () => {
    (leaveRequestModel.createRequest as jest.Mock).mockRejectedValue(
      new Error("gagal") as never,
    );

    await submitRequest();

    expect(mockClient.release).toHaveBeenCalled();
  });
});

describe("PATCH /api/v1/leave-requests/:id/approve", () => {
  function approve(token = employeeToken) {
    return request(app)
      .patch(`/api/v1/leave-requests/${REQUEST_ID}/approve`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
  }

  beforeEach(() => {
    (leaveRequestModel.findById as jest.Mock).mockResolvedValue(
      fakeRequest() as never,
    );
    (leaveRequestModel.approveRequest as jest.Mock).mockResolvedValue(
      fakeRequest({ status: "approved" }) as never,
    );
  });

  it("menolak pengguna yang bukan penyetuju", async () => {
    const res = await approve();

    expect(res.status).toBe(403);
    expect(res.body.message).toContain("not the approver");
    expect(leaveRequestModel.approveRequest).not.toHaveBeenCalled();
  });

  it("mengizinkan penyetuju yang ditugaskan", async () => {
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue({
      ...fakeEmployee,
      id: MANAGER_ID,
    } as never);

    const res = await approve();

    expect(res.status).toBe(200);
  });

  it("mengizinkan admin sebagai jalur darurat", async () => {
    const res = await approve(adminToken);

    expect(res.status).toBe(200);
  });

  it("mengubah penahanan saldo menjadi pemotongan", async () => {
    await approve(adminToken);

    expect(balanceModel.convertHoldToDeduction).toHaveBeenCalledWith(
      mockClient,
      REQUEST_ID,
    );
  });

  it("membungkus keputusan dan ledger dalam satu transaksi", async () => {
    await approve(adminToken);

    expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
    expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
  });

  it("menjalankan ROLLBACK saat perubahan ledger gagal", async () => {
    (balanceModel.convertHoldToDeduction as jest.Mock).mockRejectedValue(
      new Error("ledger gagal") as never,
    );

    const res = await approve(adminToken);

    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    expect(mockClient.query).not.toHaveBeenCalledWith("COMMIT");
    expect(res.status).toBe(500);
  });

  it("menolak pengajuan yang sudah disetujui", async () => {
    (leaveRequestModel.findById as jest.Mock).mockResolvedValue(
      fakeRequest({ status: "approved" }) as never,
    );

    const res = await approve(adminToken);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("status approved cannot be approved");
  });

  it("menolak pengajuan yang sudah ditolak", async () => {
    (leaveRequestModel.findById as jest.Mock).mockResolvedValue(
      fakeRequest({ status: "rejected" }) as never,
    );

    const res = await approve(adminToken);

    expect(res.status).toBe(400);
  });

  it("menolak pengajuan yang sudah dibatalkan", async () => {
    (leaveRequestModel.findById as jest.Mock).mockResolvedValue(
      fakeRequest({ status: "cancelled" }) as never,
    );

    const res = await approve(adminToken);

    expect(res.status).toBe(400);
  });

  it("mengembalikan 404 jika pengajuan tidak ada", async () => {
    (leaveRequestModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await approve(adminToken);

    expect(res.status).toBe(404);
  });
});

describe("kewajiban lampiran saat persetujuan", () => {
  const sickLeave = {
    ...fakeLeaveType,
    code: "SICK",
    name: "Cuti Sakit",
    requires_attachment: true,
    attachment_required_after: 2,
  };

  function approve() {
    return request(app)
      .patch(`/api/v1/leave-requests/${REQUEST_ID}/approve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
  }

  beforeEach(() => {
    (leaveTypeModel.findById as jest.Mock).mockResolvedValue(
      sickLeave as never,
    );
    (leaveRequestModel.approveRequest as jest.Mock).mockResolvedValue(
      fakeRequest({ status: "approved" }) as never,
    );
  });

  it("menolak persetujuan tanpa lampiran saat durasi melewati ambang", async () => {
    (leaveRequestModel.findById as jest.Mock).mockResolvedValue(
      fakeRequest({ total_days: 3 }) as never,
    );
    (attachmentModel.countByRequest as jest.Mock).mockResolvedValue(0 as never);

    const res = await approve();

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("needs supporting evidence");
    expect(leaveRequestModel.approveRequest).not.toHaveBeenCalled();
  });

  it("mengizinkan persetujuan setelah lampiran tersedia", async () => {
    (leaveRequestModel.findById as jest.Mock).mockResolvedValue(
      fakeRequest({ total_days: 3 }) as never,
    );
    (attachmentModel.countByRequest as jest.Mock).mockResolvedValue(1 as never);

    const res = await approve();

    expect(res.status).toBe(200);
  });

  it("tidak mewajibkan lampiran saat durasi belum melewati ambang", async () => {
    (leaveRequestModel.findById as jest.Mock).mockResolvedValue(
      fakeRequest({ total_days: 2 }) as never,
    );
    (attachmentModel.countByRequest as jest.Mock).mockResolvedValue(0 as never);

    const res = await approve();

    expect(res.status).toBe(200);
  });

  it("tidak mewajibkan lampiran untuk jenis cuti biasa", async () => {
    (leaveTypeModel.findById as jest.Mock).mockResolvedValue(
      fakeLeaveType as never,
    );
    (leaveRequestModel.findById as jest.Mock).mockResolvedValue(
      fakeRequest({ total_days: 10 }) as never,
    );

    const res = await approve();

    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/v1/leave-requests/:id/reject", () => {
  function reject(token = adminToken) {
    return request(app)
      .patch(`/api/v1/leave-requests/${REQUEST_ID}/reject`)
      .set("Authorization", `Bearer ${token}`)
      .send({ decision_note: "Kebutuhan tim sedang tinggi" });
  }

  beforeEach(() => {
    (leaveRequestModel.findById as jest.Mock).mockResolvedValue(
      fakeRequest() as never,
    );
    (leaveRequestModel.rejectRequest as jest.Mock).mockResolvedValue(
      fakeRequest({ status: "rejected" }) as never,
    );
  });

  it("menolak pengguna yang bukan penyetuju", async () => {
    const res = await reject(employeeToken);

    expect(res.status).toBe(403);
    expect(leaveRequestModel.rejectRequest).not.toHaveBeenCalled();
  });

  it("mencatat pengembalian saldo bernilai positif", async () => {
    await reject();

    const refunds = transactionsOfType("refund");

    expect(refunds).toHaveLength(1);
    expect(refunds[0]!.amount).toBe(TOTAL_DAYS);
    expect(refunds[0]!.leave_request_id).toBe(REQUEST_ID);
  });

  it("meneruskan catatan keputusan ke model", async () => {
    await reject();

    const [, , , noteField] = (leaveRequestModel.rejectRequest as jest.Mock)
      .mock.calls[0] as [unknown, string, string, string | null];

    expect(noteField).toBe("Kebutuhan tim sedang tinggi");
  });

  it("menjalankan ROLLBACK saat pencatatan pengembalian gagal", async () => {
    (balanceModel.createTransaction as jest.Mock).mockRejectedValue(
      new Error("ledger gagal") as never,
    );

    const res = await reject();

    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    expect(res.status).toBe(500);
  });

  it("menolak pengajuan yang tidak berstatus pending", async () => {
    (leaveRequestModel.findById as jest.Mock).mockResolvedValue(
      fakeRequest({ status: "approved" }) as never,
    );

    const res = await reject();

    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/v1/leave-requests/:id/cancel", () => {
  function cancelLeave(token = employeeToken) {
    return request(app)
      .patch(`/api/v1/leave-requests/${REQUEST_ID}/cancel`)
      .set("Authorization", `Bearer ${token}`);
  }

  beforeEach(() => {
    (leaveRequestModel.findById as jest.Mock).mockResolvedValue(
      fakeRequest() as never,
    );
    (leaveRequestModel.cancelRequest as jest.Mock).mockResolvedValue(
      fakeRequest({ status: "cancelled" }) as never,
    );
  });

  it("mengizinkan pemohon membatalkan pengajuannya sendiri", async () => {
    const res = await cancelLeave();

    expect(res.status).toBe(200);
  });

  it("menyertakan status yang sudah diperiksa sebagai syarat pembatalan", async () => {
    await cancelLeave();

    const args = (leaveRequestModel.cancelRequest as jest.Mock).mock
      .calls[0] as unknown[];

    expect(args[3]).toBe(fakeRequest().status);
  });

  it("menolak pembatalan oleh orang lain", async () => {
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue({
      ...fakeEmployee,
      id: OTHER_ID,
    } as never);

    const res = await cancelLeave();

    expect(res.status).toBe(403);
    expect(res.body.message).toContain("cancel your own leave requests");
    expect(leaveRequestModel.cancelRequest).not.toHaveBeenCalled();
  });

  it("menolak pembatalan oleh admin sekalipun", async () => {
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue({
      ...fakeEmployee,
      id: MANAGER_ID,
    } as never);

    const res = await cancelLeave(adminToken);

    expect(res.status).toBe(403);
  });

  it("mencatat pengembalian saldo", async () => {
    await cancelLeave();

    const refunds = transactionsOfType("refund");

    expect(refunds).toHaveLength(1);
    expect(refunds[0]!.amount).toBe(TOTAL_DAYS);
  });

  it("mengizinkan pembatalan pengajuan yang sudah disetujui", async () => {
    (leaveRequestModel.findById as jest.Mock).mockResolvedValue(
      fakeRequest({ status: "approved" }) as never,
    );

    const res = await cancelLeave();

    expect(res.status).toBe(200);
  });

  it("menolak pembatalan cuti disetujui yang sudah berjalan", async () => {
    const yesterday = toIsoDate(new Date(Date.now() - 24 * 60 * 60 * 1000));

    (leaveRequestModel.findById as jest.Mock).mockResolvedValue(
      fakeRequest({ status: "approved", start_date: yesterday }) as never,
    );

    const res = await cancelLeave();

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("already started cannot be cancelled");
  });

  it("menolak pembatalan pengajuan yang sudah ditolak", async () => {
    (leaveRequestModel.findById as jest.Mock).mockResolvedValue(
      fakeRequest({ status: "rejected" }) as never,
    );

    const res = await cancelLeave();

    expect(res.status).toBe(400);
  });

  it("menjalankan ROLLBACK saat pencatatan gagal", async () => {
    (balanceModel.createTransaction as jest.Mock).mockRejectedValue(
      new Error("ledger gagal") as never,
    );

    const res = await cancelLeave();

    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    expect(res.status).toBe(500);
  });
});

describe("daftar dan detail pengajuan", () => {
  beforeEach(() => {
    (leaveRequestModel.listRequests as jest.Mock).mockResolvedValue({
      rows: [fakeRequest()],
      total: 25,
    } as never);
  });

  it("daftar milik sendiri disaring berdasarkan karyawan yang login", async () => {
    await request(app)
      .get("/api/v1/leave-requests/me")
      .set("Authorization", `Bearer ${employeeToken}`);

    const [params] = (leaveRequestModel.listRequests as jest.Mock).mock
      .calls[0] as [{ employee_id: string }];

    expect(params.employee_id).toBe(EMPLOYEE_ID);
  });

  it("daftar persetujuan disaring berdasarkan penyetuju", async () => {
    await request(app)
      .get("/api/v1/leave-requests/approvals")
      .set("Authorization", `Bearer ${employeeToken}`);

    const [params] = (leaveRequestModel.listRequests as jest.Mock).mock
      .calls[0] as [{ approver_id: string; include_unassigned: boolean }];

    expect(params.approver_id).toBe(EMPLOYEE_ID);
    expect(params.include_unassigned).toBe(false);
  });

  it("admin ikut melihat pengajuan yang belum punya penyetuju", async () => {
    await request(app)
      .get("/api/v1/leave-requests/approvals")
      .set("Authorization", `Bearer ${adminToken}`);

    const [params] = (leaveRequestModel.listRequests as jest.Mock).mock
      .calls[0] as [{ include_unassigned: boolean }];

    expect(params.include_unassigned).toBe(true);
  });

  it("daftar seluruh pengajuan hanya untuk pemegang leave.view_all", async () => {
    const res = await request(app)
      .get("/api/v1/leave-requests")
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
  });

  it("memakai bentuk meta paginasi yang sama dengan daftar karyawan", async () => {
    const res = await request(app)
      .get("/api/v1/leave-requests")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.body.meta).toEqual({
      page: 1,
      limit: 10,
      total: 25,
      total_pages: 3,
    });
  });

  it("meneruskan filter status ke model", async () => {
    await request(app)
      .get("/api/v1/leave-requests")
      .query({ status: "pending", limit: "5" })
      .set("Authorization", `Bearer ${adminToken}`);

    const [params] = (leaveRequestModel.listRequests as jest.Mock).mock
      .calls[0] as [{ status: string; limit: number }];

    expect(params.status).toBe("pending");
    expect(params.limit).toBe(5);
  });

  it("menolak status di luar pilihan", async () => {
    const res = await request(app)
      .get("/api/v1/leave-requests")
      .query({ status: "entahlah" })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });

  it("detail dapat dilihat pemohon", async () => {
    (leaveRequestModel.findDetailById as jest.Mock).mockResolvedValue(
      fakeRequest() as never,
    );

    const res = await request(app)
      .get(`/api/v1/leave-requests/${REQUEST_ID}`)
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(200);
  });

  it("detail ditolak untuk pengguna yang tidak berkepentingan", async () => {
    (leaveRequestModel.findDetailById as jest.Mock).mockResolvedValue(
      fakeRequest({ employee_id: OTHER_ID, approver_id: OTHER_ID }) as never,
    );

    const res = await request(app)
      .get(`/api/v1/leave-requests/${REQUEST_ID}`)
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
  });

  it("detail dapat dilihat admin", async () => {
    (leaveRequestModel.findDetailById as jest.Mock).mockResolvedValue(
      fakeRequest({ employee_id: OTHER_ID, approver_id: OTHER_ID }) as never,
    );

    const res = await request(app)
      .get(`/api/v1/leave-requests/${REQUEST_ID}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
  });
});

describe("penandaan absensi saat cuti disetujui", () => {
  function approve() {
    return request(app)
      .patch(`/api/v1/leave-requests/${REQUEST_ID}/approve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
  }

  beforeEach(() => {
    (leaveRequestModel.findById as jest.Mock).mockResolvedValue(
      fakeRequest() as never,
    );
    (leaveRequestModel.approveRequest as jest.Mock).mockResolvedValue(
      fakeRequest({ status: "approved" }) as never,
    );
  });

  it("membuat baris absensi cuti untuk setiap hari kerja dalam rentangnya", async () => {
    const res = await approve();

    expect(res.status).toBe(200);
    expect(attendanceModel.upsertLeaveDays).toHaveBeenCalledWith(
      mockClient,
      EMPLOYEE_ID,
      [START_DATE, END_DATE],
      REQUEST_ID,
    );
  });

  it("mengeluarkan hari libur dari tanggal yang ditandai", async () => {
    (holidayModel.findDatesBetween as jest.Mock).mockResolvedValue([
      END_DATE,
    ] as never);

    await approve();

    expect(workScheduleModel.workingDatesInRange).toHaveBeenCalledWith(
      fakeSchedule,
      START_DATE,
      END_DATE,
      [END_DATE],
    );
  });

  it("menandai absensi di dalam transaksi yang sama dengan persetujuannya", async () => {
    await approve();

    const order = mockClient.query.mock.calls.map(([sql]) => sql);

    expect(order).toContain("BEGIN");
    expect(order).toContain("COMMIT");
    expect(attendanceModel.upsertLeaveDays).toHaveBeenCalledWith(
      mockClient,
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it("membatalkan persetujuan ketika penandaan absensi gagal", async () => {
    (attendanceModel.upsertLeaveDays as jest.Mock).mockRejectedValue(
      new Error("gagal menandai") as never,
    );

    const res = await approve();

    expect(res.status).toBe(500);
    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("tetap menyetujui cuti meski karyawan belum punya jadwal kerja", async () => {
    (workScheduleModel.resolveForEmployee as jest.Mock).mockResolvedValue(
      null as never,
    );

    const res = await approve();

    expect(res.status).toBe(200);
    expect(attendanceModel.upsertLeaveDays).not.toHaveBeenCalled();
  });
});

describe("penghapusan absensi saat cuti dibatalkan", () => {
  function cancelLeave() {
    return request(app)
      .patch(`/api/v1/leave-requests/${REQUEST_ID}/cancel`)
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({});
  }

  beforeEach(() => {
    (leaveRequestModel.cancelRequest as jest.Mock).mockResolvedValue(
      fakeRequest({ status: "cancelled" }) as never,
    );
  });

  it("menghapus baris absensi cuti dari pengajuan yang sudah disetujui", async () => {
    (leaveRequestModel.findById as jest.Mock).mockResolvedValue(
      fakeRequest({ status: "approved" }) as never,
    );

    const res = await cancelLeave();

    expect(res.status).toBe(200);
    expect(attendanceModel.deleteLeaveDays).toHaveBeenCalledWith(
      mockClient,
      REQUEST_ID,
    );
  });

  it("tidak menghapus apa pun untuk pengajuan yang masih menunggu", async () => {
    (leaveRequestModel.findById as jest.Mock).mockResolvedValue(
      fakeRequest({ status: "pending" }) as never,
    );

    const res = await cancelLeave();

    expect(res.status).toBe(200);
    expect(attendanceModel.deleteLeaveDays).not.toHaveBeenCalled();
  });

  it("membatalkan transaksi ketika penghapusan absensi gagal", async () => {
    (leaveRequestModel.findById as jest.Mock).mockResolvedValue(
      fakeRequest({ status: "approved" }) as never,
    );
    (attendanceModel.deleteLeaveDays as jest.Mock).mockRejectedValue(
      new Error("gagal menghapus") as never,
    );

    const res = await cancelLeave();

    expect(res.status).toBe(500);
    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
  });
});

// Saldo pernah bisa jadi minus karena diperiksa di luar transaksi: dua
// pengajuan bersamaan sama-sama membaca saldo lama lalu keduanya lolos
describe("saldo tidak boleh bisa ditembus permintaan bersamaan", () => {
  beforeEach(() => {
    (balanceModel.balanceFor as jest.Mock).mockResolvedValue(12 as never);
  });

  it("mengunci baris karyawan sebelum menulis pengajuan", async () => {
    await submitRequest();

    expect(balanceModel.lockEmployeeBalance).toHaveBeenCalled();
  });

  it("mengunci di dalam transaksi, bukan sebelum BEGIN", async () => {
    await submitRequest();

    const queryOrder = mockClient.query.mock.calls.map(([sql]) => String(sql));

    expect(queryOrder[0]).toBe("BEGIN");
    expect(
      (balanceModel.lockEmployeeBalance as jest.Mock).mock
        .invocationCallOrder[0],
    ).toBeGreaterThan(0);
  });

  it("memeriksa saldo memakai klien transaksi, bukan pool", async () => {
    await submitRequest();

    // panggilan terakhir balanceFor adalah pemeriksaan yang menentukan,
    // dan argumen keempatnya harus klien transaksi
    const calls = (balanceModel.balanceFor as jest.Mock).mock.calls;
    const lastCall = calls[calls.length - 1] as unknown[];

    expect(lastCall[3]).toBe(mockClient);
  });

  it("memeriksa saldo SESUDAH mengunci, bukan sebelum", async () => {
    await submitRequest();

    const lockOrder = (balanceModel.lockEmployeeBalance as jest.Mock).mock
      .invocationCallOrder[0]!;
    const balanceCalls = (balanceModel.balanceFor as jest.Mock).mock
      .invocationCallOrder;
    const lastBalanceCall = balanceCalls[balanceCalls.length - 1]!;

    expect(lastBalanceCall).toBeGreaterThan(lockOrder);
  });

  it("tidak menulis apa pun kalau saldo kurang saat diperiksa ulang", async () => {
    // lolos penyaring awal, tapi habis saat pemeriksaan di dalam transaksi
    (balanceModel.balanceFor as jest.Mock)
      .mockResolvedValueOnce(12 as never)
      .mockResolvedValueOnce(0 as never);

    const res = await submitRequest();

    expect(res.status).toBe(400);
    expect(leaveRequestModel.createRequest).not.toHaveBeenCalled();
    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
  });
});
