import { jest, describe, it, expect, beforeEach } from "@jest/globals";

jest.unstable_mockModule("../../src/models/leaveRequest.js", () => ({
  findPendingForRouting: jest.fn(),
  reassignApprover: jest.fn(() => Promise.resolve(true)),
}));

jest.unstable_mockModule("../../src/models/orgStructure.js", () => ({
  findLineManager: jest.fn(),
}));

jest.unstable_mockModule("../../src/helpers/notify.js", () => ({
  notifyApproverReassigned: jest.fn(() => Promise.resolve()),
}));

jest.unstable_mockModule("../../src/config/logger.js", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const leaveRequestModel = await import("../../src/models/leaveRequest.js");
const { findLineManager } = await import("../../src/models/orgStructure.js");
const { notifyApproverReassigned } =
  await import("../../src/helpers/notify.js");
const { logger } = await import("../../src/config/logger.js");
const { reroutePendingApprovals, rerouteSafely } =
  await import("../../src/helpers/approvalRouting.js");

const OLD_MANAGER = "e1000000-0000-4000-8000-000000000000";
const NEW_MANAGER = "e2000000-0000-4000-8000-000000000000";

function pending(id: string, approver_id: string | null) {
  return {
    id,
    employee_id: `emp-${id}`,
    employee_name: `Karyawan ${id}`,
    leave_type_name: "Cuti Tahunan",
    start_date: "2026-11-02",
    end_date: "2026-11-03",
    total_days: 2,
    approver_id,
  };
}

function manager(employee_id: string) {
  return {
    employee_id,
    user_id: "u",
    full_name: "Atasan",
    source: "structure",
  };
}

function givenPending(...rows: ReturnType<typeof pending>[]) {
  (leaveRequestModel.findPendingForRouting as jest.Mock).mockResolvedValue(
    rows as never,
  );
}

function givenManager(employee_id: string | null) {
  (findLineManager as jest.Mock).mockResolvedValue(
    (employee_id ? manager(employee_id) : null) as never,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  // clearAllMocks tidak mengembalikan nilai bawaan, jadi diatur ulang di sini
  (leaveRequestModel.reassignApprover as jest.Mock).mockResolvedValue(
    true as never,
  );
});

describe("reroutePendingApprovals", () => {
  it("tidak mengubah apa pun bila atasannya masih sama", async () => {
    givenPending(pending("r1", OLD_MANAGER));
    givenManager(OLD_MANAGER);

    expect(await reroutePendingApprovals()).toEqual([]);
    expect(leaveRequestModel.reassignApprover).not.toHaveBeenCalled();
    expect(notifyApproverReassigned).not.toHaveBeenCalled();
  });

  it("mengalihkan ke atasan baru dan memberi tahu", async () => {
    givenPending(pending("r1", OLD_MANAGER));
    givenManager(NEW_MANAGER);

    const result = await reroutePendingApprovals();

    expect(leaveRequestModel.reassignApprover).toHaveBeenCalledWith(
      "r1",
      OLD_MANAGER,
      NEW_MANAGER,
    );
    expect(result).toEqual([
      {
        request_id: "r1",
        employee_id: "emp-r1",
        from_approver_id: OLD_MANAGER,
        to_approver_id: NEW_MANAGER,
      },
    ]);
    expect(notifyApproverReassigned).toHaveBeenCalledWith(
      expect.objectContaining({
        request_id: "r1",
        from_employee_id: OLD_MANAGER,
        to_employee_id: NEW_MANAGER,
      }),
    );
    expect(logger.info).toHaveBeenCalled();
  });

  it("pengajuan yang tadinya tanpa atasan kini mendapat atasan", async () => {
    givenPending(pending("r1", null));
    givenManager(NEW_MANAGER);

    const [moved] = await reroutePendingApprovals();

    expect(moved).toMatchObject({
      from_approver_id: null,
      to_approver_id: NEW_MANAGER,
    });
  });

  it("atasan yang hilang membuat pengajuan jatuh ke pemegang approve_all", async () => {
    givenPending(pending("r1", OLD_MANAGER));
    givenManager(null);

    const [moved] = await reroutePendingApprovals();

    expect(leaveRequestModel.reassignApprover).toHaveBeenCalledWith(
      "r1",
      OLD_MANAGER,
      null,
    );
    expect(moved?.to_approver_id).toBeNull();
  });

  it("melewati pengajuan yang keburu diputus atau dialihkan proses lain", async () => {
    givenPending(pending("r1", OLD_MANAGER), pending("r2", OLD_MANAGER));
    givenManager(NEW_MANAGER);
    (leaveRequestModel.reassignApprover as jest.Mock)
      .mockResolvedValueOnce(false as never)
      .mockResolvedValueOnce(true as never);

    const result = await reroutePendingApprovals();

    expect(result.map((r) => r.request_id)).toEqual(["r2"]);
    expect(notifyApproverReassigned).toHaveBeenCalledTimes(1);
  });

  it("tanpa pengajuan menunggu tidak mencatat log", async () => {
    givenPending();

    expect(await reroutePendingApprovals()).toEqual([]);
    expect(logger.info).not.toHaveBeenCalled();
  });
});

describe("rerouteSafely", () => {
  it("kegagalan pengalihan tidak dilempar ke pemanggil", async () => {
    (leaveRequestModel.findPendingForRouting as jest.Mock).mockRejectedValue(
      new Error("db down") as never,
    );

    await expect(rerouteSafely()).resolves.toEqual([]);
    expect(logger.error).toHaveBeenCalled();
  });

  it("meneruskan hasil pengalihan bila berhasil", async () => {
    givenPending(pending("r1", OLD_MANAGER));
    givenManager(NEW_MANAGER);

    expect(await rerouteSafely()).toHaveLength(1);
  });
});
