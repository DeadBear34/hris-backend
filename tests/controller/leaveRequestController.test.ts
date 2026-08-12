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
const { createToken } = await import("../../src/helpers/jwt.js");
const { toIsoDate } = await import("../../src/helpers/workdays.js");
const { app } = await import("../../src/app.js");

const USER_ID = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";
const MANAGER_ID = "33333333-3333-4333-8333-333333333333";
const LEAVE_TYPE_ID = "44444444-4444-4444-8444-444444444444";
const REQUEST_ID = "55555555-5555-4555-8555-555555555555";
const LAIN_ID = "66666666-6666-4666-8666-666666666666";

const employeeToken = createToken({
  id: USER_ID,
  email: "karyawan@awan.io",
  role: "employee",
});
const hrToken = createToken({ id: USER_ID, email: "hr@awan.io", role: "hr" });

/** Senin jauh di depan supaya tidak pernah dianggap tanggal lampau. */
function seninDiMasaDepan(): string {
  const tanggal = new Date();
  tanggal.setUTCDate(tanggal.getUTCDate() + 40);

  while (tanggal.getUTCDay() !== 1) {
    tanggal.setUTCDate(tanggal.getUTCDate() + 1);
  }

  return toIsoDate(tanggal);
}

function geser(dari: string, hari: number): string {
  const tanggal = new Date(`${dari}T00:00:00Z`);
  tanggal.setUTCDate(tanggal.getUTCDate() + hari);

  return toIsoDate(tanggal);
}

const MULAI = seninDiMasaDepan();
const SELESAI = geser(MULAI, 2); // Senin sampai Rabu, tiga hari kerja
const TOTAL_HARI = 3;

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

function fakeRequest(override: Record<string, unknown> = {}) {
  return {
    id: REQUEST_ID,
    employee_id: EMPLOYEE_ID,
    leave_type_id: LEAVE_TYPE_ID,
    start_date: MULAI,
    end_date: SELESAI,
    total_days: TOTAL_HARI,
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

const bodyPengajuan = {
  leave_type_id: LEAVE_TYPE_ID,
  start_date: MULAI,
  end_date: SELESAI,
  reason: "Keperluan keluarga",
};

/** Mengambil transaksi ledger bertipe tertentu dari pemanggilan model. */
function transaksiBertipe(tipe: string) {
  return (balanceModel.createTransaction as jest.Mock).mock.calls
    .map(([, data]) => data as Record<string, unknown>)
    .filter((data) => data.type === tipe);
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
  (balanceModel.createTransaction as jest.Mock).mockResolvedValue(
    {} as never,
  );
  (balanceModel.convertHoldToDeduction as jest.Mock).mockResolvedValue(
    [] as never,
  );
  (attachmentModel.countByRequest as jest.Mock).mockResolvedValue(0 as never);
  (attachmentModel.findByRequest as jest.Mock).mockResolvedValue([] as never);
});

function ajukan(body: Record<string, unknown> = bodyPengajuan) {
  return request(app)
    .post("/api/v1/leave-requests")
    .set("Authorization", `Bearer ${employeeToken}`)
    .send(body);
}

describe("POST /api/v1/leave-requests", () => {
  it("menolak request tanpa token", async () => {
    const res = await request(app)
      .post("/api/v1/leave-requests")
      .send(bodyPengajuan);

    expect(res.status).toBe(401);
  });

  it("membuat pengajuan dan mengembalikan 201", async () => {
    const res = await ajukan();

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(REQUEST_ID);
  });

  it("menghitung total hari kerja tanpa akhir pekan", async () => {
    await ajukan();

    const [, data] = (leaveRequestModel.createRequest as jest.Mock).mock
      .calls[0] as [unknown, { total_days: number }];

    expect(data.total_days).toBe(TOTAL_HARI);
  });

  it("mengurangi hari libur dari perhitungan", async () => {
    (holidayModel.findDatesBetween as jest.Mock).mockResolvedValue([
      geser(MULAI, 1),
    ] as never);

    await ajukan();

    const [, data] = (leaveRequestModel.createRequest as jest.Mock).mock
      .calls[0] as [unknown, { total_days: number }];

    expect(data.total_days).toBe(TOTAL_HARI - 1);
  });

  it("menolak rentang yang tidak memuat hari kerja", async () => {
    (holidayModel.findDatesBetween as jest.Mock).mockResolvedValue([
      MULAI,
      geser(MULAI, 1),
      geser(MULAI, 2),
    ] as never);

    const res = await ajukan();

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("tidak memuat satu pun hari kerja");
  });
});

describe("penentuan penyetuju", () => {
  it("mengarahkan pengajuan ke atasan langsung", async () => {
    await ajukan();

    const [, data] = (leaveRequestModel.createRequest as jest.Mock).mock
      .calls[0] as [unknown, { approver_id: string | null }];

    expect(data.approver_id).toBe(MANAGER_ID);
  });

  it("mengosongkan penyetuju saat pemohon tidak punya atasan", async () => {
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue({
      ...fakeEmployee,
      manager_id: null,
    } as never);

    await ajukan();

    const [, data] = (leaveRequestModel.createRequest as jest.Mock).mock
      .calls[0] as [unknown, { approver_id: string | null }];

    expect(data.approver_id).toBeNull();
  });

  it("aturan yang sama berlaku untuk pemohon berperan HR", async () => {
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue({
      ...fakeEmployee,
      manager_id: MANAGER_ID,
    } as never);

    await request(app)
      .post("/api/v1/leave-requests")
      .set("Authorization", `Bearer ${hrToken}`)
      .send(bodyPengajuan);

    const [, data] = (leaveRequestModel.createRequest as jest.Mock).mock
      .calls[0] as [unknown, { approver_id: string | null }];

    expect(data.approver_id).toBe(MANAGER_ID);
  });

  it("HR tanpa atasan juga memakai jalur tanpa penyetuju", async () => {
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue({
      ...fakeEmployee,
      manager_id: null,
    } as never);

    await request(app)
      .post("/api/v1/leave-requests")
      .set("Authorization", `Bearer ${hrToken}`)
      .send(bodyPengajuan);

    const [, data] = (leaveRequestModel.createRequest as jest.Mock).mock
      .calls[0] as [unknown, { approver_id: string | null }];

    expect(data.approver_id).toBeNull();
  });
});

describe("validasi pengajuan", () => {
  it("menolak pengajuan yang tumpang tindih", async () => {
    (leaveRequestModel.findOverlapping as jest.Mock).mockResolvedValue(
      fakeRequest({ id: LAIN_ID }) as never,
    );

    const res = await ajukan();

    expect(res.status).toBe(409);
    expect(res.body.details.conflicting_request_id).toBe(LAIN_ID);
    expect(leaveRequestModel.createRequest).not.toHaveBeenCalled();
  });

  it("menolak saat saldo tidak mencukupi", async () => {
    (balanceModel.balanceFor as jest.Mock).mockResolvedValue(2 as never);

    const res = await ajukan();

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("tidak mencukupi");
    expect(res.body.details).toEqual({ balance: 2, requested: TOTAL_HARI });
    expect(leaveRequestModel.createRequest).not.toHaveBeenCalled();
  });

  it("mengizinkan saldo yang pas", async () => {
    (balanceModel.balanceFor as jest.Mock).mockResolvedValue(
      TOTAL_HARI as never,
    );

    const res = await ajukan();

    expect(res.status).toBe(201);
  });

  it("tidak memeriksa saldo untuk jenis cuti yang tidak memotong saldo", async () => {
    (leaveTypeModel.findById as jest.Mock).mockResolvedValue({
      ...fakeLeaveType,
      deducts_balance: false,
    } as never);

    const res = await ajukan();

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

    const res = await ajukan();

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("tidak tersedia untuk gender kamu");
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

    const res = await ajukan();

    expect(res.status).toBe(201);
  });

  it("menolak durasi yang melebihi batas per pengajuan", async () => {
    (leaveTypeModel.findById as jest.Mock).mockResolvedValue({
      ...fakeLeaveType,
      max_days_per_request: 2,
    } as never);

    const res = await ajukan();

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("maksimal 2 hari kerja");
  });

  it("menolak pengajuan yang tidak memenuhi minimal pemberitahuan", async () => {
    (leaveTypeModel.findById as jest.Mock).mockResolvedValue({
      ...fakeLeaveType,
      min_notice_days: 90,
    } as never);

    const res = await ajukan();

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("minimal 90 hari sebelum");
  });

  it("menolak tanggal lampau untuk jenis cuti selain sakit", async () => {
    const kemarin = toIsoDate(new Date(Date.now() - 24 * 60 * 60 * 1000));

    const res = await ajukan({
      ...bodyPengajuan,
      start_date: kemarin,
      end_date: kemarin,
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("hanya diperbolehkan untuk cuti sakit");
  });

  it("mengizinkan tanggal lampau untuk cuti sakit", async () => {
    (leaveTypeModel.findById as jest.Mock).mockResolvedValue({
      ...fakeLeaveType,
      code: "SICK",
      name: "Cuti Sakit",
      deducts_balance: false,
    } as never);

    const kemarin = toIsoDate(new Date(Date.now() - 24 * 60 * 60 * 1000));

    const res = await ajukan({
      ...bodyPengajuan,
      start_date: kemarin,
      end_date: kemarin,
    });

    // hanya lolos kalau kemarin bukan akhir pekan
    expect([201, 400]).toContain(res.status);
    if (res.status === 400) {
      expect(res.body.message).toContain("hari kerja");
    }
  });

  it("menolak jenis cuti yang tidak aktif", async () => {
    (leaveTypeModel.findById as jest.Mock).mockResolvedValue({
      ...fakeLeaveType,
      is_active: false,
    } as never);

    const res = await ajukan();

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("sedang tidak aktif");
  });

  it("menolak tanggal selesai yang mendahului tanggal mulai", async () => {
    const res = await ajukan({
      ...bodyPengajuan,
      start_date: SELESAI,
      end_date: MULAI,
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });
});

describe("ledger saat pengajuan dibuat", () => {
  it("mencatat penahanan saldo bernilai negatif", async () => {
    await ajukan();

    const holds = transaksiBertipe("hold");

    expect(holds).toHaveLength(1);
    expect(holds[0]!.amount).toBe(-TOTAL_HARI);
    expect(holds[0]!.leave_request_id).toBe(REQUEST_ID);
  });

  it("membungkus pengajuan dan ledger dalam satu transaksi", async () => {
    await ajukan();

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

    await ajukan();

    expect(balanceModel.createTransaction).not.toHaveBeenCalled();
  });

  it("menjalankan ROLLBACK saat pencatatan ledger gagal", async () => {
    (balanceModel.createTransaction as jest.Mock).mockRejectedValue(
      new Error("ledger gagal") as never,
    );

    const res = await ajukan();

    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    expect(mockClient.query).not.toHaveBeenCalledWith("COMMIT");
    expect(res.status).toBe(500);
  });

  it("selalu mengembalikan koneksi ke pool", async () => {
    (leaveRequestModel.createRequest as jest.Mock).mockRejectedValue(
      new Error("gagal") as never,
    );

    await ajukan();

    expect(mockClient.release).toHaveBeenCalled();
  });
});

describe("PATCH /api/v1/leave-requests/:id/approve", () => {
  function setujui(token = employeeToken) {
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
    const res = await setujui();

    expect(res.status).toBe(403);
    expect(res.body.message).toContain("bukan penyetuju");
    expect(leaveRequestModel.approveRequest).not.toHaveBeenCalled();
  });

  it("mengizinkan penyetuju yang ditugaskan", async () => {
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue({
      ...fakeEmployee,
      id: MANAGER_ID,
    } as never);

    const res = await setujui();

    expect(res.status).toBe(200);
  });

  it("mengizinkan HR sebagai jalur darurat", async () => {
    const res = await setujui(hrToken);

    expect(res.status).toBe(200);
  });

  it("mengubah penahanan saldo menjadi pemotongan", async () => {
    await setujui(hrToken);

    expect(balanceModel.convertHoldToDeduction).toHaveBeenCalledWith(
      mockClient,
      REQUEST_ID,
    );
  });

  it("membungkus keputusan dan ledger dalam satu transaksi", async () => {
    await setujui(hrToken);

    expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
    expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
  });

  it("menjalankan ROLLBACK saat perubahan ledger gagal", async () => {
    (balanceModel.convertHoldToDeduction as jest.Mock).mockRejectedValue(
      new Error("ledger gagal") as never,
    );

    const res = await setujui(hrToken);

    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    expect(mockClient.query).not.toHaveBeenCalledWith("COMMIT");
    expect(res.status).toBe(500);
  });

  it("menolak pengajuan yang sudah disetujui", async () => {
    (leaveRequestModel.findById as jest.Mock).mockResolvedValue(
      fakeRequest({ status: "approved" }) as never,
    );

    const res = await setujui(hrToken);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("disetujui tidak dapat disetujui");
  });

  it("menolak pengajuan yang sudah ditolak", async () => {
    (leaveRequestModel.findById as jest.Mock).mockResolvedValue(
      fakeRequest({ status: "rejected" }) as never,
    );

    const res = await setujui(hrToken);

    expect(res.status).toBe(400);
  });

  it("menolak pengajuan yang sudah dibatalkan", async () => {
    (leaveRequestModel.findById as jest.Mock).mockResolvedValue(
      fakeRequest({ status: "cancelled" }) as never,
    );

    const res = await setujui(hrToken);

    expect(res.status).toBe(400);
  });

  it("mengembalikan 404 jika pengajuan tidak ada", async () => {
    (leaveRequestModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await setujui(hrToken);

    expect(res.status).toBe(404);
  });
});

describe("kewajiban lampiran saat persetujuan", () => {
  const cutiSakit = {
    ...fakeLeaveType,
    code: "SICK",
    name: "Cuti Sakit",
    requires_attachment: true,
    attachment_required_after: 2,
  };

  function setujui() {
    return request(app)
      .patch(`/api/v1/leave-requests/${REQUEST_ID}/approve`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({});
  }

  beforeEach(() => {
    (leaveTypeModel.findById as jest.Mock).mockResolvedValue(
      cutiSakit as never,
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

    const res = await setujui();

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("wajib melampirkan bukti");
    expect(leaveRequestModel.approveRequest).not.toHaveBeenCalled();
  });

  it("mengizinkan persetujuan setelah lampiran tersedia", async () => {
    (leaveRequestModel.findById as jest.Mock).mockResolvedValue(
      fakeRequest({ total_days: 3 }) as never,
    );
    (attachmentModel.countByRequest as jest.Mock).mockResolvedValue(1 as never);

    const res = await setujui();

    expect(res.status).toBe(200);
  });

  it("tidak mewajibkan lampiran saat durasi belum melewati ambang", async () => {
    (leaveRequestModel.findById as jest.Mock).mockResolvedValue(
      fakeRequest({ total_days: 2 }) as never,
    );
    (attachmentModel.countByRequest as jest.Mock).mockResolvedValue(0 as never);

    const res = await setujui();

    expect(res.status).toBe(200);
  });

  it("tidak mewajibkan lampiran untuk jenis cuti biasa", async () => {
    (leaveTypeModel.findById as jest.Mock).mockResolvedValue(
      fakeLeaveType as never,
    );
    (leaveRequestModel.findById as jest.Mock).mockResolvedValue(
      fakeRequest({ total_days: 10 }) as never,
    );

    const res = await setujui();

    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/v1/leave-requests/:id/reject", () => {
  function tolak(token = hrToken) {
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
    const res = await tolak(employeeToken);

    expect(res.status).toBe(403);
    expect(leaveRequestModel.rejectRequest).not.toHaveBeenCalled();
  });

  it("mencatat pengembalian saldo bernilai positif", async () => {
    await tolak();

    const refunds = transaksiBertipe("refund");

    expect(refunds).toHaveLength(1);
    expect(refunds[0]!.amount).toBe(TOTAL_HARI);
    expect(refunds[0]!.leave_request_id).toBe(REQUEST_ID);
  });

  it("meneruskan catatan keputusan ke model", async () => {
    await tolak();

    const [, , , catatan] = (leaveRequestModel.rejectRequest as jest.Mock).mock
      .calls[0] as [unknown, string, string, string | null];

    expect(catatan).toBe("Kebutuhan tim sedang tinggi");
  });

  it("menjalankan ROLLBACK saat pencatatan pengembalian gagal", async () => {
    (balanceModel.createTransaction as jest.Mock).mockRejectedValue(
      new Error("ledger gagal") as never,
    );

    const res = await tolak();

    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    expect(res.status).toBe(500);
  });

  it("menolak pengajuan yang tidak berstatus pending", async () => {
    (leaveRequestModel.findById as jest.Mock).mockResolvedValue(
      fakeRequest({ status: "approved" }) as never,
    );

    const res = await tolak();

    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/v1/leave-requests/:id/cancel", () => {
  function batalkan(token = employeeToken) {
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
    const res = await batalkan();

    expect(res.status).toBe(200);
  });

  it("menolak pembatalan oleh orang lain", async () => {
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue({
      ...fakeEmployee,
      id: LAIN_ID,
    } as never);

    const res = await batalkan();

    expect(res.status).toBe(403);
    expect(res.body.message).toContain("membatalkan pengajuan cuti sendiri");
    expect(leaveRequestModel.cancelRequest).not.toHaveBeenCalled();
  });

  it("menolak pembatalan oleh HR sekalipun", async () => {
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue({
      ...fakeEmployee,
      id: MANAGER_ID,
    } as never);

    const res = await batalkan(hrToken);

    expect(res.status).toBe(403);
  });

  it("mencatat pengembalian saldo", async () => {
    await batalkan();

    const refunds = transaksiBertipe("refund");

    expect(refunds).toHaveLength(1);
    expect(refunds[0]!.amount).toBe(TOTAL_HARI);
  });

  it("mengizinkan pembatalan pengajuan yang sudah disetujui", async () => {
    (leaveRequestModel.findById as jest.Mock).mockResolvedValue(
      fakeRequest({ status: "approved" }) as never,
    );

    const res = await batalkan();

    expect(res.status).toBe(200);
  });

  it("menolak pembatalan cuti disetujui yang sudah berjalan", async () => {
    const kemarin = toIsoDate(new Date(Date.now() - 24 * 60 * 60 * 1000));

    (leaveRequestModel.findById as jest.Mock).mockResolvedValue(
      fakeRequest({ status: "approved", start_date: kemarin }) as never,
    );

    const res = await batalkan();

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("sudah berjalan tidak dapat dibatalkan");
  });

  it("menolak pembatalan pengajuan yang sudah ditolak", async () => {
    (leaveRequestModel.findById as jest.Mock).mockResolvedValue(
      fakeRequest({ status: "rejected" }) as never,
    );

    const res = await batalkan();

    expect(res.status).toBe(400);
  });

  it("menjalankan ROLLBACK saat pencatatan gagal", async () => {
    (balanceModel.createTransaction as jest.Mock).mockRejectedValue(
      new Error("ledger gagal") as never,
    );

    const res = await batalkan();

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

  it("HR ikut melihat pengajuan yang belum punya penyetuju", async () => {
    await request(app)
      .get("/api/v1/leave-requests/approvals")
      .set("Authorization", `Bearer ${hrToken}`);

    const [params] = (leaveRequestModel.listRequests as jest.Mock).mock
      .calls[0] as [{ include_unassigned: boolean }];

    expect(params.include_unassigned).toBe(true);
  });

  it("daftar seluruh pengajuan hanya untuk HR dan admin", async () => {
    const res = await request(app)
      .get("/api/v1/leave-requests")
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
  });

  it("memakai bentuk meta paginasi yang sama dengan daftar karyawan", async () => {
    const res = await request(app)
      .get("/api/v1/leave-requests")
      .set("Authorization", `Bearer ${hrToken}`);

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
      .set("Authorization", `Bearer ${hrToken}`);

    const [params] = (leaveRequestModel.listRequests as jest.Mock).mock
      .calls[0] as [{ status: string; limit: number }];

    expect(params.status).toBe("pending");
    expect(params.limit).toBe(5);
  });

  it("menolak status di luar pilihan", async () => {
    const res = await request(app)
      .get("/api/v1/leave-requests")
      .query({ status: "entahlah" })
      .set("Authorization", `Bearer ${hrToken}`);

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
      fakeRequest({ employee_id: LAIN_ID, approver_id: LAIN_ID }) as never,
    );

    const res = await request(app)
      .get(`/api/v1/leave-requests/${REQUEST_ID}`)
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
  });

  it("detail dapat dilihat HR", async () => {
    (leaveRequestModel.findDetailById as jest.Mock).mockResolvedValue(
      fakeRequest({ employee_id: LAIN_ID, approver_id: LAIN_ID }) as never,
    );

    const res = await request(app)
      .get(`/api/v1/leave-requests/${REQUEST_ID}`)
      .set("Authorization", `Bearer ${hrToken}`);

    expect(res.status).toBe(200);
  });
});
