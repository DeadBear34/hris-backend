import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import request from "supertest";

jest.unstable_mockModule("../../src/config/databaseConnection.js", () => ({
  pool: {
    connect: jest.fn(() =>
      Promise.resolve({
        query: jest.fn(() => Promise.resolve({ rows: [] })),
        release: jest.fn(),
      }),
    ),
    query: jest.fn(() => Promise.resolve({ rows: [] })),
  },
}));

jest.unstable_mockModule("../../src/models/user.js", () => ({
  findSessionInfo: jest.fn(() =>
    Promise.resolve({
      id: "session-user",
      password_changed_at: null,
      is_active: true,
    }),
  ),
  findById: jest.fn(),
  findByEmail: jest.fn(),
}));

jest.unstable_mockModule("../../src/models/employee.js", () => ({
  findByUserId: jest.fn(),
  findById: jest.fn(),
}));

jest.unstable_mockModule("../../src/models/feature.js", () => ({
  findCodesByPosition: jest.fn(),
  findAllCodes: jest.fn(),
}));

jest.unstable_mockModule("../../src/helpers/featureCache.js", () => ({
  readFromCache: jest.fn(() => undefined),
  writeToCache: jest.fn(),
  invalidateFeatureCache: jest.fn(),
  featureCacheSize: jest.fn(() => 0),
}));

jest.unstable_mockModule("../../src/models/department.js", () => ({
  findById: jest.fn(),
  findExistingIds: jest.fn(),
}));

jest.unstable_mockModule("../../src/models/workSchedule.js", () => ({
  findAll: jest.fn(),
  findById: jest.fn(),
  findDefault: jest.fn(),
  findDepartmentOwners: jest.fn(),
  findOverlapping: jest.fn(),
  resolveForEmployee: jest.fn(),
  resolveForAllActive: jest.fn(),
  createSchedule: jest.fn(),
  updateSchedule: jest.fn(),
  softDeleteSchedule: jest.fn(),
  countEmployees: jest.fn(),
  isWorkingDay: jest.fn(() => true),
  workingDatesInRange: jest.fn(() => []),
}));

jest.unstable_mockModule("../../src/config/logger.js", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const employeeModel = await import("../../src/models/employee.js");
const featureModel = await import("../../src/models/feature.js");
const departmentModel = await import("../../src/models/department.js");
const workScheduleModel = await import("../../src/models/workSchedule.js");
const { createToken } = await import("../../src/helpers/jwt.js");
const { app } = await import("../../src/app.js");

const USER_ID = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";
const POSITION_ID = "33333333-3333-4333-8333-333333333333";
const SCHEDULE_ID = "44444444-4444-4444-8444-444444444444";
const DEPARTMENT_ID = "55555555-5555-4555-8555-555555555555";
const SECOND_DEPARTMENT_ID = "99999999-9999-4999-8999-999999999999";

const employeeToken = createToken({
  id: USER_ID,
  email: "karyawan@awan.io",
  role: "employee",
});

const fakeEmployee = {
  id: EMPLOYEE_ID,
  user_id: USER_ID,
  employee_number: "001",
  full_name: "Bagus Pratama",
  position_id: POSITION_ID,
  department_id: DEPARTMENT_ID,
  is_active: true,
};

const defaultSchedule = {
  id: SCHEDULE_ID,
  name: "Jadwal Kerja Umum",
  is_default: true,
  department_ids: [] as string[],
  department_id: null,
  start_time: "08:00:00",
  end_time: "17:00:00",
  late_tolerance_minutes: 5,
  absent_cutoff_time: "17:00:00",
  works_monday: true,
  works_saturday: false,
  works_sunday: false,
  is_active: true,
};

const departmentSchedule = {
  ...defaultSchedule,
  id: "66666666-6666-4666-8666-666666666666",
  name: "Jadwal Operasional",
  is_default: false,
  department_ids: [DEPARTMENT_ID],
  department_id: DEPARTMENT_ID,
};

beforeEach(() => {
  jest.clearAllMocks();
  (employeeModel.findByUserId as jest.Mock).mockResolvedValue(
    fakeEmployee as never,
  );
  (featureModel.findCodesByPosition as jest.Mock).mockResolvedValue([
    "organization.schedule",
  ] as never);
  (departmentModel.findById as jest.Mock).mockResolvedValue({
    id: DEPARTMENT_ID,
    name: "Operasional",
  } as never);
  (workScheduleModel.findAll as jest.Mock).mockResolvedValue([
    defaultSchedule,
  ] as never);
  (workScheduleModel.findById as jest.Mock).mockResolvedValue(
    departmentSchedule as never,
  );
  (workScheduleModel.findDefault as jest.Mock).mockResolvedValue(null as never);
  (departmentModel.findExistingIds as jest.Mock).mockImplementation(
    (ids) => Promise.resolve(ids) as never,
  );
  (workScheduleModel.findDepartmentOwners as jest.Mock).mockResolvedValue(
    [] as never,
  );
  (workScheduleModel.findOverlapping as jest.Mock).mockResolvedValue(
    [] as never,
  );
  (workScheduleModel.createSchedule as jest.Mock).mockResolvedValue(
    departmentSchedule.id as never,
  );
  (workScheduleModel.updateSchedule as jest.Mock).mockResolvedValue(
    true as never,
  );
  (workScheduleModel.softDeleteSchedule as jest.Mock).mockResolvedValue(
    undefined as never,
  );
  (workScheduleModel.countEmployees as jest.Mock).mockResolvedValue(0 as never);
  (workScheduleModel.resolveForEmployee as jest.Mock).mockResolvedValue(
    departmentSchedule as never,
  );
});

function asEmployee(
  method: "get" | "post" | "patch" | "delete",
  urlPath: string,
) {
  return request(app)
    [method](urlPath)
    .set("Authorization", `Bearer ${employeeToken}`);
}

describe("membaca jadwal kerja", () => {
  it("menolak tamu yang belum login", async () => {
    const res = await request(app).get("/api/v1/work-schedules");

    expect(res.status).toBe(401);
  });

  it("dapat dibaca karyawan tanpa fitur apa pun karena perlu tahu jam kerjanya", async () => {
    (featureModel.findCodesByPosition as jest.Mock).mockResolvedValue(
      [] as never,
    );

    const res = await asEmployee("get", "/api/v1/work-schedules");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("memberi jadwal yang berlaku bagi pengguna yang sedang login", async () => {
    const res = await asEmployee("get", "/api/v1/work-schedules/me");

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("Jadwal Operasional");
    expect(workScheduleModel.resolveForEmployee).toHaveBeenCalledWith(
      EMPLOYEE_ID,
    );
  });

  it("memberi tahu ketika belum ada jadwal yang berlaku", async () => {
    (workScheduleModel.resolveForEmployee as jest.Mock).mockResolvedValue(
      null as never,
    );

    const res = await asEmployee("get", "/api/v1/work-schedules/me");

    expect(res.status).toBe(404);
  });

  it("tidak membaca kata me sebagai id jadwal", async () => {
    await asEmployee("get", "/api/v1/work-schedules/me");

    expect(workScheduleModel.findById).not.toHaveBeenCalled();
  });

  it("menolak id yang bukan uuid", async () => {
    const res = await asEmployee("get", "/api/v1/work-schedules/bukan-uuid");

    expect(res.status).toBe(400);
  });

  it("melaporkan jadwal yang tidak ditemukan", async () => {
    (workScheduleModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await asEmployee(
      "get",
      `/api/v1/work-schedules/${SCHEDULE_ID}`,
    );

    expect(res.status).toBe(404);
  });
});

describe("membuat jadwal kerja", () => {
  function postSchedule(body: Record<string, unknown>) {
    return asEmployee("post", "/api/v1/work-schedules").send(body);
  }

  it("menolak tanpa fitur organization.schedule", async () => {
    (featureModel.findCodesByPosition as jest.Mock).mockResolvedValue(
      [] as never,
    );

    const res = await postSchedule({ name: "Jadwal Operasional" });

    expect(res.status).toBe(403);
    expect(res.body.details.required_feature).toBe("organization.schedule");
  });

  it("menyimpan satu jadwal untuk beberapa divisi sekaligus", async () => {
    const res = await postSchedule({
      name: "Jadwal Operasional",
      department_ids: [DEPARTMENT_ID, SECOND_DEPARTMENT_ID],
      start_time: "09:00",
      end_time: "18:00",
    });

    expect(res.status).toBe(201);

    const [, data, isDefault] = (workScheduleModel.createSchedule as jest.Mock)
      .mock.calls[0] as [unknown, { department_ids: string[] }, boolean];

    expect(data.department_ids).toEqual([DEPARTMENT_ID, SECOND_DEPARTMENT_ID]);
    expect(isDefault).toBe(false);
  });

  it("divisi yang dikirim dua kali hanya dihitung sekali", async () => {
    await postSchedule({
      name: "Jadwal Operasional",
      department_ids: [DEPARTMENT_ID, DEPARTMENT_ID],
    });

    const [, data] = (workScheduleModel.createSchedule as jest.Mock).mock
      .calls[0] as [unknown, { department_ids: string[] }];

    expect(data.department_ids).toEqual([DEPARTMENT_ID]);
  });

  it("masih menerima department_id tunggal dari klien lama", async () => {
    const res = await postSchedule({
      name: "Jadwal Operasional",
      department_id: DEPARTMENT_ID,
    });

    expect(res.status).toBe(201);

    const [, data] = (workScheduleModel.createSchedule as jest.Mock).mock
      .calls[0] as [unknown, { department_ids: string[] }];

    expect(data.department_ids).toEqual([DEPARTMENT_ID]);
  });

  it("menolak divisi yang sudah dipakai jadwal lain sambil menyebut namanya", async () => {
    (workScheduleModel.findDepartmentOwners as jest.Mock).mockResolvedValue([
      {
        department_id: SECOND_DEPARTMENT_ID,
        department_name: "Gudang",
        schedule_id: "77777777-7777-4777-8777-777777777777",
        schedule_name: "Jadwal Gudang",
      },
    ] as never);

    const res = await postSchedule({
      name: "Jadwal Lain",
      department_ids: [DEPARTMENT_ID, SECOND_DEPARTMENT_ID],
    });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain("Gudang (Jadwal Gudang)");
    expect(res.body.details.conflicts).toHaveLength(1);
    expect(workScheduleModel.createSchedule).not.toHaveBeenCalled();
  });

  it("menolak divisi yang tidak ditemukan sambil menyebut id-nya", async () => {
    (departmentModel.findExistingIds as jest.Mock).mockResolvedValue([
      DEPARTMENT_ID,
    ] as never);

    const res = await postSchedule({
      name: "Jadwal Operasional",
      department_ids: [DEPARTMENT_ID, SECOND_DEPARTMENT_ID],
    });

    expect(res.status).toBe(400);
    expect(res.body.details.missing_department_ids).toEqual([
      SECOND_DEPARTMENT_ID,
    ]);
  });

  it("jadwal tanpa divisi menjadi jadwal bawaan bila belum ada", async () => {
    const res = await postSchedule({ name: "Jadwal Kerja Umum" });

    expect(res.status).toBe(201);

    const [, , isDefault] = (workScheduleModel.createSchedule as jest.Mock).mock
      .calls[0] as [unknown, unknown, boolean];

    expect(isDefault).toBe(true);
  });

  it("menolak jadwal tanpa divisi bila jadwal bawaan sudah ada", async () => {
    (workScheduleModel.findDefault as jest.Mock).mockResolvedValue(
      defaultSchedule as never,
    );

    const res = await postSchedule({ name: "Jadwal Bawaan Lain" });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Choose at least one department");
  });

  it("menolak daftar divisi yang berisi id tidak sah", async () => {
    const res = await postSchedule({
      name: "Jadwal Operasional",
      department_ids: ["bukan-uuid"],
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("menolak jam pulang yang tidak melewati jam masuk", async () => {
    const res = await postSchedule({
      name: "Jadwal Terbalik",
      start_time: "17:00",
      end_time: "08:00",
    });

    expect(res.status).toBe(400);
    expect(workScheduleModel.createSchedule).not.toHaveBeenCalled();
  });

  it("menolak format jam yang tidak valid", async () => {
    const res = await postSchedule({
      name: "Jadwal Aneh",
      start_time: "8 pagi",
    });

    expect(res.status).toBe(400);
  });

  it("menolak nama yang terlalu pendek", async () => {
    const res = await postSchedule({ name: "AB" });

    expect(res.status).toBe(400);
  });
});

describe("mengubah jadwal kerja", () => {
  function patchSchedule(body: Record<string, unknown>) {
    return asEmployee("patch", `/api/v1/work-schedules/${SCHEDULE_ID}`).send(
      body,
    );
  }

  it("menolak tanpa fitur organization.schedule", async () => {
    (featureModel.findCodesByPosition as jest.Mock).mockResolvedValue(
      [] as never,
    );

    const res = await patchSchedule({ name: "Nama Baru" });

    expect(res.status).toBe(403);
  });

  it("mengubah jadwal departemen", async () => {
    const res = await patchSchedule({ late_tolerance_minutes: 10 });

    expect(res.status).toBe(200);
    expect(workScheduleModel.updateSchedule).toHaveBeenCalledWith(
      expect.anything(),
      SCHEDULE_ID,
      { late_tolerance_minutes: 10 },
      undefined,
    );
  });

  it("mengganti daftar divisi pemakai jadwal", async () => {
    const res = await patchSchedule({
      department_ids: [DEPARTMENT_ID, SECOND_DEPARTMENT_ID],
    });

    expect(res.status).toBe(200);
    // divisi milik jadwal ini sendiri tidak dianggap bentrok
    expect(workScheduleModel.findDepartmentOwners).toHaveBeenCalledWith(
      [DEPARTMENT_ID, SECOND_DEPARTMENT_ID],
      SCHEDULE_ID,
    );
  });

  it("menolak mengosongkan divisi jadwal yang bukan bawaan", async () => {
    const res = await patchSchedule({ department_ids: [] });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("at least one department");
    expect(workScheduleModel.updateSchedule).not.toHaveBeenCalled();
  });

  it("melaporkan bentrok versi tanpa menyimpan apa pun", async () => {
    (workScheduleModel.updateSchedule as jest.Mock).mockResolvedValue(
      false as never,
    );

    const res = await patchSchedule({
      name: "Nama Baru",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    expect(res.status).toBe(409);
  });

  it("membandingkan jam dengan nilai lama ketika hanya satu yang diubah", async () => {
    // jadwal lama 08:00 sampai 17:00, jam masuk baru 18:00 melewati jam pulang
    const res = await patchSchedule({ start_time: "18:00" });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("End time");
    expect(workScheduleModel.updateSchedule).not.toHaveBeenCalled();
  });

  it("menolak memindahkan jadwal bawaan ke satu departemen", async () => {
    (workScheduleModel.findById as jest.Mock).mockResolvedValue(
      defaultSchedule as never,
    );

    const res = await patchSchedule({ department_ids: [DEPARTMENT_ID] });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("default schedule");
  });

  it("menolak menonaktifkan jadwal bawaan", async () => {
    (workScheduleModel.findById as jest.Mock).mockResolvedValue(
      defaultSchedule as never,
    );

    const res = await patchSchedule({ is_active: false });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("fallback");
  });

  it("menolak memindahkan jadwal ke divisi yang sudah punya jadwal", async () => {
    (workScheduleModel.findDepartmentOwners as jest.Mock).mockResolvedValue([
      {
        department_id: SECOND_DEPARTMENT_ID,
        department_name: "Gudang",
        schedule_id: "77777777-7777-4777-8777-777777777777",
        schedule_name: "Jadwal Gudang",
      },
    ] as never);

    const res = await patchSchedule({
      department_ids: [SECOND_DEPARTMENT_ID],
    });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain("Jadwal Gudang");
    expect(workScheduleModel.updateSchedule).not.toHaveBeenCalled();
  });

  it("melaporkan jadwal yang tidak ditemukan", async () => {
    (workScheduleModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await patchSchedule({ name: "Nama Baru" });

    expect(res.status).toBe(404);
  });
});

describe("menghapus jadwal kerja", () => {
  function deleteSchedule() {
    return asEmployee("delete", `/api/v1/work-schedules/${SCHEDULE_ID}`);
  }

  it("menolak tanpa fitur organization.schedule", async () => {
    (featureModel.findCodesByPosition as jest.Mock).mockResolvedValue(
      [] as never,
    );

    const res = await deleteSchedule();

    expect(res.status).toBe(403);
  });

  it("menghapus jadwal yang tidak dipakai siapa pun", async () => {
    const res = await deleteSchedule();

    expect(res.status).toBe(200);
    expect(workScheduleModel.softDeleteSchedule).toHaveBeenCalledWith(
      expect.anything(),
      SCHEDULE_ID,
    );
  });

  it("menolak menghapus jadwal yang masih dipakai sambil menyebut jumlahnya", async () => {
    (workScheduleModel.countEmployees as jest.Mock).mockResolvedValue(
      4 as never,
    );

    const res = await deleteSchedule();

    expect(res.status).toBe(409);
    expect(res.body.message).toContain("4 employees");
    expect(res.body.details.employee_count).toBe(4);
    expect(workScheduleModel.softDeleteSchedule).not.toHaveBeenCalled();
  });

  it("tidak pernah menghapus jadwal bawaan", async () => {
    (workScheduleModel.findById as jest.Mock).mockResolvedValue(
      defaultSchedule as never,
    );

    const res = await deleteSchedule();

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("fallback");
    expect(workScheduleModel.softDeleteSchedule).not.toHaveBeenCalled();
  });

  it("melaporkan jadwal yang tidak ditemukan", async () => {
    (workScheduleModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await deleteSchedule();

    expect(res.status).toBe(404);
  });
});

describe("keselarasan batas absen dengan jam kerja", () => {
  function postSchedule(body: Record<string, unknown>) {
    return asEmployee("post", "/api/v1/work-schedules").send(body);
  }

  function patchSchedule(body: Record<string, unknown>) {
    return asEmployee("patch", `/api/v1/work-schedules/${SCHEDULE_ID}`).send(
      body,
    );
  }

  it("menerima batas absen yang melewati akhir toleransi", async () => {
    const res = await postSchedule({
      name: "Jadwal Ketat",
      department_id: DEPARTMENT_ID,
      start_time: "08:00",
      end_time: "17:00",
      late_tolerance_minutes: 5,
      absent_cutoff_time: "08:10",
    });

    expect(res.status).toBe(201);
  });

  it("menolak batas absen yang jatuh sebelum akhir toleransi", async () => {
    const res = await postSchedule({
      name: "Jadwal Rancu",
      department_id: DEPARTMENT_ID,
      start_time: "08:00",
      end_time: "17:00",
      late_tolerance_minutes: 15,
      absent_cutoff_time: "08:10",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("late tolerance");
    expect(workScheduleModel.createSchedule).not.toHaveBeenCalled();
  });

  it("menolak batas absen yang tepat di akhir toleransi", async () => {
    const res = await postSchedule({
      name: "Jadwal Rancu",
      department_id: DEPARTMENT_ID,
      start_time: "08:00",
      end_time: "17:00",
      late_tolerance_minutes: 10,
      absent_cutoff_time: "08:10",
    });

    expect(res.status).toBe(400);
  });

  it("menolak batas absen yang melewati jam pulang", async () => {
    const res = await postSchedule({
      name: "Jadwal Rancu",
      department_id: DEPARTMENT_ID,
      start_time: "08:00",
      end_time: "17:00",
      absent_cutoff_time: "18:00",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("end time");
  });

  it("memakai toleransi lama saat hanya batas absen yang diubah", async () => {
    const res = await patchSchedule({ absent_cutoff_time: "08:02" });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("late tolerance");
    expect(workScheduleModel.updateSchedule).not.toHaveBeenCalled();
  });

  it("mengizinkan pengetatan batas absen", async () => {
    const res = await patchSchedule({ absent_cutoff_time: "08:10" });

    expect(res.status).toBe(200);
  });
});

describe("batas minimal lembur pada jadwal", () => {
  it("menerima batas minimal lembur yang wajar", async () => {
    const res = await asEmployee("post", "/api/v1/work-schedules").send({
      name: "Jadwal Operasional",
      department_ids: [DEPARTMENT_ID],
      overtime_min_minutes: 60,
    });

    expect(res.status).toBe(201);
  });

  it("menolak batas minimal lembur di luar 0 sampai 240 menit", async () => {
    for (const overtime_min_minutes of [-1, 241]) {
      const res = await asEmployee("post", "/api/v1/work-schedules").send({
        name: "Jadwal Operasional",
        department_ids: [DEPARTMENT_ID],
        overtime_min_minutes,
      });

      expect(res.status).toBe(400);
    }
  });
});

describe("jam kerja antar jadwal tidak boleh beririsan", () => {
  const overlap = {
    id: SCHEDULE_ID,
    name: "Jadwal Kerja Umum",
    start_time: "08:00",
    end_time: "17:00",
  };

  function postSchedule(body: Record<string, unknown>) {
    return asEmployee("post", "/api/v1/work-schedules").send({
      name: "Jadwal Sore",
      department_ids: [DEPARTMENT_ID],
      ...body,
    });
  }

  function patchSchedule(body: Record<string, unknown>) {
    return asEmployee("patch", `/api/v1/work-schedules/${SCHEDULE_ID}`).send(
      body,
    );
  }

  it("menolak jadwal baru yang beririsan sambil menyebut jadwal dan jamnya", async () => {
    (workScheduleModel.findOverlapping as jest.Mock).mockResolvedValue([
      overlap,
    ] as never);

    const res = await postSchedule({
      start_time: "16:00",
      end_time: "23:00",
      absent_cutoff_time: "18:00",
    });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain("16:00-23:00");
    expect(res.body.message).toContain("Jadwal Kerja Umum (08:00-17:00)");
    expect(res.body.details.overlaps).toEqual([overlap]);
    expect(workScheduleModel.createSchedule).not.toHaveBeenCalled();
  });

  it("memeriksa jam dan hari kerja yang dikirim, dengan hari bawaan Senin sampai Jumat", async () => {
    await postSchedule({
      start_time: "17:00",
      end_time: "23:00",
      absent_cutoff_time: "18:00",
      works_saturday: true,
    });

    expect(workScheduleModel.findOverlapping).toHaveBeenCalledWith(
      { start_time: "17:00", end_time: "23:00" },
      {
        works_monday: true,
        works_tuesday: true,
        works_wednesday: true,
        works_thursday: true,
        works_friday: true,
        works_saturday: true,
        works_sunday: false,
      },
      undefined,
    );
  });

  it("tidak memeriksa jadwal yang dibuat dalam keadaan nonaktif", async () => {
    const res = await postSchedule({ is_active: false });

    expect(res.status).toBe(201);
    expect(workScheduleModel.findOverlapping).not.toHaveBeenCalled();
  });

  it("menolak perubahan jam yang membuat jadwal beririsan", async () => {
    (workScheduleModel.findOverlapping as jest.Mock).mockResolvedValue([
      overlap,
    ] as never);

    const res = await patchSchedule({ start_time: "07:00" });

    expect(res.status).toBe(409);
    expect(workScheduleModel.updateSchedule).not.toHaveBeenCalled();
  });

  it("membandingkan dengan nilai lama dan tidak menghitung jadwal itu sendiri", async () => {
    await patchSchedule({ end_time: "16:00", absent_cutoff_time: "09:00" });

    expect(workScheduleModel.findOverlapping).toHaveBeenCalledWith(
      { start_time: "08:00:00", end_time: "16:00" },
      expect.objectContaining({ works_monday: true, works_sunday: false }),
      SCHEDULE_ID,
    );
  });

  it("menonaktifkan jadwal tidak diperiksa supaya bentrok lama bisa dibereskan", async () => {
    (workScheduleModel.findOverlapping as jest.Mock).mockResolvedValue([
      overlap,
    ] as never);

    const res = await patchSchedule({ is_active: false });

    expect(res.status).toBe(200);
    expect(workScheduleModel.findOverlapping).not.toHaveBeenCalled();
  });

  it("menghapus jadwal tetap bisa walaupun jamnya beririsan", async () => {
    (workScheduleModel.findOverlapping as jest.Mock).mockResolvedValue([
      overlap,
    ] as never);

    const res = await asEmployee(
      "delete",
      `/api/v1/work-schedules/${SCHEDULE_ID}`,
    );

    expect(res.status).toBe(200);
  });
});
