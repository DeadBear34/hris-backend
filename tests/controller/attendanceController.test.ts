import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  afterAll,
} from "@jest/globals";
import request from "supertest";

// Diatur sebelum modul env dimuat, karena env membaca process.env sekali saja
// ketika diimpor dan job penutup hari menolak jalan tanpa rahasia ini.
process.env.CRON_SECRET = "rahasia-cron-yang-panjang";

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

jest.unstable_mockModule("../../src/models/holiday.js", () => ({
  findByDate: jest.fn(),
  findDatesBetween: jest.fn(),
}));

jest.unstable_mockModule("../../src/models/leaveRequest.js", () => ({
  findApprovedCovering: jest.fn(),
}));

jest.unstable_mockModule("../../src/models/workSchedule.js", () => ({
  resolveForEmployee: jest.fn(),
  resolveForAllActive: jest.fn(),
  adalahHariKerja: jest.fn(),
  tanggalKerjaDalamRentang: jest.fn(),
}));

jest.unstable_mockModule("../../src/models/attendance.js", () => ({
  findByEmployeeAndDate: jest.fn(),
  findById: jest.fn(),
  createCheckIn: jest.fn(),
  setCheckOut: jest.fn(),
  listAttendances: jest.fn(),
  summaryFor: jest.fn(),
  monthlyReport: jest.fn(),
  correctAttendance: jest.fn(),
  upsertLeaveDays: jest.fn(),
  deleteLeaveDays: jest.fn(),
  findEmployeeIdsOnDate: jest.fn(),
  findApprovedLeaveOn: jest.fn(),
  insertMarkers: jest.fn(),
}));

jest.unstable_mockModule("../../src/models/attendanceEvent.js", () => ({
  recordEvent: jest.fn(),
  linkToAttendance: jest.fn(),
  markRejected: jest.fn(),
  listEvents: jest.fn(),
}));

jest.unstable_mockModule("../../src/config/logger.js", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const employeeModel = await import("../../src/models/employee.js");
const featureModel = await import("../../src/models/feature.js");
const holidayModel = await import("../../src/models/holiday.js");
const leaveRequestModel = await import("../../src/models/leaveRequest.js");
const workScheduleModel = await import("../../src/models/workSchedule.js");
const attendanceModel = await import("../../src/models/attendance.js");
const eventModel = await import("../../src/models/attendanceEvent.js");
const { createToken } = await import("../../src/helpers/jwt.js");
const { app } = await import("../../src/app.js");

const USER_ID = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";
const POSITION_ID = "33333333-3333-4333-8333-333333333333";
const ATTENDANCE_ID = "44444444-4444-4444-8444-444444444444";
const LEAVE_REQUEST_ID = "55555555-5555-4555-8555-555555555555";

const employeeToken = createToken({
  id: USER_ID,
  email: "karyawan@awan.io",
  role: "employee",
});

const RAHASIA_CRON = "rahasia-cron-yang-panjang";

const fakeEmployee = {
  id: EMPLOYEE_ID,
  user_id: USER_ID,
  employee_number: "001",
  full_name: "Bagus Pratama",
  position_id: POSITION_ID,
  department_id: null,
  manager_id: null,
  employment_status: "permanent",
  is_active: true,
  deleted_at: null,
};

const jadwal = {
  id: "66666666-6666-4666-8666-666666666666",
  name: "Jadwal Kerja Umum",
  department_id: null,
  start_time: "08:00:00",
  end_time: "17:00:00",
  late_tolerance_minutes: 5,
  absent_cutoff_time: "17:00:00",
  works_monday: true,
  works_tuesday: true,
  works_wednesday: true,
  works_thursday: true,
  works_friday: true,
  works_saturday: false,
  works_sunday: false,
  is_active: true,
};

// Waktu dibekukan supaya status hadir dan terlambat tidak bergantung pada kapan
// pengujian dijalankan. Hanya Date yang dipalsukan, karena supertest tetap
// membutuhkan timer sungguhan.
const TIMER_ASLI = [
  "setTimeout",
  "clearTimeout",
  "setInterval",
  "clearInterval",
  "setImmediate",
  "clearImmediate",
  "nextTick",
  "queueMicrotask",
  "performance",
  "hrtime",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "requestIdleCallback",
  "cancelIdleCallback",
] as const;

/** WIB adalah UTC+7, jadi 08:00 WIB sama dengan 01:00 UTC. */
function setWaktuWib(tanggal: string, jam: string) {
  jest.useFakeTimers({ doNotFake: [...TIMER_ASLI] });
  jest.setSystemTime(new Date(`${tanggal}T${jam}:00+07:00`));
}

afterAll(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  jest.clearAllMocks();

  // 2026-03-10 adalah hari Selasa, hari kerja menurut jadwal umum
  setWaktuWib("2026-03-10", "08:00");

  (employeeModel.findByUserId as jest.Mock).mockResolvedValue(
    fakeEmployee as never,
  );
  (featureModel.findCodesByPosition as jest.Mock).mockResolvedValue(
    [] as never,
  );
  (workScheduleModel.resolveForEmployee as jest.Mock).mockResolvedValue(
    jadwal as never,
  );
  (workScheduleModel.adalahHariKerja as jest.Mock).mockReturnValue(
    true as never,
  );
  (holidayModel.findByDate as jest.Mock).mockResolvedValue(null as never);
  (leaveRequestModel.findApprovedCovering as jest.Mock).mockResolvedValue(
    null as never,
  );
  (attendanceModel.findByEmployeeAndDate as jest.Mock).mockResolvedValue(
    null as never,
  );
  (eventModel.recordEvent as jest.Mock).mockImplementation(
    (data) =>
      Promise.resolve({
        id: "77777777-7777-4777-8777-777777777777",
        ...(data as object),
      }) as never,
  );
  (eventModel.linkToAttendance as jest.Mock).mockResolvedValue(
    undefined as never,
  );
  (eventModel.markRejected as jest.Mock).mockResolvedValue(undefined as never);
  (attendanceModel.createCheckIn as jest.Mock).mockImplementation(
    (data) =>
      Promise.resolve({ id: ATTENDANCE_ID, ...(data as object) }) as never,
  );
});

function checkIn() {
  return request(app)
    .post("/api/v1/attendances/check-in")
    .set("Authorization", `Bearer ${employeeToken}`)
    .send({});
}

function checkOut() {
  return request(app)
    .post("/api/v1/attendances/check-out")
    .set("Authorization", `Bearer ${employeeToken}`)
    .send({});
}

describe("absensi masuk", () => {
  it("menolak tamu yang belum login", async () => {
    const res = await request(app)
      .post("/api/v1/attendances/check-in")
      .send({});

    expect(res.status).toBe(401);
  });

  it("mencatat tanggal menurut zona waktu kantor, bukan zona waktu server", async () => {
    // 06:00 WIB masih berada di tanggal UTC kemarin
    setWaktuWib("2026-03-10", "06:00");

    await checkIn();

    const [data] = (attendanceModel.createCheckIn as jest.Mock).mock
      .calls[0] as [{ attendance_date: string }];

    expect(data.attendance_date).toBe("2026-03-10");
  });

  it("menandai hadir ketika datang tepat pada jam masuk", async () => {
    const res = await checkIn();

    expect(res.status).toBe(201);

    const [data] = (attendanceModel.createCheckIn as jest.Mock).mock
      .calls[0] as [{ status: string; late_minutes: number }];

    expect(data.status).toBe("present");
    expect(data.late_minutes).toBe(0);
  });

  it("menandai hadir tepat pada batas toleransi", async () => {
    // toleransi 5 menit, datang 08:05 masih terhitung tepat waktu
    setWaktuWib("2026-03-10", "08:05");

    await checkIn();

    const [data] = (attendanceModel.createCheckIn as jest.Mock).mock
      .calls[0] as [{ status: string; late_minutes: number }];

    expect(data.status).toBe("present");
    expect(data.late_minutes).toBe(0);
  });

  it("menandai terlambat satu menit setelah batas toleransi", async () => {
    setWaktuWib("2026-03-10", "08:06");

    await checkIn();

    const [data] = (attendanceModel.createCheckIn as jest.Mock).mock
      .calls[0] as [{ status: string; late_minutes: number }];

    expect(data.status).toBe("late");
  });

  it("menghitung keterlambatan dari jam masuk, bukan dari ujung toleransi", async () => {
    setWaktuWib("2026-03-10", "08:30");

    await checkIn();

    const [data] = (attendanceModel.createCheckIn as jest.Mock).mock
      .calls[0] as [{ late_minutes: number }];

    // 30 menit dari jam masuk 08:00, bukan 25 menit dari toleransi 08:05
    expect(data.late_minutes).toBe(30);
  });

  it("menyebutkan besar keterlambatan pada pesannya", async () => {
    setWaktuWib("2026-03-10", "08:30");

    const res = await checkIn();

    expect(res.body.message).toContain("terlambat 30 menit");
  });

  it("menolak absen masuk kedua sambil menyebut jam absen sebelumnya", async () => {
    (attendanceModel.findByEmployeeAndDate as jest.Mock).mockResolvedValue({
      id: ATTENDANCE_ID,
      status: "present",
      check_in_at: new Date("2026-03-10T01:00:00Z"),
      check_out_at: null,
    } as never);

    const res = await checkIn();

    expect(res.status).toBe(409);
    expect(res.body.message).toContain("08:00");
  });

  it("menolak absen pada hari yang bukan hari kerja", async () => {
    (workScheduleModel.adalahHariKerja as jest.Mock).mockReturnValue(
      false as never,
    );

    const res = await checkIn();

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("bukan hari kerja");
  });

  it("menolak absen pada hari libur sambil menyebut namanya", async () => {
    (holidayModel.findByDate as jest.Mock).mockResolvedValue({
      id: "77777777-7777-4777-8777-777777777777",
      holiday_date: "2026-03-10",
      name: "Hari Raya Nyepi",
    } as never);

    const res = await checkIn();

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Hari Raya Nyepi");
  });

  it("menolak absen saat sedang menjalani cuti yang disetujui", async () => {
    (leaveRequestModel.findApprovedCovering as jest.Mock).mockResolvedValue({
      id: LEAVE_REQUEST_ID,
      status: "approved",
    } as never);

    const res = await checkIn();

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("cuti");
  });

  it("menolak akun yang belum terhubung ke data karyawan", async () => {
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue(null as never);

    const res = await checkIn();

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("belum terhubung ke data karyawan");
  });

  it("menolak karyawan yang sudah dinonaktifkan", async () => {
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue({
      ...fakeEmployee,
      is_active: false,
    } as never);

    const res = await checkIn();

    expect(res.status).toBe(403);
  });

  it("menolak karyawan yang sudah mengundurkan diri", async () => {
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue({
      ...fakeEmployee,
      employment_status: "resigned",
    } as never);

    const res = await checkIn();

    expect(res.status).toBe(403);
    expect(res.body.message).toContain("mengundurkan diri");
  });

  it("menolak absen ketika belum ada jadwal kerja yang berlaku", async () => {
    (workScheduleModel.resolveForEmployee as jest.Mock).mockResolvedValue(
      null as never,
    );

    const res = await checkIn();

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("jadwal kerja");
  });
});

describe("absensi pulang", () => {
  const absensiMasuk = {
    id: ATTENDANCE_ID,
    employee_id: EMPLOYEE_ID,
    attendance_date: "2026-03-10",
    status: "present",
    check_in_at: new Date("2026-03-10T01:00:00Z"),
    check_out_at: null,
  };

  beforeEach(() => {
    (attendanceModel.setCheckOut as jest.Mock).mockImplementation(
      (id, check_out_at, _recorded_at, _source, work_minutes) =>
        Promise.resolve({
          ...absensiMasuk,
          id,
          check_out_at,
          work_minutes,
        }) as never,
    );
  });

  it("menolak absen pulang tanpa absen masuk lebih dulu", async () => {
    const res = await checkOut();

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("belum melakukan absensi masuk");
  });

  it("menolak absen pulang pada baris yang tidak punya jam masuk", async () => {
    (attendanceModel.findByEmployeeAndDate as jest.Mock).mockResolvedValue({
      ...absensiMasuk,
      status: "leave",
      check_in_at: null,
    } as never);

    const res = await checkOut();

    expect(res.status).toBe(400);
  });

  it("menghitung durasi kerja dari jam masuk sampai jam pulang", async () => {
    (attendanceModel.findByEmployeeAndDate as jest.Mock).mockResolvedValue(
      absensiMasuk as never,
    );
    setWaktuWib("2026-03-10", "17:00");

    const res = await checkOut();

    expect(res.status).toBe(200);

    const [, , , , menitKerja] = (attendanceModel.setCheckOut as jest.Mock).mock
      .calls[0] as [string, Date, Date, string, number];

    // 08:00 sampai 17:00 adalah 9 jam
    expect(menitKerja).toBe(540);
  });

  it("menyebutkan total jam kerja pada pesannya", async () => {
    (attendanceModel.findByEmployeeAndDate as jest.Mock).mockResolvedValue(
      absensiMasuk as never,
    );
    setWaktuWib("2026-03-10", "16:30");

    const res = await checkOut();

    expect(res.body.message).toContain("8 jam 30 menit");
  });

  it("menolak absen pulang kedua sambil menyebut jam sebelumnya", async () => {
    (attendanceModel.findByEmployeeAndDate as jest.Mock).mockResolvedValue({
      ...absensiMasuk,
      check_out_at: new Date("2026-03-10T10:00:00Z"),
    } as never);
    setWaktuWib("2026-03-10", "18:00");

    const res = await checkOut();

    expect(res.status).toBe(409);
    expect(res.body.message).toContain("17:00");
  });

  it("menolak absen pulang sebelum jam kerja dimulai", async () => {
    (attendanceModel.findByEmployeeAndDate as jest.Mock).mockResolvedValue({
      ...absensiMasuk,
      check_in_at: new Date("2026-03-09T23:00:00Z"),
    } as never);
    setWaktuWib("2026-03-10", "07:00");

    const res = await checkOut();

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("sebelum jam kerja dimulai");
  });

  it("melaporkan bentrok ketika absen pulang sudah dicatat permintaan lain", async () => {
    (attendanceModel.findByEmployeeAndDate as jest.Mock).mockResolvedValue(
      absensiMasuk as never,
    );
    (attendanceModel.setCheckOut as jest.Mock).mockResolvedValue(null as never);
    setWaktuWib("2026-03-10", "17:00");

    const res = await checkOut();

    expect(res.status).toBe(409);
  });
});

describe("ringkasan hari ini", () => {
  it("memberi tahu bahwa absen masuk masih mungkin dilakukan", async () => {
    const res = await request(app)
      .get("/api/v1/attendances/today")
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.date).toBe("2026-03-10");
    expect(res.body.data.can_check_in).toBe(true);
    expect(res.body.data.can_check_out).toBe(false);
    expect(res.body.data.blocked_reason).toBeNull();
  });

  it("menutup absen masuk dan membuka absen pulang setelah check-in", async () => {
    (attendanceModel.findByEmployeeAndDate as jest.Mock).mockResolvedValue({
      id: ATTENDANCE_ID,
      check_in_at: new Date("2026-03-10T01:00:00Z"),
      check_out_at: null,
    } as never);

    const res = await request(app)
      .get("/api/v1/attendances/today")
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.body.data.can_check_in).toBe(false);
    expect(res.body.data.can_check_out).toBe(true);
  });

  it("menyebutkan alasan ketika hari itu tidak dapat diabsen", async () => {
    (workScheduleModel.adalahHariKerja as jest.Mock).mockReturnValue(
      false as never,
    );

    const res = await request(app)
      .get("/api/v1/attendances/today")
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.body.data.can_check_in).toBe(false);
    expect(res.body.data.blocked_reason).toContain("bukan hari kerja");
  });
});

describe("riwayat dan daftar", () => {
  beforeEach(() => {
    (attendanceModel.listAttendances as jest.Mock).mockResolvedValue({
      rows: [],
      total: 0,
    } as never);
    (attendanceModel.summaryFor as jest.Mock).mockResolvedValue({
      present: 18,
      late: 2,
      absent: 1,
      leave: 0,
      holiday: 1,
      total_late_minutes: 25,
      total_work_minutes: 9600,
    } as never);
  });

  it("memakai bulan berjalan menurut zona waktu kantor bila tidak disebutkan", async () => {
    const res = await request(app)
      .get("/api/v1/attendances/me")
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.period).toMatchObject({
      month: 3,
      year: 2026,
      start_date: "2026-03-01",
      end_date: "2026-03-31",
    });
  });

  it("menghormati bulan dan tahun yang diminta", async () => {
    const res = await request(app)
      .get("/api/v1/attendances/me?month=2&year=2024")
      .set("Authorization", `Bearer ${employeeToken}`);

    // 2024 tahun kabisat, jadi Februari berakhir pada tanggal 29
    expect(res.body.period.end_date).toBe("2024-02-29");
  });

  it("menyertakan rekap kehadiran bersama daftarnya", async () => {
    const res = await request(app)
      .get("/api/v1/attendances/me")
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.body.summary.present).toBe(18);
    expect(res.body.summary.total_late_minutes).toBe(25);
  });

  it("membatasi riwayat pada karyawan yang sedang login", async () => {
    await request(app)
      .get("/api/v1/attendances/me")
      .set("Authorization", `Bearer ${employeeToken}`);

    const [params] = (attendanceModel.listAttendances as jest.Mock).mock
      .calls[0] as [{ employee_id: string }];

    expect(params.employee_id).toBe(EMPLOYEE_ID);
  });

  it("menolak daftar seluruh karyawan tanpa fitur attendance.view_all", async () => {
    const res = await request(app)
      .get("/api/v1/attendances")
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
    expect(res.body.details.required_feature).toBe("attendance.view_all");
  });

  it("mengizinkan daftar seluruh karyawan bagi pemegang fiturnya", async () => {
    (featureModel.findCodesByPosition as jest.Mock).mockResolvedValue([
      "attendance.view_all",
    ] as never);

    const res = await request(app)
      .get("/api/v1/attendances")
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(200);
  });

  it("menolak daftar tim tanpa fitur attendance.view_team", async () => {
    const res = await request(app)
      .get("/api/v1/attendances/team")
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
    expect(res.body.details.required_feature).toBe("attendance.view_team");
  });

  it("membatasi daftar tim pada bawahan langsung meski klien mengirim filter lain", async () => {
    (featureModel.findCodesByPosition as jest.Mock).mockResolvedValue([
      "attendance.view_team",
    ] as never);

    await request(app)
      .get(`/api/v1/attendances/team?employee_id=${LEAVE_REQUEST_ID}`)
      .set("Authorization", `Bearer ${employeeToken}`);

    const [params] = (attendanceModel.listAttendances as jest.Mock).mock
      .calls[0] as [{ manager_id: string }];

    expect(params.manager_id).toBe(EMPLOYEE_ID);
  });

  it("menolak rentang tanggal yang terbalik", async () => {
    (featureModel.findCodesByPosition as jest.Mock).mockResolvedValue([
      "attendance.view_all",
    ] as never);

    const res = await request(app)
      .get("/api/v1/attendances?start_date=2026-03-10&end_date=2026-03-01")
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(400);
  });
});

describe("laporan bulanan", () => {
  beforeEach(() => {
    (attendanceModel.monthlyReport as jest.Mock).mockResolvedValue([] as never);
  });

  it("menolak tanpa fitur attendance.report", async () => {
    const res = await request(app)
      .get("/api/v1/attendances/report")
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
    expect(res.body.details.required_feature).toBe("attendance.report");
  });

  it("memakai rentang satu bulan penuh", async () => {
    (featureModel.findCodesByPosition as jest.Mock).mockResolvedValue([
      "attendance.report",
    ] as never);

    const res = await request(app)
      .get("/api/v1/attendances/report?month=3&year=2026")
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(200);
    expect(attendanceModel.monthlyReport).toHaveBeenCalledWith(
      "2026-03-01",
      "2026-03-31",
      undefined,
    );
  });
});

describe("koreksi absensi", () => {
  const absensiLama = {
    id: ATTENDANCE_ID,
    employee_id: EMPLOYEE_ID,
    attendance_date: "2026-03-09",
    status: "absent",
    check_in_at: null,
    check_out_at: null,
    late_minutes: 0,
    work_minutes: null,
  };

  const alasan = "Mesin absensi bermasalah pada pagi hari";

  function koreksi(body: Record<string, unknown>) {
    return request(app)
      .patch(`/api/v1/attendances/${ATTENDANCE_ID}/correct`)
      .set("Authorization", `Bearer ${employeeToken}`)
      .send(body);
  }

  beforeEach(() => {
    (featureModel.findCodesByPosition as jest.Mock).mockResolvedValue([
      "attendance.correct",
    ] as never);
    (attendanceModel.findById as jest.Mock).mockResolvedValue(
      absensiLama as never,
    );
    (attendanceModel.correctAttendance as jest.Mock).mockImplementation(
      (id, data) => Promise.resolve({ id, ...(data as object) }) as never,
    );
  });

  it("menolak tanpa fitur attendance.correct", async () => {
    (featureModel.findCodesByPosition as jest.Mock).mockResolvedValue(
      [] as never,
    );

    const res = await koreksi({
      status: "present",
      check_in_at: "2026-03-09T01:00:00Z",
      reason: alasan,
    });

    expect(res.status).toBe(403);
    expect(res.body.details.required_feature).toBe("attendance.correct");
  });

  it("mewajibkan alasan koreksi", async () => {
    const res = await koreksi({
      status: "present",
      check_in_at: "2026-03-09T01:00:00Z",
    });

    expect(res.status).toBe(400);
    expect(
      res.body.errors.some((e: { field: string }) => e.field === "reason"),
    ).toBe(true);
  });

  it("menolak alasan yang terlalu pendek", async () => {
    const res = await koreksi({
      status: "present",
      check_in_at: "2026-03-09T01:00:00Z",
      reason: "salah",
    });

    expect(res.status).toBe(400);
  });

  it("mencatat nama pengoreksi dan waktunya pada catatan", async () => {
    const res = await koreksi({
      status: "present",
      check_in_at: "2026-03-09T01:00:00Z",
      reason: alasan,
    });

    expect(res.status).toBe(200);

    const [, data] = (attendanceModel.correctAttendance as jest.Mock).mock
      .calls[0] as [string, { note: string }];

    expect(data.note).toContain("Bagus Pratama");
    expect(data.note).toContain("001");
    expect(data.note).toContain("2026-03-10");
    expect(data.note).toContain(alasan);
  });

  it("menghitung ulang keterlambatan dari jadwal, bukan dari kiriman klien", async () => {
    await koreksi({
      status: "late",
      check_in_at: "2026-03-09T02:00:00Z",
      late_minutes: 999,
      reason: alasan,
    });

    const [, data] = (attendanceModel.correctAttendance as jest.Mock).mock
      .calls[0] as [string, { late_minutes: number }];

    // 09:00 WIB terhadap jam masuk 08:00 berarti terlambat 60 menit
    expect(data.late_minutes).toBe(60);
  });

  it("mengosongkan jam masuk ketika status diubah menjadi tidak hadir", async () => {
    await koreksi({ status: "absent", reason: alasan });

    const [, data] = (attendanceModel.correctAttendance as jest.Mock).mock
      .calls[0] as [string, { check_in_at: Date | null; late_minutes: number }];

    expect(data.check_in_at).toBeNull();
    expect(data.late_minutes).toBe(0);
  });

  it("menolak status hadir tanpa jam masuk", async () => {
    const res = await koreksi({ status: "present", reason: alasan });

    expect(res.status).toBe(400);
  });

  it("menolak status tidak hadir yang disertai jam masuk", async () => {
    const res = await koreksi({
      status: "absent",
      check_in_at: "2026-03-09T01:00:00Z",
      reason: alasan,
    });

    expect(res.status).toBe(400);
  });

  it("menolak jam pulang yang mendahului jam masuk", async () => {
    const res = await koreksi({
      status: "present",
      check_in_at: "2026-03-09T10:00:00Z",
      check_out_at: "2026-03-09T01:00:00Z",
      reason: alasan,
    });

    expect(res.status).toBe(400);
  });

  it("menghitung durasi kerja dari jam yang dikoreksi", async () => {
    await koreksi({
      status: "present",
      check_in_at: "2026-03-09T01:00:00Z",
      check_out_at: "2026-03-09T10:00:00Z",
      reason: alasan,
    });

    const [, data] = (attendanceModel.correctAttendance as jest.Mock).mock
      .calls[0] as [string, { work_minutes: number }];

    expect(data.work_minutes).toBe(540);
  });

  it("menolak absensi yang tidak ditemukan", async () => {
    (attendanceModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await koreksi({
      status: "present",
      check_in_at: "2026-03-09T01:00:00Z",
      reason: alasan,
    });

    expect(res.status).toBe(404);
  });
});

describe("job penutup hari", () => {
  const KARYAWAN_LAIN = "88888888-8888-4888-8888-888888888888";
  const KARYAWAN_KETIGA = "99999999-9999-4999-8999-999999999999";

  function tutupHari(tanggal = "2026-03-10", rahasia?: string) {
    const req = request(app).post(
      `/api/v1/attendances/close-day?date=${tanggal}`,
    );

    if (rahasia !== undefined) req.set("x-cron-secret", rahasia);

    return req.send({});
  }

  beforeEach(() => {
    (workScheduleModel.resolveForAllActive as jest.Mock).mockResolvedValue([
      { employee_id: EMPLOYEE_ID, schedule: jadwal },
      { employee_id: KARYAWAN_LAIN, schedule: jadwal },
      { employee_id: KARYAWAN_KETIGA, schedule: jadwal },
    ] as never);
    (attendanceModel.findEmployeeIdsOnDate as jest.Mock).mockResolvedValue(
      [] as never,
    );
    (attendanceModel.findApprovedLeaveOn as jest.Mock).mockResolvedValue(
      [] as never,
    );
    (attendanceModel.insertMarkers as jest.Mock).mockImplementation(
      (_db, _tanggal, rows) =>
        Promise.resolve((rows as unknown[]).length) as never,
    );
    mockClient.query.mockResolvedValue({ rows: [] } as never);
  });

  it("menolak permintaan tanpa header rahasia", async () => {
    const res = await tutupHari();

    expect(res.status).toBe(401);
    expect(attendanceModel.insertMarkers).not.toHaveBeenCalled();
  });

  it("menolak rahasia yang tidak cocok", async () => {
    const res = await tutupHari("2026-03-10", "rahasia-yang-salah-sekali");

    expect(res.status).toBe(401);
    expect(attendanceModel.insertMarkers).not.toHaveBeenCalled();
  });

  it("tidak memerlukan token login karena dipanggil penjadwal", async () => {
    const res = await tutupHari("2026-03-10", RAHASIA_CRON);

    expect(res.status).toBe(200);
  });

  it("menandai tidak hadir bagi karyawan tanpa baris absensi", async () => {
    const res = await tutupHari("2026-03-10", RAHASIA_CRON);

    expect(res.body.data.marked).toEqual({
      holiday: 0,
      leave: 0,
      absent: 3,
    });
  });

  it("mendahulukan hari libur daripada cuti dan tidak hadir", async () => {
    (holidayModel.findByDate as jest.Mock).mockResolvedValue({
      name: "Hari Raya Nyepi",
    } as never);
    (attendanceModel.findApprovedLeaveOn as jest.Mock).mockResolvedValue([
      { employee_id: EMPLOYEE_ID, leave_request_id: LEAVE_REQUEST_ID },
    ] as never);

    const res = await tutupHari("2026-03-10", RAHASIA_CRON);

    expect(res.body.data.marked).toEqual({
      holiday: 3,
      leave: 0,
      absent: 0,
    });
    expect(res.body.data.holiday_name).toBe("Hari Raya Nyepi");
  });

  it("mendahulukan cuti daripada tidak hadir", async () => {
    (attendanceModel.findApprovedLeaveOn as jest.Mock).mockResolvedValue([
      { employee_id: EMPLOYEE_ID, leave_request_id: LEAVE_REQUEST_ID },
    ] as never);

    const res = await tutupHari("2026-03-10", RAHASIA_CRON);

    expect(res.body.data.marked).toEqual({
      holiday: 0,
      leave: 1,
      absent: 2,
    });

    const [, , rows] = (attendanceModel.insertMarkers as jest.Mock).mock
      .calls[0] as [unknown, string, { employee_id: string; status: string }[]];

    expect(rows[0]).toMatchObject({
      employee_id: EMPLOYEE_ID,
      status: "leave",
      leave_request_id: LEAVE_REQUEST_ID,
    });
  });

  it("melewati karyawan yang sudah punya baris absensi", async () => {
    (attendanceModel.findEmployeeIdsOnDate as jest.Mock).mockResolvedValue([
      EMPLOYEE_ID,
      KARYAWAN_LAIN,
    ] as never);

    const res = await tutupHari("2026-03-10", RAHASIA_CRON);

    expect(res.body.data.skipped).toBe(2);
    expect(res.body.data.marked.absent).toBe(1);
  });

  it("tidak mengubah apa pun ketika dijalankan ulang pada hari yang sama", async () => {
    // pemanggilan kedua menemukan seluruh karyawan sudah punya baris
    (attendanceModel.findEmployeeIdsOnDate as jest.Mock).mockResolvedValue([
      EMPLOYEE_ID,
      KARYAWAN_LAIN,
      KARYAWAN_KETIGA,
    ] as never);

    const res = await tutupHari("2026-03-10", RAHASIA_CRON);

    expect(res.status).toBe(200);
    expect(res.body.data.created).toBe(0);
    expect(res.body.data.skipped).toBe(3);
    expect(attendanceModel.insertMarkers).not.toHaveBeenCalled();
  });

  it("tidak membuat baris apa pun pada hari yang bukan hari kerja", async () => {
    (workScheduleModel.adalahHariKerja as jest.Mock).mockReturnValue(
      false as never,
    );

    const res = await tutupHari("2026-03-14", RAHASIA_CRON);

    expect(res.body.data.created).toBe(0);
    expect(res.body.data.skipped).toBe(3);
  });

  it("tetap menandai libur nasional yang jatuh pada akhir pekan", async () => {
    (workScheduleModel.adalahHariKerja as jest.Mock).mockReturnValue(
      false as never,
    );
    (holidayModel.findByDate as jest.Mock).mockResolvedValue({
      name: "Tahun Baru",
    } as never);

    const res = await tutupHari("2026-03-14", RAHASIA_CRON);

    expect(res.body.data.marked.holiday).toBe(3);
  });

  it("menulis penanda di dalam transaksi", async () => {
    await tutupHari("2026-03-10", RAHASIA_CRON);

    expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
    expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
    expect(mockClient.release).toHaveBeenCalled();
  });

  it("membatalkan transaksi ketika penyimpanan gagal", async () => {
    (attendanceModel.insertMarkers as jest.Mock).mockRejectedValue(
      new Error("koneksi putus") as never,
    );

    const res = await tutupHari("2026-03-10", RAHASIA_CRON);

    expect(res.status).toBe(500);
    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    expect(mockClient.release).toHaveBeenCalled();
  });

  it("memakai tanggal hari ini menurut zona waktu kantor bila tidak disebutkan", async () => {
    const res = await request(app)
      .post("/api/v1/attendances/close-day")
      .set("x-cron-secret", RAHASIA_CRON)
      .send({});

    expect(res.body.data.date).toBe("2026-03-10");
  });

  it("menolak format tanggal yang tidak valid", async () => {
    const res = await tutupHari("bukan-tanggal", RAHASIA_CRON);

    expect(res.status).toBe(400);
  });
});

describe("batas absen masuk", () => {
  const jadwalKetat = { ...jadwal, absent_cutoff_time: "08:10:00" };

  beforeEach(() => {
    (workScheduleModel.resolveForEmployee as jest.Mock).mockResolvedValue(
      jadwalKetat as never,
    );
  });

  it("pukul 08:00 sampai 08:05 tercatat hadir", async () => {
    for (const jam of ["08:00", "08:03", "08:05"]) {
      (attendanceModel.createCheckIn as jest.Mock).mockClear();
      setWaktuWib("2026-03-10", jam);

      await checkIn();

      const [data] = (attendanceModel.createCheckIn as jest.Mock).mock
        .calls[0] as [{ status: string; late_minutes: number }];

      expect(data.status).toBe("present");
      expect(data.late_minutes).toBe(0);
    }
  });

  it("pukul 08:06 sampai 08:10 tercatat terlambat", async () => {
    for (const [jam, menit] of [
      ["08:06", 6],
      ["08:09", 9],
      ["08:10", 10],
    ] as [string, number][]) {
      (attendanceModel.createCheckIn as jest.Mock).mockClear();
      setWaktuWib("2026-03-10", jam);

      const res = await checkIn();

      expect(res.status).toBe(201);

      const [data] = (attendanceModel.createCheckIn as jest.Mock).mock
        .calls[0] as [{ status: string; late_minutes: number }];

      expect(data.status).toBe("late");
      expect(data.late_minutes).toBe(menit);
    }
  });

  it("tepat pada batas 08:10 masih diterima sebagai terlambat", async () => {
    setWaktuWib("2026-03-10", "08:10");

    const res = await checkIn();

    expect(res.status).toBe(201);
  });

  it("lewat satu menit dari batas sudah ditolak", async () => {
    setWaktuWib("2026-03-10", "08:11");

    const res = await checkIn();

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("08:10");
    expect(res.body.message).toContain("tidak hadir");
    expect(attendanceModel.createCheckIn).not.toHaveBeenCalled();
  });

  it("datang jauh setelah batas tetap ditolak", async () => {
    setWaktuWib("2026-03-10", "14:00");

    const res = await checkIn();

    expect(res.status).toBe(400);
    expect(attendanceModel.createCheckIn).not.toHaveBeenCalled();
  });

  it("tidak menyimpan baris apa pun ketika ditolak, penandaan diserahkan ke job penutup hari", async () => {
    setWaktuWib("2026-03-10", "09:00");

    await checkIn();

    expect(attendanceModel.createCheckIn).not.toHaveBeenCalled();
  });

  it("absensi yang sudah tercatat tetap dilaporkan sebagai bentrok, bukan sebagai ditutup", async () => {
    setWaktuWib("2026-03-10", "09:00");
    (attendanceModel.findByEmployeeAndDate as jest.Mock).mockResolvedValue({
      id: ATTENDANCE_ID,
      status: "present",
      check_in_at: new Date("2026-03-10T01:00:00Z"),
      check_out_at: null,
    } as never);

    const res = await checkIn();

    expect(res.status).toBe(409);
  });

  it("ringkasan hari ini menutup tombol absen setelah lewat batas", async () => {
    setWaktuWib("2026-03-10", "08:11");

    const res = await request(app)
      .get("/api/v1/attendances/today")
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.body.data.can_check_in).toBe(false);
    expect(res.body.data.blocked_reason).toContain("08:10");
  });

  it("ringkasan hari ini masih membuka tombol absen sebelum batas", async () => {
    setWaktuWib("2026-03-10", "08:09");

    const res = await request(app)
      .get("/api/v1/attendances/today")
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.body.data.can_check_in).toBe(true);
    expect(res.body.data.blocked_reason).toBeNull();
  });

  it("yang sudah absen tidak diberi tahu soal batas yang terlewat", async () => {
    setWaktuWib("2026-03-10", "09:00");
    (attendanceModel.findByEmployeeAndDate as jest.Mock).mockResolvedValue({
      id: ATTENDANCE_ID,
      check_in_at: new Date("2026-03-10T01:00:00Z"),
      check_out_at: null,
    } as never);

    const res = await request(app)
      .get("/api/v1/attendances/today")
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.body.data.blocked_reason).toBeNull();
    expect(res.body.data.can_check_out).toBe(true);
  });
});

describe("absen offline yang disinkronkan setelah online kembali", () => {
  const jadwalKetat = { ...jadwal, absent_cutoff_time: "08:10:00" };

  function checkInOffline(offline_time: string, note?: string) {
    return request(app)
      .post("/api/v1/attendances/check-in")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send(note ? { offline_time, note } : { offline_time });
  }

  beforeEach(() => {
    (workScheduleModel.resolveForEmployee as jest.Mock).mockResolvedValue(
      jadwalKetat as never,
    );
  });

  it("karyawan yang menekan tombol tepat waktu tidak dihitung terlambat meski sinkronisasi telat", () => {
    return (async () => {
      setWaktuWib("2026-03-10", "09:30");

      const res = await checkInOffline("2026-03-10T07:58:00+07:00");

      expect(res.status).toBe(201);

      const [data] = (attendanceModel.createCheckIn as jest.Mock).mock
        .calls[0] as [{ status: string; late_minutes: number }];

      expect(data.status).toBe("present");
      expect(data.late_minutes).toBe(0);
    })();
  });

  it("menyimpan jam absen yang diklaim, bukan jam server saat diterima", async () => {
    setWaktuWib("2026-03-10", "09:30");

    await checkInOffline("2026-03-10T07:58:00+07:00");

    const [data] = (attendanceModel.createCheckIn as jest.Mock).mock
      .calls[0] as [{ check_in_at: Date }];

    expect(new Date(data.check_in_at).toISOString()).toBe(
      "2026-03-10T00:58:00.000Z",
    );
  });

  it("menandai absensi offline pada catatannya beserta jam terima server", async () => {
    setWaktuWib("2026-03-10", "09:30");

    await checkInOffline("2026-03-10T07:58:00+07:00");

    const [data] = (attendanceModel.createCheckIn as jest.Mock).mock
      .calls[0] as [{ note: string }];

    expect(data.note).toContain("Absen offline pukul 07:58");
    expect(data.note).toContain("diterima server 09:30");
  });

  it("mempertahankan catatan asli karyawan di belakang penanda", async () => {
    setWaktuWib("2026-03-10", "09:30");

    await checkInOffline("2026-03-10T07:58:00+07:00", "Jaringan kantor mati");

    const [data] = (attendanceModel.createCheckIn as jest.Mock).mock
      .calls[0] as [{ note: string }];

    expect(data.note).toContain("Jaringan kantor mati");
  });

  it("tetap terhitung terlambat bila jam offline memang melewati toleransi", async () => {
    setWaktuWib("2026-03-10", "11:00");

    await checkInOffline("2026-03-10T08:08:00+07:00");

    const [data] = (attendanceModel.createCheckIn as jest.Mock).mock
      .calls[0] as [{ status: string; late_minutes: number }];

    expect(data.status).toBe("late");
    expect(data.late_minutes).toBe(8);
  });

  it("tetap ditolak bila jam offline sudah melewati batas absen", async () => {
    setWaktuWib("2026-03-10", "11:00");

    const res = await checkInOffline("2026-03-10T08:30:00+07:00");

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("08:10");
    expect(attendanceModel.createCheckIn).not.toHaveBeenCalled();
  });

  it("menolak waktu offline yang berada di masa depan", async () => {
    setWaktuWib("2026-03-10", "08:00");

    const res = await checkInOffline("2026-03-10T09:00:00+07:00");

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("masa depan");
    expect(attendanceModel.createCheckIn).not.toHaveBeenCalled();
  });

  it("menolak sinkronisasi yang melewati batas enam jam", async () => {
    setWaktuWib("2026-03-10", "16:00");

    const res = await checkInOffline("2026-03-10T08:00:00+07:00");

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("paling lambat");
  });

  it("menolak absen offline milik hari sebelumnya", async () => {
    setWaktuWib("2026-03-10", "01:00");

    const res = await checkInOffline("2026-03-09T23:30:00+07:00");

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("hari yang sama");
  });

  it("menolak format waktu yang tidak sah sebelum menyentuh basis data", async () => {
    setWaktuWib("2026-03-10", "09:00");

    const res = await checkInOffline("10 Maret 2026 jam 8 pagi");

    expect(res.status).toBe(400);
    expect(attendanceModel.findByEmployeeAndDate).not.toHaveBeenCalled();
  });

  it("tidak pernah menimpa absensi yang sudah tercatat", async () => {
    setWaktuWib("2026-03-10", "09:30");
    (attendanceModel.findByEmployeeAndDate as jest.Mock).mockResolvedValue({
      id: ATTENDANCE_ID,
      status: "absent",
      check_in_at: null,
      check_out_at: null,
    } as never);

    const res = await checkInOffline("2026-03-10T07:58:00+07:00");

    expect(res.status).toBe(409);
    expect(attendanceModel.createCheckIn).not.toHaveBeenCalled();
  });

  it("mengembalikan absensi yang sudah ada agar antrean di perangkat dapat dibersihkan", async () => {
    setWaktuWib("2026-03-10", "09:30");
    const tersimpan = {
      id: ATTENDANCE_ID,
      status: "present",
      check_in_at: new Date("2026-03-10T00:58:00Z"),
      check_out_at: null,
    };
    (attendanceModel.findByEmployeeAndDate as jest.Mock).mockResolvedValue(
      tersimpan as never,
    );

    const res = await checkInOffline("2026-03-10T07:58:00+07:00");

    expect(res.status).toBe(409);
    expect(res.body.details.attendance.check_in_at).toBe(
      "2026-03-10T00:58:00.000Z",
    );
  });

  it("menghormati hari libur walaupun absennya offline", async () => {
    setWaktuWib("2026-03-10", "09:30");
    (holidayModel.findByDate as jest.Mock).mockResolvedValue({
      name: "Hari Raya Nyepi",
    } as never);

    const res = await checkInOffline("2026-03-10T07:58:00+07:00");

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Hari Raya Nyepi");
  });

  it("absen masuk tanpa offline_time tetap memakai jam server", async () => {
    setWaktuWib("2026-03-10", "08:00");

    await checkIn();

    const [data] = (attendanceModel.createCheckIn as jest.Mock).mock
      .calls[0] as [{ note: string | null }];

    expect(data.note).toBeNull();
  });
});

describe("absen pulang offline", () => {
  const absensiMasuk = {
    id: ATTENDANCE_ID,
    employee_id: EMPLOYEE_ID,
    attendance_date: "2026-03-10",
    status: "present",
    check_in_at: new Date("2026-03-10T01:00:00Z"),
    check_out_at: null,
  };

  function checkOutOffline(offline_time: string) {
    return request(app)
      .post("/api/v1/attendances/check-out")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ offline_time });
  }

  beforeEach(() => {
    (attendanceModel.findByEmployeeAndDate as jest.Mock).mockResolvedValue(
      absensiMasuk as never,
    );
    (attendanceModel.setCheckOut as jest.Mock).mockImplementation(
      (id, check_out_at, _recorded_at, _source, work_minutes) =>
        Promise.resolve({
          ...absensiMasuk,
          id,
          check_out_at,
          work_minutes,
        }) as never,
    );
  });

  it("menghitung durasi kerja dari jam offline, bukan jam sinkronisasi", async () => {
    setWaktuWib("2026-03-10", "19:00");

    const res = await checkOutOffline("2026-03-10T17:00:00+07:00");

    expect(res.status).toBe(200);

    const [, , , , menitKerja] = (attendanceModel.setCheckOut as jest.Mock).mock
      .calls[0] as [string, Date, Date, string, number];

    expect(menitKerja).toBe(540);
  });

  it("menolak jam pulang offline yang mendahului jam masuk", async () => {
    setWaktuWib("2026-03-10", "12:00");

    const res = await checkOutOffline("2026-03-10T07:30:00+07:00");

    expect(res.status).toBe(400);
    expect(attendanceModel.setCheckOut).not.toHaveBeenCalled();
  });

  it("menolak jam pulang offline yang berada di masa depan", async () => {
    setWaktuWib("2026-03-10", "17:00");

    const res = await checkOutOffline("2026-03-10T18:00:00+07:00");

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("masa depan");
  });
});

describe("saksi server pada setiap pencatatan", () => {
  it("absen masuk online ditandai sumber online", async () => {
    setWaktuWib("2026-03-10", "08:00");

    await checkIn();

    const [data] = (attendanceModel.createCheckIn as jest.Mock).mock
      .calls[0] as [{ check_in_source: string; check_in_recorded_at: Date }];

    expect(data.check_in_source).toBe("online");
    expect(new Date(data.check_in_recorded_at).toISOString()).toBe(
      "2026-03-10T01:00:00.000Z",
    );
  });

  it("absen masuk offline ditandai sumber offline_sync", async () => {
    setWaktuWib("2026-03-10", "09:30");

    await request(app)
      .post("/api/v1/attendances/check-in")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ offline_time: "2026-03-10T07:58:00+07:00" });

    const [data] = (attendanceModel.createCheckIn as jest.Mock).mock
      .calls[0] as [{ check_in_source: string; check_in_recorded_at: Date }];

    expect(data.check_in_source).toBe("offline_sync");
    expect(new Date(data.check_in_recorded_at).toISOString()).toBe(
      "2026-03-10T02:30:00.000Z",
    );
  });

  it("waktu terima selalu jam server, bukan jam yang diklaim perangkat", async () => {
    setWaktuWib("2026-03-10", "09:30");

    await request(app)
      .post("/api/v1/attendances/check-in")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ offline_time: "2026-03-10T07:58:00+07:00" });

    const [data] = (attendanceModel.createCheckIn as jest.Mock).mock
      .calls[0] as [{ check_in_at: Date; check_in_recorded_at: Date }];

    expect(new Date(data.check_in_recorded_at).getTime()).toBeGreaterThan(
      new Date(data.check_in_at).getTime(),
    );
  });

  it("absen pulang mencatat sumbernya sendiri, terpisah dari absen masuk", async () => {
    (attendanceModel.findByEmployeeAndDate as jest.Mock).mockResolvedValue({
      id: ATTENDANCE_ID,
      attendance_date: "2026-03-10",
      status: "present",
      check_in_at: new Date("2026-03-10T01:00:00Z"),
      check_in_source: "offline_sync",
      check_out_at: null,
    } as never);
    (attendanceModel.setCheckOut as jest.Mock).mockResolvedValue({
      id: ATTENDANCE_ID,
    } as never);
    setWaktuWib("2026-03-10", "17:00");

    await request(app)
      .post("/api/v1/attendances/check-out")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({});

    const [, , recorded, source] = (attendanceModel.setCheckOut as jest.Mock)
      .mock.calls[0] as [string, Date, Date, string, number];

    expect(source).toBe("online");
    expect(new Date(recorded).toISOString()).toBe("2026-03-10T10:00:00.000Z");
  });
});

describe("koreksi tidak boleh menghapus jejak offline", () => {
  const absensiOffline = {
    id: ATTENDANCE_ID,
    employee_id: EMPLOYEE_ID,
    attendance_date: "2026-03-09",
    status: "late",
    check_in_at: new Date("2026-03-09T01:30:00Z"),
    check_in_recorded_at: new Date("2026-03-09T03:00:00Z"),
    check_in_source: "offline_sync",
    check_out_at: null,
    check_out_recorded_at: null,
    check_out_source: null,
    late_minutes: 30,
    work_minutes: null,
  };

  const alasan = "Mesin absensi bermasalah pada pagi hari";

  function koreksi(body: Record<string, unknown>) {
    return request(app)
      .patch(`/api/v1/attendances/${ATTENDANCE_ID}/correct`)
      .set("Authorization", `Bearer ${employeeToken}`)
      .send(body);
  }

  function argumenKoreksi() {
    return (attendanceModel.correctAttendance as jest.Mock).mock.calls[0] as [
      string,
      {
        check_in_recorded_at: Date | null;
        check_in_source: string | null;
        check_out_source: string | null;
      },
    ];
  }

  beforeEach(() => {
    (featureModel.findCodesByPosition as jest.Mock).mockResolvedValue([
      "attendance.correct",
    ] as never);
    (attendanceModel.findById as jest.Mock).mockResolvedValue(
      absensiOffline as never,
    );
    (attendanceModel.correctAttendance as jest.Mock).mockImplementation(
      (id, data) => Promise.resolve({ id, ...(data as object) }) as never,
    );
  });

  it("mempertahankan sumber offline ketika jam masuknya tidak diubah", async () => {
    const res = await koreksi({
      status: "present",
      check_in_at: "2026-03-09T01:30:00Z",
      reason: alasan,
    });

    expect(res.status).toBe(200);

    const [, data] = argumenKoreksi();

    expect(data.check_in_source).toBe("offline_sync");
    expect(new Date(data.check_in_recorded_at!).toISOString()).toBe(
      "2026-03-09T03:00:00.000Z",
    );
  });

  it("menandai sumber correction ketika jam masuknya diubah", async () => {
    await koreksi({
      status: "present",
      check_in_at: "2026-03-09T02:00:00Z",
      reason: alasan,
    });

    const [, data] = argumenKoreksi();

    expect(data.check_in_source).toBe("correction");
  });

  it("mengosongkan saksi ketika status diubah menjadi tidak hadir", async () => {
    await koreksi({ status: "absent", reason: alasan });

    const [, data] = argumenKoreksi();

    expect(data.check_in_source).toBeNull();
    expect(data.check_in_recorded_at).toBeNull();
    expect(data.check_out_source).toBeNull();
  });

  it("jam pulang yang baru diisi koreksi ditandai correction", async () => {
    await koreksi({
      status: "present",
      check_in_at: "2026-03-09T01:30:00Z",
      check_out_at: "2026-03-09T10:00:00Z",
      reason: alasan,
    });

    const [, data] = argumenKoreksi();

    expect(data.check_in_source).toBe("offline_sync");
    expect(data.check_out_source).toBe("correction");
  });
});

describe("kejadian mentah dicatat lebih dulu", () => {
  it("kejadian tersimpan sebelum absensi dihitung dan ditulis", async () => {
    setWaktuWib("2026-03-10", "08:00");

    await checkIn();

    expect(eventModel.recordEvent).toHaveBeenCalledTimes(1);
    expect(attendanceModel.createCheckIn).toHaveBeenCalledTimes(1);

    const urutanCatat = (eventModel.recordEvent as jest.Mock).mock
      .invocationCallOrder[0]!;
    const urutanSimpan = (attendanceModel.createCheckIn as jest.Mock).mock
      .invocationCallOrder[0]!;

    expect(urutanCatat).toBeLessThan(urutanSimpan);
  });

  it("kejadian dicatat sebelum pemeriksaan hari libur dijalankan", async () => {
    setWaktuWib("2026-03-10", "08:00");

    await checkIn();

    const urutanCatat = (eventModel.recordEvent as jest.Mock).mock
      .invocationCallOrder[0]!;
    const urutanPeriksa = (holidayModel.findByDate as jest.Mock).mock
      .invocationCallOrder[0]!;

    expect(urutanCatat).toBeLessThan(urutanPeriksa);
  });

  it("menyimpan waktu tekan apa adanya sampai milidetik", async () => {
    jest.useFakeTimers({ doNotFake: [...TIMER_ASLI] });
    jest.setSystemTime(new Date("2026-03-10T01:00:00.123Z"));

    await checkIn();

    const [data] = (eventModel.recordEvent as jest.Mock).mock.calls[0] as [
      { occurred_at: Date; received_at: Date },
    ];

    expect(new Date(data.occurred_at).toISOString()).toBe(
      "2026-03-10T01:00:00.123Z",
    );
    expect(new Date(data.received_at).toISOString()).toBe(
      "2026-03-10T01:00:00.123Z",
    );
  });

  it("mencatat jenis dan sumber kejadiannya", async () => {
    setWaktuWib("2026-03-10", "09:30");

    await request(app)
      .post("/api/v1/attendances/check-in")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ offline_time: "2026-03-10T07:58:00+07:00" });

    const [data] = (eventModel.recordEvent as jest.Mock).mock.calls[0] as [
      { kind: string; source: string; occurred_at: Date; received_at: Date },
    ];

    expect(data.kind).toBe("check_in");
    expect(data.source).toBe("offline_sync");
    expect(new Date(data.occurred_at).toISOString()).toBe(
      "2026-03-10T00:58:00.000Z",
    );
    expect(new Date(data.received_at).toISOString()).toBe(
      "2026-03-10T02:30:00.000Z",
    );
  });

  it("menautkan kejadian ke absensi setelah tersimpan", async () => {
    setWaktuWib("2026-03-10", "08:00");

    await checkIn();

    expect(eventModel.linkToAttendance).toHaveBeenCalledWith(
      "77777777-7777-4777-8777-777777777777",
      ATTENDANCE_ID,
    );
  });

  it("percobaan yang ditolak hari libur tetap meninggalkan jejak", async () => {
    setWaktuWib("2026-03-10", "08:00");
    (holidayModel.findByDate as jest.Mock).mockResolvedValue({
      name: "Hari Raya Nyepi",
    } as never);

    const res = await checkIn();

    expect(res.status).toBe(400);
    expect(eventModel.recordEvent).toHaveBeenCalledTimes(1);
    expect(eventModel.markRejected).toHaveBeenCalledWith(
      "77777777-7777-4777-8777-777777777777",
      expect.stringContaining("Hari Raya Nyepi"),
    );
    expect(eventModel.linkToAttendance).not.toHaveBeenCalled();
  });

  it("percobaan yang ditolak karena sudah absen tetap meninggalkan jejak", async () => {
    setWaktuWib("2026-03-10", "09:00");
    (attendanceModel.findByEmployeeAndDate as jest.Mock).mockResolvedValue({
      id: ATTENDANCE_ID,
      status: "present",
      check_in_at: new Date("2026-03-10T01:00:00Z"),
      check_out_at: null,
    } as never);

    const res = await checkIn();

    expect(res.status).toBe(409);
    expect(eventModel.markRejected).toHaveBeenCalledWith(
      "77777777-7777-4777-8777-777777777777",
      expect.stringContaining("08:00"),
    );
  });

  it("absen pulang tanpa absen masuk tetap meninggalkan jejak", async () => {
    setWaktuWib("2026-03-10", "17:00");

    const res = await checkOut();

    expect(res.status).toBe(400);

    const [data] = (eventModel.recordEvent as jest.Mock).mock.calls[0] as [
      { kind: string },
    ];

    expect(data.kind).toBe("check_out");
    expect(eventModel.markRejected).toHaveBeenCalled();
  });

  it("waktu offline yang tidak sah ditolak sebelum kejadian dicatat", async () => {
    setWaktuWib("2026-03-10", "08:00");

    const res = await request(app)
      .post("/api/v1/attendances/check-in")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ offline_time: "2026-03-10T09:00:00+07:00" });

    expect(res.status).toBe(400);
    expect(eventModel.recordEvent).not.toHaveBeenCalled();
  });
});
