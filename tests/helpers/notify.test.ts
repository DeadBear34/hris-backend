import { jest, describe, it, expect, beforeEach } from "@jest/globals";

jest.unstable_mockModule("../../src/config/logger.js", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.unstable_mockModule("../../src/models/notification.js", () => ({
  insertMany: jest.fn(() => Promise.resolve([])),
  deletePending: jest.fn(() => Promise.resolve(0)),
}));

jest.unstable_mockModule("../../src/models/feature.js", () => ({
  findUserIdsWithFeature: jest.fn(() => Promise.resolve([])),
}));

jest.unstable_mockModule("../../src/models/employee.js", () => ({
  findById: jest.fn(),
}));

const notificationModel = await import("../../src/models/notification.js");
const featureModel = await import("../../src/models/feature.js");
const employeeModel = await import("../../src/models/employee.js");
const { logger } = await import("../../src/config/logger.js");
const { notifyLeaveSubmitted, notifyLeaveDecided, notifyAccountNeedsApproval } =
  await import("../../src/helpers/notify.js");

const MANAGER_EMPLOYEE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MANAGER_USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REQUESTER_EMPLOYEE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const REQUESTER_USER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const REQUEST_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

// insertMany dipanggil tanpa await, jadi perlu ditunggu satu putaran
const settle = () => new Promise((done) => setTimeout(done, 0));

const submitted = {
  request_id: REQUEST_ID,
  requester_name: "Yusuf Ramadhan",
  approver_employee_id: MANAGER_EMPLOYEE,
  leave_type_name: "Cuti Duka",
  start_date: "2027-07-12",
  end_date: "2027-07-12",
  total_days: 1,
};

function firstBatch() {
  return (notificationModel.insertMany as jest.Mock).mock.calls[0]?.[0] as
    { recipient_user_id: string; type: string; message: string }[] | undefined;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("notifikasi pengajuan cuti", () => {
  it("dikirim ke atasan langsung", async () => {
    (employeeModel.findById as jest.Mock).mockResolvedValue({
      id: MANAGER_EMPLOYEE,
      user_id: MANAGER_USER,
    } as never);

    await notifyLeaveSubmitted(submitted);
    await settle();

    const rows = firstBatch()!;

    expect(rows).toHaveLength(1);
    expect(rows[0]!.recipient_user_id).toBe(MANAGER_USER);
    expect(rows[0]!.type).toBe("leave_approval_needed");
  });

  it("jatuh ke pemegang leave.approve_all kalau karyawan belum punya atasan", async () => {
    (featureModel.findUserIdsWithFeature as jest.Mock).mockResolvedValue([
      "u1",
      "u2",
    ] as never);

    await notifyLeaveSubmitted({ ...submitted, approver_employee_id: null });
    await settle();

    expect(featureModel.findUserIdsWithFeature).toHaveBeenCalledWith(
      "leave.approve_all",
    );
    expect(firstBatch()).toHaveLength(2);
  });

  it("juga jatuh ke penyetuju umum kalau atasan tidak punya akun", async () => {
    (employeeModel.findById as jest.Mock).mockResolvedValue({
      id: MANAGER_EMPLOYEE,
      user_id: null,
    } as never);
    (featureModel.findUserIdsWithFeature as jest.Mock).mockResolvedValue([
      "u1",
    ] as never);

    await notifyLeaveSubmitted(submitted);
    await settle();

    expect(firstBatch()).toHaveLength(1);
  });

  it("menyebut nama pemohon, jenis cuti, dan tanggalnya", async () => {
    (employeeModel.findById as jest.Mock).mockResolvedValue({
      user_id: MANAGER_USER,
    } as never);

    await notifyLeaveSubmitted(submitted);
    await settle();

    expect(firstBatch()![0]!.message).toBe(
      "Yusuf Ramadhan mengajukan Cuti Duka 1 hari pada 2027-07-12",
    );
  });

  it("menulis rentang tanggal kalau lebih dari sehari", async () => {
    (employeeModel.findById as jest.Mock).mockResolvedValue({
      user_id: MANAGER_USER,
    } as never);

    await notifyLeaveSubmitted({
      ...submitted,
      end_date: "2027-07-14",
      total_days: 3,
    });
    await settle();

    expect(firstBatch()![0]!.message).toContain("2027-07-12 sampai 2027-07-14");
  });

  it("tidak melempar walau pencarian penerima gagal", async () => {
    (employeeModel.findById as jest.Mock).mockRejectedValue(
      new Error("database mati") as never,
    );

    await expect(notifyLeaveSubmitted(submitted)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });
});

describe("notifikasi keputusan cuti", () => {
  const decided = {
    request_id: REQUEST_ID,
    requester_employee_id: REQUESTER_EMPLOYEE,
    decision: "approved" as const,
    leave_type_name: "Cuti Duka",
    start_date: "2027-07-12",
    end_date: "2027-07-12",
  };

  it("menghapus antrean persetujuan milik atasan", async () => {
    (employeeModel.findById as jest.Mock).mockResolvedValue({
      user_id: REQUESTER_USER,
    } as never);

    await notifyLeaveDecided(decided);
    await settle();

    expect(notificationModel.deletePending).toHaveBeenCalledWith(
      "leave_approval_needed",
      REQUEST_ID,
    );
  });

  it("memberi tahu pemohon bahwa cutinya disetujui", async () => {
    (employeeModel.findById as jest.Mock).mockResolvedValue({
      user_id: REQUESTER_USER,
    } as never);

    await notifyLeaveDecided(decided);
    await settle();

    const rows = firstBatch()!;

    expect(rows[0]!.recipient_user_id).toBe(REQUESTER_USER);
    expect(rows[0]!.type).toBe("leave_status_changed");
    expect(rows[0]!.message).toContain("disetujui");
  });

  it("menyertakan catatan penolakan kalau ada", async () => {
    (employeeModel.findById as jest.Mock).mockResolvedValue({
      user_id: REQUESTER_USER,
    } as never);

    await notifyLeaveDecided({
      ...decided,
      decision: "rejected",
      decision_note: "Sedang musim tutup buku",
    });
    await settle();

    expect(firstBatch()![0]!.message).toContain(
      "Catatan: Sedang musim tutup buku",
    );
  });

  it("tidak menyimpan apa pun kalau pemohon tidak punya akun", async () => {
    (employeeModel.findById as jest.Mock).mockResolvedValue({
      user_id: null,
    } as never);

    await notifyLeaveDecided(decided);
    await settle();

    expect(notificationModel.insertMany).not.toHaveBeenCalled();
  });
});

describe("notifikasi pendaftaran akun", () => {
  const registered = {
    user_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    full_name: "Uji Notifikasi",
    email: "uji@awan.io",
  };

  it("dikirim ke semua pemegang employee.approve_user", async () => {
    (featureModel.findUserIdsWithFeature as jest.Mock).mockResolvedValue([
      "a1",
      "a2",
      "a3",
    ] as never);

    await notifyAccountNeedsApproval(registered);
    await settle();

    expect(featureModel.findUserIdsWithFeature).toHaveBeenCalledWith(
      "employee.approve_user",
    );

    const rows = firstBatch()!;

    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.type === "account_approval_needed")).toBe(true);
  });

  it("menyebut nama dan email pendaftar", async () => {
    (featureModel.findUserIdsWithFeature as jest.Mock).mockResolvedValue([
      "a1",
    ] as never);

    await notifyAccountNeedsApproval(registered);
    await settle();

    expect(firstBatch()![0]!.message).toBe(
      "Uji Notifikasi (uji@awan.io) mendaftar dan menunggu persetujuan",
    );
  });

  it("tidak menyimpan apa pun kalau tidak ada penyetuju", async () => {
    (featureModel.findUserIdsWithFeature as jest.Mock).mockResolvedValue(
      [] as never,
    );

    await notifyAccountNeedsApproval(registered);
    await settle();

    expect(notificationModel.insertMany).not.toHaveBeenCalled();
  });
});
