import { jest, describe, it, expect, beforeEach } from "@jest/globals";

const mockQuery = jest.fn();

jest.unstable_mockModule("../../src/config/databaseConnection.js", () => ({
  pool: { query: mockQuery, connect: jest.fn() },
}));

const workScheduleModel = await import("../../src/models/workSchedule.js");

const SCHEDULE_ID = "11111111-1111-4111-8111-111111111111";
const DEPARTMENT_ID = "22222222-2222-4222-8222-222222222222";
const EMPLOYEE_ID = "33333333-3333-4333-8333-333333333333";

const generalSchedule = {
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
function lastSql(): string {
  const text = mockQuery.mock.calls.at(-1)?.[0] as string;

  return text.replace(/\s+/g, " ");
}

describe("urutan penentuan jadwal karyawan", () => {
  it("mendahulukan jadwal milik karyawan, lalu departemen, lalu bawaan", async () => {
    mockQuery.mockResolvedValue({ rows: [generalSchedule] } as never);

    await workScheduleModel.resolveForEmployee(EMPLOYEE_ID);

    const sql = lastSql();

    // urutan prioritas inilah yang menjadi aturan, jadi diperiksa langsung
    expect(sql).toContain("WHEN ws.id = e.work_schedule_id THEN 1");
    expect(sql).toContain("wsd.department_id = e.department_id ) THEN 2");
    expect(sql).toContain("ELSE 3");
    expect(sql).toContain("ORDER BY prioritas ASC");
    expect(sql).toContain("LIMIT 1");
  });

  it("hanya mempertimbangkan jadwal aktif yang belum dihapus", async () => {
    mockQuery.mockResolvedValue({ rows: [generalSchedule] } as never);

    await workScheduleModel.resolveForEmployee(EMPLOYEE_ID);

    expect(lastSql()).toContain(
      "ws.deleted_at IS NULL AND ws.is_active = true",
    );
  });

  it("mempertimbangkan jadwal bawaan sebagai cadangan terakhir", async () => {
    mockQuery.mockResolvedValue({ rows: [generalSchedule] } as never);

    await workScheduleModel.resolveForEmployee(EMPLOYEE_ID);

    expect(lastSql()).toContain("OR ws.is_default");
  });

  it("mengembalikan jadwal yang ditemukan", async () => {
    mockQuery.mockResolvedValue({ rows: [generalSchedule] } as never);

    const scheduleRow = await workScheduleModel.resolveForEmployee(EMPLOYEE_ID);

    expect(scheduleRow?.name).toBe("Jadwal Kerja Umum");
  });

  it("mengembalikan null bila karyawan tidak tercakup jadwal mana pun", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    const scheduleRow = await workScheduleModel.resolveForEmployee(EMPLOYEE_ID);

    expect(scheduleRow).toBeNull();
  });

  it("versi massal mengabaikan karyawan nonaktif dan yang mengundurkan diri", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await workScheduleModel.resolveForAllActive();

    const sql = lastSql();

    expect(sql).toContain("e.is_active = true");
    expect(sql).toContain("e.employment_status <> 'resigned'");
  });

  it("versi massal memisahkan id karyawan dari kolom jadwal", async () => {
    mockQuery.mockResolvedValue({
      rows: [{ employee_id: EMPLOYEE_ID, ...generalSchedule }],
    } as never);

    const result = await workScheduleModel.resolveForAllActive();

    expect(result[0]?.employee_id).toBe(EMPLOYEE_ID);
    expect(result[0]?.schedule.name).toBe("Jadwal Kerja Umum");
    expect(result[0]?.schedule).not.toHaveProperty("employee_id");
  });
});

describe("adalahHariKerja", () => {
  it("mengikuti kolom hari kerja pada jadwal", () => {
    expect(workScheduleModel.isWorkingDay(generalSchedule, "monday")).toBe(
      true,
    );
    expect(workScheduleModel.isWorkingDay(generalSchedule, "saturday")).toBe(
      false,
    );
    expect(workScheduleModel.isWorkingDay(generalSchedule, "sunday")).toBe(
      false,
    );
  });

  it("menghormati jadwal yang menetapkan Sabtu sebagai hari kerja", () => {
    const saturdaySchedule = { ...generalSchedule, works_saturday: true };

    expect(workScheduleModel.isWorkingDay(saturdaySchedule, "saturday")).toBe(
      true,
    );
  });
});

describe("tanggalKerjaDalamRentang", () => {
  it("membuang akhir pekan menurut jadwal", () => {
    // 2026-03-09 Senin sampai 2026-03-15 Minggu
    const result = workScheduleModel.workingDatesInRange(
      generalSchedule,
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
      generalSchedule,
      "2026-03-09",
      "2026-03-13",
      ["2026-03-11"],
    );

    expect(result).not.toContain("2026-03-11");
    expect(result).toHaveLength(4);
  });

  it("menyertakan Sabtu bagi jadwal yang bekerja pada hari Sabtu", () => {
    const saturdaySchedule = { ...generalSchedule, works_saturday: true };

    const result = workScheduleModel.workingDatesInRange(
      saturdaySchedule,
      "2026-03-13",
      "2026-03-15",
    );

    expect(result).toEqual(["2026-03-13", "2026-03-14"]);
  });

  it("menghasilkan daftar kosong bila seluruh rentang bukan hari kerja", () => {
    const result = workScheduleModel.workingDatesInRange(
      generalSchedule,
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

    expect(lastSql()).toContain("deleted_at IS NULL");
  });
});

describe("penyimpanan jadwal", () => {
  const db = { query: mockQuery };

  it("membuat jadwal dengan nilai bawaan bila tidak diisi", async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: SCHEDULE_ID }] } as never);

    await workScheduleModel.createSchedule(
      db as never,
      { name: "Jadwal Operasional", department_ids: [DEPARTMENT_ID] },
      false,
    );

    const [, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(values[0]).toBe("Jadwal Operasional");
    expect(values[1]).toBe(false);
    // sisanya dikirim null supaya COALESCE memakai nilai bawaan database
    expect(values.slice(2)).toEqual(new Array(12).fill(null));
  });

  it("menyimpan divisi pemakai jadwal setelah jadwalnya dibuat", async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: SCHEDULE_ID }] } as never);

    await workScheduleModel.createSchedule(
      db as never,
      { name: "Jadwal Operasional", department_ids: [DEPARTMENT_ID] },
      false,
    );

    const insert = mockQuery.mock.calls
      .map(([sql, values]) => [String(sql), values] as [string, unknown[]])
      .find(([sql]) => sql.includes("INSERT INTO work_schedule_departments"));

    expect(insert?.[1]).toEqual([SCHEDULE_ID, [DEPARTMENT_ID]]);
  });

  it("mengganti divisi dengan membuang yang tidak lagi dipilih", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await workScheduleModel.replaceDepartments(db as never, SCHEDULE_ID, [
      DEPARTMENT_ID,
    ]);

    const [deleteSql, deleteValues] = mockQuery.mock.calls[0] as [
      string,
      unknown[],
    ];

    expect(deleteSql.replace(/\s+/g, " ")).toContain(
      "NOT (department_id = ANY($2::uuid[]))",
    );
    expect(deleteValues).toEqual([SCHEDULE_ID, [DEPARTMENT_ID]]);
  });

  it("daftar divisi kosong hanya menghapus, tanpa insert", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await workScheduleModel.replaceDepartments(db as never, SCHEDULE_ID, []);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(lastSql()).toContain("DELETE FROM work_schedule_departments");
  });

  it("hanya menulis kolom yang diizinkan saat mengubah jadwal", async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: SCHEDULE_ID }] } as never);

    await workScheduleModel.updateSchedule(db as never, SCHEDULE_ID, {
      start_time: "09:00",
      id: "tidak-boleh",
      created_at: new Date(),
      is_default: true,
    } as never);

    // hanya bagian SET yang diperiksa, karena klausa WHERE memang memakai id
    const set = lastSql().split(" WHERE ")[0]!;

    expect(set).toContain("start_time = $1::time");
    expect(set).not.toContain("id = $");
    expect(set).not.toContain("created_at = $");
    expect(set).not.toContain("is_default");
  });

  it("perubahan divisi saja tetap memeriksa versi lewat updated_at", async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: SCHEDULE_ID }] } as never);

    const saved = await workScheduleModel.updateSchedule(
      db as never,
      SCHEDULE_ID,
      { department_ids: [DEPARTMENT_ID] },
      "2026-01-01T00:00:00.000Z",
    );

    const [touchSql, touchValues] = mockQuery.mock.calls[0] as [
      string,
      unknown[],
    ];

    expect(saved).toBe(true);
    expect(touchSql).toContain("SET updated_at = now()");
    expect(touchValues).toEqual([SCHEDULE_ID, "2026-01-01T00:00:00.000Z"]);
  });

  it("tidak mengganti divisi bila versinya sudah berubah", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    const saved = await workScheduleModel.updateSchedule(
      db as never,
      SCHEDULE_ID,
      { department_ids: [DEPARTMENT_ID] },
      "2026-01-01T00:00:00.000Z",
    );

    expect(saved).toBe(false);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("menghapus jadwal secara lunak dan melepas divisinya", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await workScheduleModel.softDeleteSchedule(db as never, SCHEDULE_ID);

    const sqls = mockQuery.mock.calls.map(([sql]) =>
      String(sql).replace(/\s+/g, " "),
    );

    expect(sqls[0]).toContain("deleted_at = now()");
    expect(sqls[0]).toContain("is_active = false");
    expect(sqls[1]).toContain("DELETE FROM work_schedule_departments");
  });
});

describe("bentuk jadwal yang dikembalikan", () => {
  it("menyusun department_ids dan department_id lama dari daftar divisi", async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          ...generalSchedule,
          is_default: false,
          departments: [
            { id: DEPARTMENT_ID, name: "Engineering" },
            { id: EMPLOYEE_ID, name: "Finance" },
          ],
        },
      ],
    } as never);

    const schedule = await workScheduleModel.findById(SCHEDULE_ID);

    expect(schedule?.department_ids).toEqual([DEPARTMENT_ID, EMPLOYEE_ID]);
    expect(schedule?.department_id).toBe(DEPARTMENT_ID);
  });

  it("jadwal bawaan tidak punya divisi dan department_id-nya null", async () => {
    mockQuery.mockResolvedValue({
      rows: [{ ...generalSchedule, is_default: true, departments: [] }],
    } as never);

    const schedule = await workScheduleModel.findDefault();

    expect(schedule?.department_ids).toEqual([]);
    expect(schedule?.department_id).toBeNull();
  });
});
