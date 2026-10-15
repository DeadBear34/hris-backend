import { jest, describe, it, expect, beforeEach } from "@jest/globals";

jest.unstable_mockModule("../../src/config/logger.js", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.unstable_mockModule("../../src/models/notification.js", () => ({
  insertMany: jest.fn(() => Promise.resolve([])),
  deletePending: jest.fn(() => Promise.resolve([])),
}));

jest.unstable_mockModule("../../src/realtime/dispatcher.js", () => ({
  dispatch: jest.fn(),
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
const dispatcher = await import("../../src/realtime/dispatcher.js");
const { logger } = await import("../../src/config/logger.js");
const {
  notifyLeaveSubmitted,
  notifyLeaveDecided,
  notifyAccountNeedsApproval,
  clearLeaveApproval,
  clearAccountApproval,
} = await import("../../src/helpers/notify.js");

const MANAGER_EMPLOYEE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MANAGER_USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REQUESTER_EMPLOYEE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const REQUESTER_USER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const REQUEST_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

// insertMany dipanggil tanpa await, jadi perlu ditunggu satu putaran
const settle = () => new Promise((done) => setTimeout(done, 0));

const HR_USER = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const ADMIN_USER = "99999999-9999-4999-8999-999999999999";

const submitted = {
  request_id: REQUEST_ID,
  requester_employee_id: REQUESTER_EMPLOYEE,
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

// Keadaan pengguna untuk tes pengajuan cuti
function givenApprovers({
  approveAll = [] as string[],
  approveTeam = [] as string[],
  viewAll = [] as string[],
  managerUser = MANAGER_USER as string | null,
} = {}) {
  (featureModel.findUserIdsWithFeature as jest.Mock).mockImplementation(
    async (code: unknown) => {
      if (code === "leave.approve_all") return approveAll;
      if (code === "leave.approve_team") return approveTeam;
      if (code === "leave.view_all") return viewAll;
      return [];
    },
  );
  (employeeModel.findById as jest.Mock).mockImplementation(
    async (id: unknown) =>
      ({
        id,
        user_id:
          id === MANAGER_EMPLOYEE
            ? managerUser
            : id === REQUESTER_EMPLOYEE
              ? REQUESTER_USER
              : null,
      }) as never,
  );
}

function recipients(): string[] {
  return (firstBatch() ?? []).map((row) => row.recipient_user_id).sort();
}

describe("notifikasi pengajuan cuti", () => {
  it("dikirim ke atasan langsung yang memegang leave.approve_team", async () => {
    givenApprovers({ approveTeam: [MANAGER_USER] });

    await notifyLeaveSubmitted(submitted);
    await settle();

    expect(recipients()).toEqual([MANAGER_USER]);
    expect(firstBatch()![0]!.type).toBe("leave_approval_needed");
  });

  // Laporan pengujian: HR Manager dan admin bisa memutus semua pengajuan,
  // tetapi dulu hanya atasan langsung yang diberi tahu
  it("juga dikirim ke semua admin dan pemegang leave.approve_all", async () => {
    givenApprovers({
      approveAll: [HR_USER, ADMIN_USER],
      approveTeam: [MANAGER_USER],
    });

    await notifyLeaveSubmitted(submitted);
    await settle();

    expect(recipients()).toEqual([MANAGER_USER, HR_USER, ADMIN_USER].sort());
  });

  it("karyawan tanpa atasan tetap memberi tahu admin dan HR", async () => {
    givenApprovers({ approveAll: [HR_USER, ADMIN_USER] });

    await notifyLeaveSubmitted({ ...submitted, approver_employee_id: null });
    await settle();

    expect(recipients()).toEqual([HR_USER, ADMIN_USER].sort());
    expect(featureModel.findUserIdsWithFeature).not.toHaveBeenCalledWith(
      "leave.approve_team",
    );
  });

  it("atasan yang tidak boleh menyetujui tidak diberi tahu", async () => {
    givenApprovers({ approveAll: [HR_USER], approveTeam: [] });

    await notifyLeaveSubmitted(submitted);
    await settle();

    expect(recipients()).toEqual([HR_USER]);
  });

  it("atasan tanpa akun dilewati, admin dan HR tetap diberi tahu", async () => {
    givenApprovers({
      approveAll: [HR_USER],
      approveTeam: [MANAGER_USER],
      managerUser: null,
    });

    await notifyLeaveSubmitted(submitted);
    await settle();

    expect(recipients()).toEqual([HR_USER]);
  });

  it("atasan yang sekaligus HR hanya menerima satu notifikasi", async () => {
    givenApprovers({
      approveAll: [MANAGER_USER, ADMIN_USER],
      approveTeam: [MANAGER_USER],
    });

    await notifyLeaveSubmitted(submitted);
    await settle();

    expect(recipients()).toEqual([MANAGER_USER, ADMIN_USER].sort());
  });

  it("pemohon tidak diberi tahu tentang cutinya sendiri", async () => {
    // misalnya HR Manager atau admin yang mengajukan cuti
    givenApprovers({ approveAll: [REQUESTER_USER, ADMIN_USER] });

    await notifyLeaveSubmitted({ ...submitted, approver_employee_id: null });
    await settle();

    expect(recipients()).toEqual([ADMIN_USER]);
  });

  it("tidak menyimpan apa pun bila tidak ada yang bisa menyetujui", async () => {
    givenApprovers();

    await notifyLeaveSubmitted({ ...submitted, approver_employee_id: null });
    await settle();

    expect(notificationModel.insertMany).not.toHaveBeenCalled();
  });

  it("menyebut nama pemohon, jenis cuti, dan tanggalnya", async () => {
    givenApprovers({ approveTeam: [MANAGER_USER] });

    await notifyLeaveSubmitted(submitted);
    await settle();

    expect(firstBatch()![0]!.message).toBe(
      "Yusuf Ramadhan requested 1 day of Cuti Duka for 2027-07-12",
    );
  });

  it("menulis rentang tanggal kalau lebih dari sehari", async () => {
    givenApprovers({ approveTeam: [MANAGER_USER] });

    await notifyLeaveSubmitted({
      ...submitted,
      end_date: "2027-07-14",
      total_days: 3,
    });
    await settle();

    expect(firstBatch()![0]!.message).toContain("2027-07-12 to 2027-07-14");
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

  it("tidak menghapus antrean persetujuan milik atasan agar riwayat tidak hilang", async () => {
    (employeeModel.findById as jest.Mock).mockResolvedValue({
      user_id: REQUESTER_USER,
    } as never);

    await notifyLeaveDecided(decided);
    await settle();

    expect(notificationModel.deletePending).not.toHaveBeenCalled();
  });

  it("pembatalan oleh pemohon juga tidak menghapus antrean persetujuan atasan", async () => {
    clearLeaveApproval(REQUEST_ID);
    await settle();

    expect(notificationModel.deletePending).not.toHaveBeenCalled();
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
    expect(rows[0]!.message).toContain("approved");
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
      "Note: Sedang musim tutup buku",
    );
  });

  it("tidak menyimpan apa pun kalau pemohon tidak punya akun dan tidak ada view_all", async () => {
    (employeeModel.findById as jest.Mock).mockResolvedValue({
      user_id: null,
    } as never);

    await notifyLeaveDecided(decided);
    await settle();

    expect(notificationModel.insertMany).not.toHaveBeenCalled();
  });

  it("menyertakan nama penyetuju saat cuti disetujui", async () => {
    (employeeModel.findById as jest.Mock).mockResolvedValue({
      user_id: REQUESTER_USER,
    } as never);

    await notifyLeaveDecided({
      ...decided,
      decided_by_name: "Budi Santoso",
    });
    await settle();

    const rows = firstBatch()!;
    expect(rows[0]!.message).toContain("approved by Budi Santoso");
  });

  it("mengirim notifikasi ke pengguna yang memiliki fitur leave.view_all dan orang yang menyetujui", async () => {
    (employeeModel.findById as jest.Mock).mockResolvedValue({
      user_id: REQUESTER_USER,
      full_name: "Yusuf Ramadhan",
    } as never);
    (featureModel.findUserIdsWithFeature as jest.Mock).mockResolvedValue([
      "viewer-1",
      REQUESTER_USER, // pemohon sendiri tidak boleh menerima duplikat
    ] as never);

    await notifyLeaveDecided({
      ...decided,
      requester_name: "Yusuf Ramadhan",
      decided_by_name: "Budi Santoso",
      decider_user_id: "approver-1", // orang yang menyetujui cuti
    });
    await settle();

    const rows = firstBatch()!;
    // 1 untuk pemohon, 1 untuk viewer-1, 1 untuk approver-1
    expect(rows).toHaveLength(3);

    const requesterNotif = rows.find(
      (r) => r.recipient_user_id === REQUESTER_USER,
    );
    expect(requesterNotif).toBeDefined();
    expect(requesterNotif!.link).toBe("/leave");
    expect(requesterNotif!.message).toBe(
      "Cuti Duka for 2027-07-12 approved by Budi Santoso",
    );

    const viewerNotif = rows.find((r) => r.recipient_user_id === "viewer-1");
    expect(viewerNotif).toBeDefined();
    expect(viewerNotif!.link).toBe("/leave-management");
    expect(viewerNotif!.message).toBe(
      "Yusuf Ramadhan's Cuti Duka for 2027-07-12 approved by Budi Santoso",
    );

    const approverNotif = rows.find((r) => r.recipient_user_id === "approver-1");
    expect(approverNotif).toBeDefined();
    expect(approverNotif!.link).toBe("/leave-management");
    expect(approverNotif!.message).toBe(
      "Yusuf Ramadhan's Cuti Duka for 2027-07-12 approved by Budi Santoso",
    );
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
      "Uji Notifikasi (uji@awan.io) has verified their email and is waiting for approval",
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

describe("dorongan realtime", () => {
  const REQUEST_ID2 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

  it("mendorong notifikasi ke soket penerima setelah tersimpan", async () => {
    givenApprovers({ approveTeam: [MANAGER_USER] });
    (notificationModel.insertMany as jest.Mock).mockResolvedValue([
      {
        id: "n1",
        recipient_user_id: MANAGER_USER,
        type: "leave_approval_needed",
        title: "New leave request",
        message: "pesan",
        link: "/leave-management",
        entity: "leave_request",
        entity_id: REQUEST_ID2,
        is_read: false,
        read_at: null,
        created_at: new Date(),
      },
    ] as never);

    await notifyLeaveSubmitted(submitted);
    await settle();

    expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);

    const [targets, message] = (dispatcher.dispatch as jest.Mock).mock
      .calls[0] as [string[], { event: string; data: Record<string, unknown> }];

    expect(targets).toEqual([MANAGER_USER]);
    expect(message.event).toBe("notification.created");
    expect(message.data.id).toBe("n1");
  });

  it("tidak mengirim kolom internal lewat soket", async () => {
    givenApprovers({ approveTeam: [MANAGER_USER] });
    (notificationModel.insertMany as jest.Mock).mockResolvedValue([
      {
        id: "n1",
        recipient_user_id: MANAGER_USER,
        type: "leave_approval_needed",
        title: "judul",
        message: "pesan",
        link: "/leave-management",
        entity: "leave_request",
        entity_id: REQUEST_ID2,
        is_read: false,
        read_at: null,
        created_at: new Date(),
      },
    ] as never);

    await notifyLeaveSubmitted(submitted);
    await settle();

    const [, message] = (dispatcher.dispatch as jest.Mock).mock.calls[0] as [
      string[],
      { data: Record<string, unknown> },
    ];

    expect(message.data).not.toHaveProperty("recipient_user_id");
    expect(message.data).not.toHaveProperty("entity");
    expect(message.data).not.toHaveProperty("entity_id");
  });

  it("tidak mendorong apa pun kalau penyimpanan gagal", async () => {
    givenApprovers({ approveTeam: [MANAGER_USER] });
    (notificationModel.insertMany as jest.Mock).mockRejectedValue(
      new Error("database mati") as never,
    );

    await notifyLeaveSubmitted(submitted);
    await settle();

    expect(dispatcher.dispatch).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  it("memberi tahu penerima bahwa antrean persetujuan sudah dibersihkan", async () => {
    (notificationModel.deletePending as jest.Mock).mockResolvedValue([
      { id: "n1", recipient_user_id: "a1" },
      { id: "n2", recipient_user_id: "a2" },
    ] as never);

    clearAccountApproval("user-1");
    await settle();

    const [targets, message] = (dispatcher.dispatch as jest.Mock).mock
      .calls[0] as [string[], { event: string; ids: string[] }];

    expect(targets).toEqual(["a1", "a2"]);
    expect(message.event).toBe("notification.cleared");
    expect(message.ids).toEqual(["n1", "n2"]);
  });

  it("tidak mengirim pesan pembersihan kalau tidak ada yang terhapus", async () => {
    (notificationModel.deletePending as jest.Mock).mockResolvedValue(
      [] as never,
    );

    clearAccountApproval("user-2");
    await settle();

    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });
});
