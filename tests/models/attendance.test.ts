import { jest, describe, it, expect, beforeEach } from "@jest/globals";

const mockQuery = jest.fn();

jest.unstable_mockModule("../../src/config/databaseConnection.js", () => ({
  pool: { query: mockQuery, connect: jest.fn() },
}));

const attendanceModel = await import("../../src/models/attendance.js");

const EMPLOYEE_ID = "11111111-1111-4111-8111-111111111111";
const ATTENDANCE_ID = "22222222-2222-4222-8222-222222222222";
const LEAVE_REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const DEPARTMENT_ID = "44444444-4444-4444-8444-444444444444";

const fakeAttendance = {
  id: ATTENDANCE_ID,
  employee_id: EMPLOYEE_ID,
  attendance_date: "2026-03-10",
  check_in_at: new Date("2026-03-10T01:00:00Z"),
  check_out_at: null,
  status: "present",
  late_minutes: 0,
  work_minutes: null,
  leave_request_id: null,
  note: null,
  created_at: new Date(),
  updated_at: new Date(),
};

const mockDb = { query: mockQuery };

beforeEach(() => {
  jest.clearAllMocks();
});

function panggilan(indeks = -1): [string, unknown[]] {
  const [sql, values] = mockQuery.mock.calls.at(indeks) as [string, unknown[]];

  return [sql.replace(/\s+/g, " "), values];
}

describe("pembacaan absensi", () => {
  it("mengembalikan tanggal sebagai teks agar tetap tanggal kalender", async () => {
    mockQuery.mockResolvedValue({ rows: [fakeAttendance] } as never);

    await attendanceModel.findByEmployeeAndDate(EMPLOYEE_ID, "2026-03-10");

    const [sql] = panggilan();

    expect(sql).toContain("attendance_date::text AS attendance_date");
  });

  it("mencari berdasarkan karyawan dan tanggal sekaligus", async () => {
    mockQuery.mockResolvedValue({ rows: [fakeAttendance] } as never);

    const hasil = await attendanceModel.findByEmployeeAndDate(
      EMPLOYEE_ID,
      "2026-03-10",
    );

    const [sql, values] = panggilan();

    expect(sql).toContain(
      "employee_id = $1::uuid AND attendance_date = $2::date",
    );
    expect(values).toEqual([EMPLOYEE_ID, "2026-03-10"]);
    expect(hasil?.status).toBe("present");
  });

  it("mengembalikan null bila belum ada absensi pada tanggal itu", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    const hasil = await attendanceModel.findByEmployeeAndDate(
      EMPLOYEE_ID,
      "2026-03-10",
    );

    expect(hasil).toBeNull();
  });
});

describe("pencatatan absen masuk dan pulang", () => {
  it("menyimpan status dan keterlambatan apa adanya", async () => {
    mockQuery.mockResolvedValue({ rows: [fakeAttendance] } as never);

    const waktu = new Date("2026-03-10T01:30:00Z");

    await attendanceModel.createCheckIn({
      employee_id: EMPLOYEE_ID,
      attendance_date: "2026-03-10",
      check_in_at: waktu,
      status: "late",
      late_minutes: 30,
    });

    const [, values] = panggilan();

    expect(values).toEqual([
      EMPLOYEE_ID,
      "2026-03-10",
      waktu,
      "late",
      30,
      null,
    ]);
  });

  it("melempar galat ketika penyimpanan tidak mengembalikan baris", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await expect(
      attendanceModel.createCheckIn({
        employee_id: EMPLOYEE_ID,
        attendance_date: "2026-03-10",
        check_in_at: new Date(),
        status: "present",
        late_minutes: 0,
      }),
    ).rejects.toThrow("Gagal menyimpan absensi masuk");
  });

  it("hanya mengisi jam pulang yang masih kosong", async () => {
    mockQuery.mockResolvedValue({ rows: [fakeAttendance] } as never);

    await attendanceModel.setCheckOut(
      ATTENDANCE_ID,
      new Date("2026-03-10T10:00:00Z"),
      540,
    );

    const [sql] = panggilan();

    // syarat ini yang mencegah dua permintaan bersamaan sama-sama berhasil
    expect(sql).toContain("check_out_at IS NULL");
    expect(sql).toContain("check_in_at IS NOT NULL");
  });

  it("mengembalikan null bila jam pulang sudah terisi lebih dulu", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    const hasil = await attendanceModel.setCheckOut(
      ATTENDANCE_ID,
      new Date(),
      540,
    );

    expect(hasil).toBeNull();
  });
});

describe("penyaringan daftar absensi", () => {
  beforeEach(() => {
    mockQuery.mockResolvedValue({
      rows: [{ count: "3" }],
    } as never);
  });

  it("membatasi pada bawahan langsung lewat manager_id", async () => {
    await attendanceModel.listAttendances({
      manager_id: EMPLOYEE_ID,
      page: 1,
      limit: 10,
    });

    const [sql] = panggilan(0);

    expect(sql).toContain("e.manager_id = $1::uuid");
  });

  it("menyaring departemen, status, dan rentang tanggal sekaligus", async () => {
    await attendanceModel.listAttendances({
      department_id: DEPARTMENT_ID,
      status: "late",
      start_date: "2026-03-01",
      end_date: "2026-03-31",
      page: 1,
      limit: 10,
    });

    const [sql, values] = panggilan(0);

    expect(sql).toContain("e.department_id = $1::uuid");
    expect(sql).toContain("a.status = $2::attendance_status");
    expect(sql).toContain("a.attendance_date >= $3::date");
    expect(sql).toContain("a.attendance_date <= $4::date");
    // limit dan offset ditambahkan ke larik yang sama setelah query hitung
    // berjalan, jadi keduanya dibuang saat memeriksa nilai penyaringnya
    expect(values.slice(0, -2)).toEqual([
      DEPARTMENT_ID,
      "late",
      "2026-03-01",
      "2026-03-31",
    ]);
  });

  it("mencari nama maupun nomor karyawan dengan satu kata kunci", async () => {
    await attendanceModel.listAttendances({
      search: "bagus",
      page: 1,
      limit: 10,
    });

    const [sql, values] = panggilan(0);

    expect(sql).toContain("e.full_name ILIKE $1");
    expect(sql).toContain("e.employee_number ILIKE $1");
    expect(values[0]).toBe("%bagus%");
  });

  it("mengabaikan karyawan yang sudah dihapus", async () => {
    await attendanceModel.listAttendances({ page: 1, limit: 10 });

    const [sql] = panggilan(0);

    expect(sql).toContain("e.deleted_at IS NULL");
  });

  it("menghitung offset dari halaman yang diminta", async () => {
    await attendanceModel.listAttendances({ page: 3, limit: 20 });

    const [, values] = panggilan();

    expect(values.slice(-2)).toEqual([20, 40]);
  });

  it("mengembalikan total baris dari query hitung", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: "42" }] } as never)
      .mockResolvedValueOnce({ rows: [fakeAttendance] } as never);

    const { total, rows } = await attendanceModel.listAttendances({
      page: 1,
      limit: 10,
    });

    expect(total).toBe(42);
    expect(rows).toHaveLength(1);
  });
});

describe("rekap kehadiran", () => {
  it("mengubah hitungan dari database menjadi angka", async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          present: "18",
          late: "2",
          absent: "1",
          leave: "3",
          holiday: "1",
          total_late_minutes: "25",
          total_work_minutes: "9600",
        },
      ],
    } as never);

    const rekap = await attendanceModel.summaryFor(
      EMPLOYEE_ID,
      "2026-03-01",
      "2026-03-31",
    );

    expect(rekap).toEqual({
      present: 18,
      late: 2,
      absent: 1,
      leave: 3,
      holiday: 1,
      total_late_minutes: 25,
      total_work_minutes: 9600,
    });
  });

  it("menghasilkan nol untuk periode tanpa data", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    const rekap = await attendanceModel.summaryFor(
      EMPLOYEE_ID,
      "2026-03-01",
      "2026-03-31",
    );

    expect(rekap.present).toBe(0);
    expect(rekap.total_work_minutes).toBe(0);
  });

  it("laporan bulanan tetap memuat karyawan yang tidak pernah hadir", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await attendanceModel.monthlyReport("2026-03-01", "2026-03-31");

    const [sql] = panggilan();

    // LEFT JOIN yang menjaga karyawan tanpa baris absensi tetap muncul
    expect(sql).toContain("FROM employees e LEFT JOIN");
    expect(sql).toContain("LEFT JOIN attendances a");
  });

  it("laporan bulanan mengubah hitungan menjadi angka", async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          employee_id: EMPLOYEE_ID,
          employee_number: "001",
          employee_name: "Bagus Pratama",
          department_name: null,
          position_name: null,
          present: "20",
          late: "1",
          absent: "0",
          leave: "0",
          holiday: "1",
          total_late_minutes: "10",
          total_work_minutes: "9600",
        },
      ],
    } as never);

    const rows = await attendanceModel.monthlyReport(
      "2026-03-01",
      "2026-03-31",
    );

    expect(rows[0]?.present).toBe(20);
    expect(rows[0]?.total_late_minutes).toBe(10);
  });

  it("laporan bulanan dapat dibatasi pada satu departemen", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await attendanceModel.monthlyReport(
      "2026-03-01",
      "2026-03-31",
      DEPARTMENT_ID,
    );

    const [sql, values] = panggilan();

    expect(sql).toContain("e.department_id = $3::uuid");
    expect(values[2]).toBe(DEPARTMENT_ID);
  });
});

describe("penandaan hari cuti", () => {
  it("tidak menjalankan query untuk daftar tanggal kosong", async () => {
    const jumlah = await attendanceModel.upsertLeaveDays(
      mockDb as never,
      EMPLOYEE_ID,
      [],
      LEAVE_REQUEST_ID,
    );

    expect(jumlah).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("menimpa baris yang sudah ada sambil mengosongkan jam absen", async () => {
    mockQuery.mockResolvedValue({ rowCount: 2 } as never);

    await attendanceModel.upsertLeaveDays(
      mockDb as never,
      EMPLOYEE_ID,
      ["2026-03-10", "2026-03-11"],
      LEAVE_REQUEST_ID,
    );

    const [sql, values] = panggilan();

    expect(sql).toContain(
      "ON CONFLICT (employee_id, attendance_date) DO UPDATE",
    );
    // batasan tabel menuntut status cuti tidak memiliki jam masuk
    expect(sql).toContain("check_in_at = NULL");
    expect(sql).toContain("check_out_at = NULL");
    expect(values[1]).toEqual(["2026-03-10", "2026-03-11"]);
  });

  it("menghapus penanda cuti tanpa menyentuh kehadiran nyata", async () => {
    mockQuery.mockResolvedValue({ rowCount: 2 } as never);

    const jumlah = await attendanceModel.deleteLeaveDays(
      mockDb as never,
      LEAVE_REQUEST_ID,
    );

    const [sql] = panggilan();

    expect(sql).toContain("status = 'leave'::attendance_status");
    expect(jumlah).toBe(2);
  });
});

describe("penanda job penutup hari", () => {
  it("tidak menjalankan query ketika tidak ada yang perlu ditandai", async () => {
    const jumlah = await attendanceModel.insertMarkers(
      mockDb as never,
      "2026-03-10",
      [],
    );

    expect(jumlah).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("tidak pernah menimpa baris yang sudah ada", async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 } as never);

    await attendanceModel.insertMarkers(mockDb as never, "2026-03-10", [
      { employee_id: EMPLOYEE_ID, status: "absent" },
    ]);

    const [sql] = panggilan();

    // inilah yang membuat job aman dijalankan berulang kali
    expect(sql).toContain(
      "ON CONFLICT (employee_id, attendance_date) DO NOTHING",
    );
  });

  it("mengirim setiap kolom sebagai larik sejajar", async () => {
    mockQuery.mockResolvedValue({ rowCount: 2 } as never);

    await attendanceModel.insertMarkers(mockDb as never, "2026-03-10", [
      {
        employee_id: EMPLOYEE_ID,
        status: "leave",
        leave_request_id: LEAVE_REQUEST_ID,
      },
      { employee_id: ATTENDANCE_ID, status: "absent" },
    ]);

    const [, values] = panggilan();

    expect(values[0]).toEqual([EMPLOYEE_ID, ATTENDANCE_ID]);
    expect(values[1]).toBe("2026-03-10");
    expect(values[2]).toEqual(["leave", "absent"]);
    expect(values[3]).toEqual([LEAVE_REQUEST_ID, null]);
  });

  it("mengembalikan jumlah baris yang benar benar dibuat", async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 } as never);

    const jumlah = await attendanceModel.insertMarkers(
      mockDb as never,
      "2026-03-10",
      [
        { employee_id: EMPLOYEE_ID, status: "absent" },
        { employee_id: ATTENDANCE_ID, status: "absent" },
      ],
    );

    expect(jumlah).toBe(1);
  });
});

describe("koreksi absensi", () => {
  it("menulis ulang seluruh kolom yang saling bergantung", async () => {
    mockQuery.mockResolvedValue({ rows: [fakeAttendance] } as never);

    await attendanceModel.correctAttendance(ATTENDANCE_ID, {
      status: "absent",
      check_in_at: null,
      check_out_at: null,
      late_minutes: 0,
      work_minutes: null,
      note: "Dikoreksi karena salah input",
    });

    const [sql, values] = panggilan();

    expect(sql).toContain("status = $2::attendance_status");
    expect(sql).toContain("check_in_at = $3::timestamptz");
    expect(sql).toContain("work_minutes = $6::int");
    expect(values).toEqual([
      ATTENDANCE_ID,
      "absent",
      null,
      null,
      0,
      null,
      "Dikoreksi karena salah input",
    ]);
  });
});
