import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import request from "supertest";

jest.unstable_mockModule("../../src/config/databaseConnection.js", () => ({
  pool: {
    connect: jest.fn(),
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

jest.unstable_mockModule("../../src/models/feature.js", () => ({
  findCodesByPosition: jest.fn(),
  findAllCodes: jest.fn(),
}));

jest.unstable_mockModule("../../src/helpers/featureCache.js", () => ({
  ambilDariCache: jest.fn(() => undefined),
  simpanKeCache: jest.fn(),
  batalkanCacheFitur: jest.fn(),
  ukuranCacheFitur: jest.fn(() => 0),
}));

jest.unstable_mockModule("../../src/models/department.js", () => ({
  findById: jest.fn(),
}));

jest.unstable_mockModule("../../src/models/workSchedule.js", () => ({
  findAll: jest.fn(),
  findById: jest.fn(),
  findDefault: jest.fn(),
  findByDepartment: jest.fn(),
  resolveForEmployee: jest.fn(),
  resolveForAllActive: jest.fn(),
  createSchedule: jest.fn(),
  updateSchedule: jest.fn(),
  softDeleteSchedule: jest.fn(),
  countEmployees: jest.fn(),
  adalahHariKerja: jest.fn(() => true),
  tanggalKerjaDalamRentang: jest.fn(() => []),
}));

jest.unstable_mockModule("../../src/config/logger.js", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
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

const jadwalBawaan = {
  id: SCHEDULE_ID,
  name: "Jadwal Kerja Umum",
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

const jadwalDepartemen = {
  ...jadwalBawaan,
  id: "66666666-6666-4666-8666-666666666666",
  name: "Jadwal Operasional",
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
    jadwalBawaan,
  ] as never);
  (workScheduleModel.findById as jest.Mock).mockResolvedValue(
    jadwalDepartemen as never,
  );
  (workScheduleModel.findDefault as jest.Mock).mockResolvedValue(null as never);
  (workScheduleModel.findByDepartment as jest.Mock).mockResolvedValue(
    null as never,
  );
  (workScheduleModel.createSchedule as jest.Mock).mockResolvedValue(
    jadwalDepartemen as never,
  );
  (workScheduleModel.updateSchedule as jest.Mock).mockResolvedValue(
    jadwalDepartemen as never,
  );
  (workScheduleModel.softDeleteSchedule as jest.Mock).mockResolvedValue(
    jadwalDepartemen as never,
  );
  (workScheduleModel.countEmployees as jest.Mock).mockResolvedValue(0 as never);
  (workScheduleModel.resolveForEmployee as jest.Mock).mockResolvedValue(
    jadwalDepartemen as never,
  );
});

function sebagaiKaryawan(metode: "get" | "post" | "patch" | "delete", jalur: string) {
  return request(app)
    [metode](jalur)
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

    const res = await sebagaiKaryawan("get", "/api/v1/work-schedules");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("memberi jadwal yang berlaku bagi pengguna yang sedang login", async () => {
    const res = await sebagaiKaryawan("get", "/api/v1/work-schedules/me");

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

    const res = await sebagaiKaryawan("get", "/api/v1/work-schedules/me");

    expect(res.status).toBe(404);
  });

  it("tidak membaca kata me sebagai id jadwal", async () => {
    await sebagaiKaryawan("get", "/api/v1/work-schedules/me");

    expect(workScheduleModel.findById).not.toHaveBeenCalled();
  });

  it("menolak id yang bukan uuid", async () => {
    const res = await sebagaiKaryawan(
      "get",
      "/api/v1/work-schedules/bukan-uuid",
    );

    expect(res.status).toBe(400);
  });

  it("melaporkan jadwal yang tidak ditemukan", async () => {
    (workScheduleModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await sebagaiKaryawan(
      "get",
      `/api/v1/work-schedules/${SCHEDULE_ID}`,
    );

    expect(res.status).toBe(404);
  });
});

describe("membuat jadwal kerja", () => {
  function buat(body: Record<string, unknown>) {
    return sebagaiKaryawan("post", "/api/v1/work-schedules").send(body);
  }

  it("menolak tanpa fitur organization.schedule", async () => {
    (featureModel.findCodesByPosition as jest.Mock).mockResolvedValue(
      [] as never,
    );

    const res = await buat({ name: "Jadwal Operasional" });

    expect(res.status).toBe(403);
    expect(res.body.details.required_feature).toBe("organization.schedule");
  });

  it("menyimpan jadwal departemen baru", async () => {
    const res = await buat({
      name: "Jadwal Operasional",
      department_id: DEPARTMENT_ID,
      start_time: "09:00",
      end_time: "18:00",
    });

    expect(res.status).toBe(201);
    expect(workScheduleModel.createSchedule).toHaveBeenCalled();
  });

  it("menolak departemen yang sudah punya jadwal", async () => {
    (workScheduleModel.findByDepartment as jest.Mock).mockResolvedValue(
      jadwalDepartemen as never,
    );

    const res = await buat({
      name: "Jadwal Lain",
      department_id: DEPARTMENT_ID,
    });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain("Jadwal Operasional");
  });

  it("menolak departemen yang tidak ditemukan", async () => {
    (departmentModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await buat({
      name: "Jadwal Operasional",
      department_id: DEPARTMENT_ID,
    });

    expect(res.status).toBe(400);
  });

  it("menolak jadwal bawaan kedua", async () => {
    (workScheduleModel.findDefault as jest.Mock).mockResolvedValue(
      jadwalBawaan as never,
    );

    const res = await buat({ name: "Jadwal Bawaan Lain" });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain("hanya boleh ada satu jadwal bawaan");
  });

  it("menolak jam pulang yang tidak melewati jam masuk", async () => {
    const res = await buat({
      name: "Jadwal Terbalik",
      start_time: "17:00",
      end_time: "08:00",
    });

    expect(res.status).toBe(400);
    expect(workScheduleModel.createSchedule).not.toHaveBeenCalled();
  });

  it("menolak format jam yang tidak valid", async () => {
    const res = await buat({ name: "Jadwal Aneh", start_time: "8 pagi" });

    expect(res.status).toBe(400);
  });

  it("menolak nama yang terlalu pendek", async () => {
    const res = await buat({ name: "AB" });

    expect(res.status).toBe(400);
  });
});

describe("mengubah jadwal kerja", () => {
  function ubah(body: Record<string, unknown>) {
    return sebagaiKaryawan(
      "patch",
      `/api/v1/work-schedules/${SCHEDULE_ID}`,
    ).send(body);
  }

  it("menolak tanpa fitur organization.schedule", async () => {
    (featureModel.findCodesByPosition as jest.Mock).mockResolvedValue(
      [] as never,
    );

    const res = await ubah({ name: "Nama Baru" });

    expect(res.status).toBe(403);
  });

  it("mengubah jadwal departemen", async () => {
    const res = await ubah({ late_tolerance_minutes: 10 });

    expect(res.status).toBe(200);
    expect(workScheduleModel.updateSchedule).toHaveBeenCalledWith(SCHEDULE_ID, {
      late_tolerance_minutes: 10,
    });
  });

  it("membandingkan jam dengan nilai lama ketika hanya satu yang diubah", async () => {
    // jadwal lama 08:00 sampai 17:00, jam masuk baru 18:00 melewati jam pulang
    const res = await ubah({ start_time: "18:00" });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Jam pulang");
    expect(workScheduleModel.updateSchedule).not.toHaveBeenCalled();
  });

  it("menolak memindahkan jadwal bawaan ke satu departemen", async () => {
    (workScheduleModel.findById as jest.Mock).mockResolvedValue(
      jadwalBawaan as never,
    );

    const res = await ubah({ department_id: DEPARTMENT_ID });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Jadwal bawaan");
  });

  it("menolak menonaktifkan jadwal bawaan", async () => {
    (workScheduleModel.findById as jest.Mock).mockResolvedValue(
      jadwalBawaan as never,
    );

    const res = await ubah({ is_active: false });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("cadangan terakhir");
  });

  it("menolak memindahkan jadwal ke departemen yang sudah punya jadwal", async () => {
    (workScheduleModel.findByDepartment as jest.Mock).mockResolvedValue({
      ...jadwalDepartemen,
      id: "77777777-7777-4777-8777-777777777777",
      name: "Jadwal Gudang",
    } as never);

    const res = await ubah({
      department_id: "88888888-8888-4888-8888-888888888888",
    });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain("Jadwal Gudang");
  });

  it("melaporkan jadwal yang tidak ditemukan", async () => {
    (workScheduleModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await ubah({ name: "Nama Baru" });

    expect(res.status).toBe(404);
  });
});

describe("menghapus jadwal kerja", () => {
  function hapus() {
    return sebagaiKaryawan("delete", `/api/v1/work-schedules/${SCHEDULE_ID}`);
  }

  it("menolak tanpa fitur organization.schedule", async () => {
    (featureModel.findCodesByPosition as jest.Mock).mockResolvedValue(
      [] as never,
    );

    const res = await hapus();

    expect(res.status).toBe(403);
  });

  it("menghapus jadwal yang tidak dipakai siapa pun", async () => {
    const res = await hapus();

    expect(res.status).toBe(200);
    expect(workScheduleModel.softDeleteSchedule).toHaveBeenCalledWith(
      SCHEDULE_ID,
    );
  });

  it("menolak menghapus jadwal yang masih dipakai sambil menyebut jumlahnya", async () => {
    (workScheduleModel.countEmployees as jest.Mock).mockResolvedValue(
      4 as never,
    );

    const res = await hapus();

    expect(res.status).toBe(409);
    expect(res.body.message).toContain("4 karyawan");
    expect(res.body.details.employee_count).toBe(4);
    expect(workScheduleModel.softDeleteSchedule).not.toHaveBeenCalled();
  });

  it("tidak pernah menghapus jadwal bawaan", async () => {
    (workScheduleModel.findById as jest.Mock).mockResolvedValue(
      jadwalBawaan as never,
    );

    const res = await hapus();

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("cadangan terakhir");
    expect(workScheduleModel.softDeleteSchedule).not.toHaveBeenCalled();
  });

  it("melaporkan jadwal yang tidak ditemukan", async () => {
    (workScheduleModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await hapus();

    expect(res.status).toBe(404);
  });
});

describe("keselarasan batas absen dengan jam kerja", () => {
  function buat(body: Record<string, unknown>) {
    return sebagaiKaryawan("post", "/api/v1/work-schedules").send(body);
  }

  function ubah(body: Record<string, unknown>) {
    return sebagaiKaryawan(
      "patch",
      `/api/v1/work-schedules/${SCHEDULE_ID}`,
    ).send(body);
  }

  it("menerima batas absen yang melewati akhir toleransi", async () => {
    const res = await buat({
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
    const res = await buat({
      name: "Jadwal Rancu",
      department_id: DEPARTMENT_ID,
      start_time: "08:00",
      end_time: "17:00",
      late_tolerance_minutes: 15,
      absent_cutoff_time: "08:10",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("toleransi keterlambatan");
    expect(workScheduleModel.createSchedule).not.toHaveBeenCalled();
  });

  it("menolak batas absen yang tepat di akhir toleransi", async () => {
    const res = await buat({
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
    const res = await buat({
      name: "Jadwal Rancu",
      department_id: DEPARTMENT_ID,
      start_time: "08:00",
      end_time: "17:00",
      absent_cutoff_time: "18:00",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("jam pulang");
  });

  it("memakai toleransi lama saat hanya batas absen yang diubah", async () => {
    const res = await ubah({ absent_cutoff_time: "08:02" });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("toleransi keterlambatan");
    expect(workScheduleModel.updateSchedule).not.toHaveBeenCalled();
  });

  it("mengizinkan pengetatan batas absen", async () => {
    const res = await ubah({ absent_cutoff_time: "08:10" });

    expect(res.status).toBe(200);
  });
});
