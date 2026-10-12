import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import request from "supertest";

// Batas karyawan yang boleh cuti bersamaan dalam satu departemen.
// Permintaan pembimbing: jangan sampai semua karyawan satu divisi cuti di
// tanggal yang sama

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

jest.unstable_mockModule("../../src/models/department.js", () => ({
  findAll: jest.fn(),
  findById: jest.fn(),
  findByCode: jest.fn(),
  findByName: jest.fn(),
  createDepartment: jest.fn(),
  updateDepartment: jest.fn(),
  softDeleteDepartment: jest.fn(),
  countEmployees: jest.fn(),
  lockForLeaveApproval: jest.fn(),
}));

jest.unstable_mockModule("../../src/models/holiday.js", () => ({
  findDatesBetween: jest.fn(),
}));

jest.unstable_mockModule("../../src/models/feature.js", () => ({
  findCodesByPosition: jest.fn(),
  findAllCodes: jest.fn(() => Promise.resolve([])),
  findUserIdsWithFeature: jest.fn(() => Promise.resolve([])),
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
  countApprovedLeaveByDate: jest.fn(),
}));

jest.unstable_mockModule("../../src/models/leaveBalance.js", () => ({
  createTransaction: jest.fn(),
  balanceFor: jest.fn(),
  lockEmployeeBalance: jest.fn(),
  convertHoldToDeduction: jest.fn(),
  summaryFor: jest.fn(),
  listLedger: jest.fn(),
  findByRequest: jest.fn(),
  hasMissingAccruals: jest.fn(() => Promise.resolve(false)),
  grantAccruals: jest.fn(() => Promise.resolve(0)),
}));

jest.unstable_mockModule("../../src/models/leaveAttachment.js", () => ({
  findByRequest: jest.fn(),
  countByRequest: jest.fn(),
  findById: jest.fn(),
  createAttachment: jest.fn(),
  deleteByRequest: jest.fn(() => Promise.resolve([])),
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
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const userModel = await import("../../src/models/user.js");
const employeeModel = await import("../../src/models/employee.js");
const departmentModel = await import("../../src/models/department.js");
const holidayModel = await import("../../src/models/holiday.js");
const leaveTypeModel = await import("../../src/models/leaveType.js");
const leaveRequestModel = await import("../../src/models/leaveRequest.js");
const balanceModel = await import("../../src/models/leaveBalance.js");
const attachmentModel = await import("../../src/models/leaveAttachment.js");
const workScheduleModel = await import("../../src/models/workSchedule.js");
const featureModel = await import("../../src/models/feature.js");
const { logger } = await import("../../src/config/logger.js");
const { invalidateFeatureCache } =
  await import("../../src/helpers/featureCache.js");
const { createToken } = await import("../../src/helpers/jwt.js");
const { toIsoDate } = await import("../../src/helpers/workdays.js");
const { app } = await import("../../src/app.js");

const USER_ID = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";
const OWNER_ID = "33333333-3333-4333-8333-333333333333";
const LEAVE_TYPE_ID = "44444444-4444-4444-8444-444444444444";
const REQUEST_ID = "55555555-5555-4555-8555-555555555555";
const DEPARTMENT_ID = "99999999-9999-4999-8999-999999999999";
const OTHER_DEPARTMENT_ID = "88888888-8888-4888-8888-888888888888";

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

function futureMonday(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 40);
  while (date.getUTCDay() !== 1) date.setUTCDate(date.getUTCDate() + 1);
  return toIsoDate(date);
}

function shiftDays(from: string, day: number): string {
  const date = new Date(`${from}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + day);
  return toIsoDate(date);
}

const MONDAY = futureMonday();
const TUESDAY = shiftDays(MONDAY, 1);
const WEDNESDAY = shiftDays(MONDAY, 2);

const fakeEmployee = {
  id: EMPLOYEE_ID,
  user_id: USER_ID,
  position_id: "77777777-7777-4777-8777-777777777777",
  department_id: DEPARTMENT_ID,
  full_name: "Citra Lestari",
  gender: "female",
  manager_id: null,
  is_active: true,
};

const fakeDepartment = {
  id: DEPARTMENT_ID,
  code: "ENG",
  name: "Engineering",
  is_active: true,
  max_concurrent_leave: 2,
};

const annualLeave = {
  id: LEAVE_TYPE_ID,
  code: "ANNUAL",
  name: "Cuti Tahunan",
  default_quota: 12,
  deducts_balance: false,
  is_paid: true,
  requires_attachment: false,
  attachment_required_after: null,
  max_days_per_request: null,
  min_notice_days: 0,
  gender_restriction: null,
  exempt_from_staffing_limit: false,
  is_active: true,
};

function fakeRequest(override: Record<string, unknown> = {}) {
  return {
    id: REQUEST_ID,
    employee_id: OWNER_ID,
    leave_type_id: LEAVE_TYPE_ID,
    start_date: MONDAY,
    end_date: WEDNESDAY,
    total_days: 3,
    reason: "Liburan",
    status: "pending",
    approver_id: EMPLOYEE_ID,
    ...override,
  };
}

// Rekan yang cutinya sudah disetujui per tanggal
function colleaguesOnLeave(entries: Record<string, number>) {
  (leaveRequestModel.countApprovedLeaveByDate as jest.Mock).mockResolvedValue(
    new Map(Object.entries(entries)) as never,
  );
}

function grantFeatures(codes: string[]) {
  (featureModel.findCodesByPosition as jest.Mock).mockResolvedValue(
    codes as never,
  );
  invalidateFeatureCache();
}

beforeEach(() => {
  jest.clearAllMocks();
  grantFeatures(["leave.approve_team"]);
  mockClient.query.mockResolvedValue({ rows: [] } as never);
  (userModel.findSessionInfo as jest.Mock).mockResolvedValue(null as never);
  (employeeModel.findByUserId as jest.Mock).mockResolvedValue(
    fakeEmployee as never,
  );
  (employeeModel.findById as jest.Mock).mockResolvedValue({
    ...fakeEmployee,
    id: OWNER_ID,
  } as never);
  (departmentModel.findById as jest.Mock).mockResolvedValue(
    fakeDepartment as never,
  );
  (holidayModel.findDatesBetween as jest.Mock).mockResolvedValue([] as never);
  (leaveTypeModel.findById as jest.Mock).mockResolvedValue(
    annualLeave as never,
  );
  (leaveRequestModel.findOverlapping as jest.Mock).mockResolvedValue(
    null as never,
  );
  (leaveRequestModel.createRequest as jest.Mock).mockResolvedValue(
    fakeRequest({ employee_id: EMPLOYEE_ID }) as never,
  );
  (leaveRequestModel.findById as jest.Mock).mockResolvedValue(
    fakeRequest() as never,
  );
  (leaveRequestModel.approveRequest as jest.Mock).mockResolvedValue(
    fakeRequest({ status: "approved" }) as never,
  );
  (attachmentModel.countByRequest as jest.Mock).mockResolvedValue(0 as never);
  (balanceModel.balanceFor as jest.Mock).mockResolvedValue(12 as never);
  (workScheduleModel.resolveForEmployee as jest.Mock).mockResolvedValue({
    id: "jadwal",
  } as never);
  (workScheduleModel.workingDatesInRange as jest.Mock).mockReturnValue([
    MONDAY,
    TUESDAY,
    WEDNESDAY,
  ] as never);
  colleaguesOnLeave({});
});

function submit() {
  return request(app)
    .post("/api/v1/leave-requests")
    .set("Authorization", `Bearer ${employeeToken}`)
    .send({
      leave_type_id: LEAVE_TYPE_ID,
      start_date: MONDAY,
      end_date: WEDNESDAY,
    });
}

function approve(token: string, body: Record<string, unknown> = {}) {
  return request(app)
    .patch(`/api/v1/leave-requests/${REQUEST_ID}/approve`)
    .set("Authorization", `Bearer ${token}`)
    .send(body);
}

function lastActivity() {
  const calls = (logger.debug as jest.Mock).mock.calls
    .map(
      ([payload]) =>
        (
          payload as {
            activity?: {
              action: string;
              summary: string;
              metadata: Record<string, unknown>;
            };
          }
        ).activity,
    )
    .filter((entry) => entry?.action === "leave.approve");
  return calls.at(-1)!;
}

describe("mengajukan cuti", () => {
  it("diterima bila belum ada hari yang penuh", async () => {
    colleaguesOnLeave({ [MONDAY]: 1 });

    const res = await submit();

    expect(res.status).toBe(201);
  });

  it("ditolak 409 bila ada hari yang sudah penuh", async () => {
    colleaguesOnLeave({ [TUESDAY]: 2 });

    const res = await submit();

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("STAFFING_LIMIT_REACHED");
    expect(res.body.details.full_dates).toEqual([
      { date: TUESDAY, on_leave: 2 },
    ]);
    expect(res.body.details.max_concurrent_leave).toBe(2);
    expect(res.body.details.can_override).toBe(false);
    expect(leaveRequestModel.createRequest).not.toHaveBeenCalled();
  });

  it("yang dihitung hanya hari kerja pemohon dan rekan, bukan pemohon sendiri", async () => {
    await submit();

    expect(leaveRequestModel.countApprovedLeaveByDate).toHaveBeenCalledWith(
      DEPARTMENT_ID,
      EMPLOYEE_ID,
      [MONDAY, TUESDAY, WEDNESDAY],
      undefined,
    );
  });

  it("jenis cuti yang dikecualikan tidak diperiksa", async () => {
    (leaveTypeModel.findById as jest.Mock).mockResolvedValue({
      ...annualLeave,
      exempt_from_staffing_limit: true,
    } as never);
    colleaguesOnLeave({ [MONDAY]: 5 });

    const res = await submit();

    expect(res.status).toBe(201);
    expect(leaveRequestModel.countApprovedLeaveByDate).not.toHaveBeenCalled();
  });

  it("departemen tanpa batas tidak diperiksa", async () => {
    (departmentModel.findById as jest.Mock).mockResolvedValue({
      ...fakeDepartment,
      max_concurrent_leave: null,
    } as never);

    const res = await submit();

    expect(res.status).toBe(201);
    expect(leaveRequestModel.countApprovedLeaveByDate).not.toHaveBeenCalled();
  });

  it("karyawan tanpa departemen tidak diperiksa", async () => {
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue({
      ...fakeEmployee,
      department_id: null,
    } as never);

    const res = await submit();

    expect(res.status).toBe(201);
    expect(departmentModel.findById).not.toHaveBeenCalled();
  });

  it("tanpa jadwal kerja, akhir pekan dan hari libur tidak ikut diperiksa", async () => {
    (workScheduleModel.resolveForEmployee as jest.Mock).mockResolvedValue(
      null as never,
    );
    (holidayModel.findDatesBetween as jest.Mock).mockResolvedValue([
      TUESDAY,
    ] as never);

    await request(app)
      .post("/api/v1/leave-requests")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({
        leave_type_id: LEAVE_TYPE_ID,
        start_date: MONDAY,
        end_date: shiftDays(MONDAY, 6),
      });

    const [, , dates] = (
      leaveRequestModel.countApprovedLeaveByDate as jest.Mock
    ).mock.calls[0] as [string, string, string[]];

    expect(dates).toEqual([
      MONDAY,
      WEDNESDAY,
      shiftDays(MONDAY, 3),
      shiftDays(MONDAY, 4),
    ]);
  });
});

describe("menyetujui cuti", () => {
  it("disetujui bila tidak ada hari yang penuh", async () => {
    const res = await approve(employeeToken);

    expect(res.status).toBe(200);
    expect(leaveRequestModel.approveRequest).toHaveBeenCalled();
  });

  it("mengunci departemen dan menghitung ulang di dalam transaksi", async () => {
    const order: string[] = [];
    (departmentModel.lockForLeaveApproval as jest.Mock).mockImplementation(
      async () => {
        order.push("lock");
      },
    );
    (
      leaveRequestModel.countApprovedLeaveByDate as jest.Mock
    ).mockImplementation(async () => {
      order.push("count");
      return new Map();
    });
    (leaveRequestModel.approveRequest as jest.Mock).mockImplementation(
      async () => {
        order.push("approve");
        return fakeRequest({ status: "approved" });
      },
    );

    await approve(employeeToken);

    expect(order).toEqual(["lock", "count", "approve"]);
    expect(departmentModel.lockForLeaveApproval).toHaveBeenCalledWith(
      mockClient,
      DEPARTMENT_ID,
    );

    const [, ownerId, , db] = (
      leaveRequestModel.countApprovedLeaveByDate as jest.Mock
    ).mock.calls[0] as [string, string, string[], unknown];

    // yang dikecualikan adalah pemilik pengajuan, bukan penyetujunya
    expect(ownerId).toBe(OWNER_ID);
    expect(db).toBe(mockClient);
  });

  it("ditolak 409 bila sudah penuh, dan transaksinya dibatalkan", async () => {
    colleaguesOnLeave({ [WEDNESDAY]: 2 });

    const res = await approve(employeeToken);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("STAFFING_LIMIT_REACHED");
    expect(res.body.details.can_override).toBe(false);
    expect(leaveRequestModel.approveRequest).not.toHaveBeenCalled();
    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("atasan tanpa leave.approve_all tidak bisa memaksa setuju", async () => {
    colleaguesOnLeave({ [WEDNESDAY]: 2 });

    const res = await approve(employeeToken, {
      override_staffing_limit: true,
      decision_note: "Proyek darurat sudah selesai",
    });

    expect(res.status).toBe(409);
    expect(leaveRequestModel.approveRequest).not.toHaveBeenCalled();
  });

  it("pemegang leave.approve_all diberi tahu bahwa ia boleh memaksa setuju", async () => {
    colleaguesOnLeave({ [WEDNESDAY]: 2 });

    const res = await approve(adminToken);

    expect(res.status).toBe(409);
    expect(res.body.details.can_override).toBe(true);
  });

  it("memaksa setuju wajib menyertakan alasan yang cukup", async () => {
    colleaguesOnLeave({ [WEDNESDAY]: 2 });

    const res = await approve(adminToken, {
      override_staffing_limit: true,
      decision_note: "ok",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("decision_note");
    expect(leaveRequestModel.approveRequest).not.toHaveBeenCalled();
  });

  it("pemegang leave.approve_all dapat memaksa setuju dengan alasan, dan tercatat", async () => {
    colleaguesOnLeave({ [WEDNESDAY]: 2 });

    const res = await approve(adminToken, {
      override_staffing_limit: true,
      decision_note: "Klien meminta tim tetap libur bersama",
    });

    expect(res.status).toBe(200);
    expect(leaveRequestModel.approveRequest).toHaveBeenCalled();

    const entry = lastActivity();

    expect(entry.summary).toContain("above the department staffing limit");
    expect(entry.metadata.staffing_override).toEqual({
      department_id: DEPARTMENT_ID,
      max_concurrent_leave: 2,
      full_dates: [{ date: WEDNESDAY, on_leave: 2 }],
      reason: "Klien meminta tim tetap libur bersama",
    });
  });

  it("cuti yang dikecualikan tidak dikunci maupun diperiksa", async () => {
    (leaveTypeModel.findById as jest.Mock).mockResolvedValue({
      ...annualLeave,
      exempt_from_staffing_limit: true,
    } as never);
    colleaguesOnLeave({ [MONDAY]: 9 });

    const res = await approve(employeeToken);

    expect(res.status).toBe(200);
    expect(departmentModel.lockForLeaveApproval).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/leave-requests/department-calendar", () => {
  function calendar(query: Record<string, string>, token = employeeToken) {
    return request(app)
      .get("/api/v1/leave-requests/department-calendar")
      .query(query)
      .set("Authorization", `Bearer ${token}`);
  }

  it("menandai tanggal yang penuh di departemen sendiri", async () => {
    colleaguesOnLeave({ [TUESDAY]: 2, [WEDNESDAY]: 1 });

    const res = await calendar({ start_date: MONDAY, end_date: WEDNESDAY });

    expect(res.status).toBe(200);
    expect(res.body.data.department).toEqual({
      id: DEPARTMENT_ID,
      name: "Engineering",
      max_concurrent_leave: 2,
    });
    expect(res.body.data.days).toEqual([
      { date: MONDAY, on_leave: 0, is_full: false },
      { date: TUESDAY, on_leave: 2, is_full: true },
      { date: WEDNESDAY, on_leave: 1, is_full: false },
    ]);
  });

  it("hanya berisi jumlah, tanpa nama rekan", async () => {
    colleaguesOnLeave({ [TUESDAY]: 1 });

    const res = await calendar({ start_date: MONDAY, end_date: WEDNESDAY });

    expect(Object.keys(res.body.data.days[0]).sort()).toEqual([
      "date",
      "is_full",
      "on_leave",
    ]);
  });

  it("departemen tanpa batas tidak pernah penuh", async () => {
    (departmentModel.findById as jest.Mock).mockResolvedValue({
      ...fakeDepartment,
      max_concurrent_leave: null,
    } as never);
    colleaguesOnLeave({ [MONDAY]: 7 });

    const res = await calendar({ start_date: MONDAY, end_date: MONDAY });

    expect(res.body.data.days[0]).toEqual({
      date: MONDAY,
      on_leave: 7,
      is_full: false,
    });
  });

  it("karyawan tanpa departemen mendapat kalender kosong", async () => {
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue({
      ...fakeEmployee,
      department_id: null,
    } as never);

    const res = await calendar({ start_date: MONDAY, end_date: WEDNESDAY });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ department: null, days: [] });
  });

  it("menolak melihat departemen lain tanpa leave.view_all", async () => {
    const res = await calendar({
      start_date: MONDAY,
      end_date: WEDNESDAY,
      department_id: OTHER_DEPARTMENT_ID,
    });

    expect(res.status).toBe(403);
  });

  it("pemegang leave.view_all boleh melihat departemen lain", async () => {
    const res = await calendar(
      {
        start_date: MONDAY,
        end_date: WEDNESDAY,
        department_id: OTHER_DEPARTMENT_ID,
      },
      adminToken,
    );

    expect(res.status).toBe(200);
    expect(departmentModel.findById).toHaveBeenCalledWith(OTHER_DEPARTMENT_ID);
  });

  it("menolak rentang lebih dari 62 hari", async () => {
    const res = await calendar({
      start_date: MONDAY,
      end_date: shiftDays(MONDAY, 62),
    });

    expect(res.status).toBe(400);
  });

  it("menolak tanggal akhir sebelum tanggal mulai", async () => {
    const res = await calendar({ start_date: WEDNESDAY, end_date: MONDAY });

    expect(res.status).toBe(400);
  });

  it("tidak tertukar dengan detail pengajuan /leave-requests/:id", async () => {
    const res = await calendar({ start_date: MONDAY, end_date: MONDAY });

    expect(res.status).toBe(200);
    expect(leaveRequestModel.findDetailById).not.toHaveBeenCalled();
  });
});
