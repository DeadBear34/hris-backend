import { jest, describe, it, expect, beforeEach } from "@jest/globals";

const mockQuery = jest.fn();

jest.unstable_mockModule("../../src/config/databaseConnection.js", () => ({
  pool: { query: mockQuery, connect: jest.fn() },
}));

const workScheduleModel = await import("../../src/models/workSchedule.js");

const SCHEDULE_ID = "11111111-1111-4111-8111-111111111111";
const DEPARTMENT_ID = "22222222-2222-4222-8222-222222222222";
const EMPLOYEE_ID = "33333333-3333-4333-8333-333333333333";

const jadwalUmum = {
  id: SCHEDULE_ID,
  name: "Jadwal Kerja Umum",
  department_id: null,
  start_time: "08:00:00",
  end_time: "17:00:00",
  late_tolerance_minutes: 5,
  absent_cutoff_time: "18:00:00",
  works_monday: true,
  works_tuesday: true,
  works_wednesday: true,
  works_thursday: true,
  works_friday: true,
  works_saturday: false,
  works_sunday: false,
  is_active: true,
  deleted_at: null,
  created_at: new Date(),
  updated_at: new Date(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

/** Teks query terakhir, dirapatkan supaya perbandingannya tidak rapuh. */
function sqlTerakhir(): string {
  const teks = mockQuery.mock.calls.at(-1)?.[0] as string;

  return teks.replace(/\s+/g, " ");
}

describe("urutan penentuan jadwal karyawan", () => {
  it("mendahulukan jadwal milik karyawan, lalu departemen, lalu bawaan", async () => {
    mockQuery.mockResolvedValue({ rows: [jadwalUmum] } as never);

    await workScheduleModel.resolveForEmployee(EMPLOYEE_ID);

    const sql = sqlTerakhir();

    // urutan prioritas inilah yang menjadi aturan, jadi diperiksa langsung
    expect(sql).toContain("WHEN ws.id = e.work_schedule_id THEN 1");
    expect(sql).toContain("WHEN ws.department_id = e.department_id THEN 2");
    expect(sql).toContain("ELSE 3");
    expect(sql).toContain("ORDER BY prioritas ASC");
    expect(sql).toContain("LIMIT 1");
  });

  it("hanya mempertimbangkan jadwal aktif yang belum dihapus", async () => {
    mockQuery.mockResolvedValue({ rows: [jadwalUmum] } as never);

    await workScheduleModel.resolveForEmployee(EMPLOYEE_ID);

    expect(sqlTerakhir()).toContain(
      "ws.deleted_at IS NULL AND ws.is_active = true",
    );
  });

  it("mempertimbangkan jadwal bawaan sebagai cadangan terakhir", async () => {
    mockQuery.mockResolvedValue({ rows: [jadwalUmum] } as never);

    await workScheduleModel.resolveForEmployee(EMPLOYEE_ID);

    expect(sqlTerakhir()).toContain("OR ws.department_id IS NULL");
  });

  it("mengembalikan jadwal yang ditemukan", async () => {
    mockQuery.mockResolvedValue({ rows: [jadwalUmum] } as never);

    const jadwal = await workScheduleModel.resolveForEmployee(EMPLOYEE_ID);

    expect(jadwal?.name).toBe("Jadwal Kerja Umum");
  });

  it("mengembalikan null bila karyawan tidak tercakup jadwal mana pun", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    const jadwal = await workScheduleModel.resolveForEmployee(EMPLOYEE_ID);

    expect(jadwal).toBeNull();
  });

  it("versi massal mengabaikan karyawan nonaktif dan yang mengundurkan diri", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await workScheduleModel.resolveForAllActive();

    const sql = sqlTerakhir();

    expect(sql).toContain("e.is_active = true");
    expect(sql).toContain("e.employment_status <> 'resigned'");
  });

  it("versi massal memisahkan id karyawan dari kolom jadwal", async () => {
    mockQuery.mockResolvedValue({
      rows: [{ employee_id: EMPLOYEE_ID, ...jadwalUmum }],
    } as never);

    const result = await workScheduleModel.resolveForAllActive();

    expect(result[0]?.employee_id).toBe(EMPLOYEE_ID);
    expect(result[0]?.schedule.name).toBe("Jadwal Kerja Umum");
    expect(result[0]?.schedule).not.toHaveProperty("employee_id");
  });
});

describe("adalahHariKerja", () => {
  it("mengikuti kolom hari kerja pada jadwal", () => {
    expect(workScheduleModel.isWorkingDay(jadwalUmum, "monday")).toBe(true);
    expect(workScheduleModel.isWorkingDay(jadwalUmum, "saturday")).toBe(
      false,
    );
    expect(workScheduleModel.isWorkingDay(jadwalUmum, "sunday")).toBe(false);
  });

  it("menghormati jadwal yang menetapkan Sabtu sebagai hari kerja", () => {
    const jadwalSabtu = { ...jadwalUmum, works_saturday: true };

    expect(workScheduleModel.isWorkingDay(jadwalSabtu, "saturday")).toBe(
      true,
    );
  });
});

describe("tanggalKerjaDalamRentang", () => {
  it("membuang akhir pekan menurut jadwal", () => {
    // 2026-03-09 Senin sampai 2026-03-15 Minggu
    const result = workScheduleModel.workingDatesInRange(
      jadwalUmum,
      "2026-03-09",
      "2026-03-15",
    );

    expect(result).toEqual([
      "2026-03-09",
      "2026-03-10",
      "2026-03-11",
      "2026-03-12",
      "2026-03-13",
    ]);
  });

  it("membuang hari libur yang jatuh pada hari kerja", () => {
    const result = workScheduleModel.workingDatesInRange(
      jadwalUmum,
      "2026-03-09",
      "2026-03-13",
      ["2026-03-11"],
    );

    expect(result).not.toContain("2026-03-11");
    expect(result).toHaveLength(4);
  });

  it("menyertakan Sabtu bagi jadwal yang bekerja pada hari Sabtu", () => {
    const jadwalSabtu = { ...jadwalUmum, works_saturday: true };

    const result = workScheduleModel.workingDatesInRange(
      jadwalSabtu,
      "2026-03-13",
      "2026-03-15",
    );

    expect(result).toEqual(["2026-03-13", "2026-03-14"]);
  });

  it("menghasilkan daftar kosong bila seluruh rentang bukan hari kerja", () => {
    const result = workScheduleModel.workingDatesInRange(
      jadwalUmum,
      "2026-03-14",
      "2026-03-15",
    );

    expect(result).toEqual([]);
  });
});

describe("countEmployees", () => {
  it("menghitung karyawan yang menunjuk jadwal ini", async () => {
    mockQuery.mockResolvedValue({ rows: [{ count: "7" }] } as never);

    const count = await workScheduleModel.countEmployees(SCHEDULE_ID);

    expect(count).toBe(7);
  });

  it("mengabaikan karyawan yang sudah dihapus", async () => {
    mockQuery.mockResolvedValue({ rows: [{ count: "0" }] } as never);

    await workScheduleModel.countEmployees(SCHEDULE_ID);

    expect(sqlTerakhir()).toContain("deleted_at IS NULL");
  });
});

describe("penyimpanan jadwal", () => {
  it("membuat jadwal departemen dengan nilai bawaan bila tidak diisi", async () => {
    mockQuery.mockResolvedValue({ rows: [jadwalUmum] } as never);

    await workScheduleModel.createSchedule({
      name: "Jadwal Operasional",
      department_id: DEPARTMENT_ID,
    });

    const [, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(values[0]).toBe("Jadwal Operasional");
    expect(values[1]).toBe(DEPARTMENT_ID);
    // sisanya dikirim null supaya COALESCE memakai nilai bawaan database
    expect(values.slice(2)).toEqual(new Array(11).fill(null));
  });

  it("hanya menulis kolom yang diizinkan saat mengubah jadwal", async () => {
    mockQuery.mockResolvedValue({ rows: [jadwalUmum] } as never);

    await workScheduleModel.updateSchedule(SCHEDULE_ID, {
      start_time: "09:00",
      id: "tidak-boleh",
      created_at: new Date(),
    } as never);

    // hanya bagian SET yang diperiksa, karena klausa WHERE memang memakai id
    const set = sqlTerakhir().split(" WHERE ")[0]!;

    expect(set).toContain("start_time = $1::time");
    expect(set).not.toContain("id = $");
    expect(set).not.toContain("created_at = $");
  });

  it("tidak menjalankan update ketika tidak ada kolom yang berubah", async () => {
    mockQuery.mockResolvedValue({ rows: [jadwalUmum] } as never);

    await workScheduleModel.updateSchedule(SCHEDULE_ID, {});

    expect(sqlTerakhir()).toContain("SELECT");
  });

  it("menghapus jadwal secara lunak sekaligus menonaktifkannya", async () => {
    mockQuery.mockResolvedValue({ rows: [jadwalUmum] } as never);

    await workScheduleModel.softDeleteSchedule(SCHEDULE_ID);

    const sql = sqlTerakhir();

    expect(sql).toContain("deleted_at = now()");
    expect(sql).toContain("is_active = false");
  });
});
