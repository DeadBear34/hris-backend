import type { Request, Response, NextFunction } from "express";
import { pool } from "../config/databaseConnection.js";
import { env } from "../config/env.js";
import * as attendanceModel from "../models/attendance.js";
import * as workScheduleModel from "../models/workSchedule.js";
import * as employeeModel from "../models/employee.js";
import * as holidayModel from "../models/holiday.js";
import * as leaveRequestModel from "../models/leaveRequest.js";
import type { Employee } from "../models/employee.js";
import type { WorkSchedule } from "../models/workSchedule.js";
import type {
  Attendance,
  ListAttendanceParams,
} from "../models/attendance.js";
import {
  keWaktuLokal,
  tanggalHariIni,
  jamLokal,
  menitDariJam,
  menitKeterlambatan,
  namaHariDariTanggal,
  selisihMenit,
  type IsoDate,
} from "../helpers/timezone.js";
import { adalahHariKerja } from "../models/workSchedule.js";
import {
  statusLabel,
  butuhJamMasuk,
  jamMenit,
  tentukanStatusKedatangan,
  type HasilKedatangan,
} from "../helpers/attendanceStatus.js";
import { punyaFitur } from "../middlewares/feature.js";
import {
  BadRequest,
  Conflict,
  Forbidden,
  NotFound,
  Unauthorized,
} from "../helpers/appError.js";

const HEADER_CRON = "x-cron-secret";

const UKURAN_BATCH = 500;

function meta(total: number, page: number, limit: number) {
  return {
    page,
    limit,
    total,
    total_pages: Math.ceil(total / limit),
  };
}

async function ambilKaryawan(req: Request, res: Response): Promise<Employee> {
  if (!req.user) {
    throw Unauthorized("Kamu belum login, silakan masuk terlebih dahulu");
  }

  const employee = await employeeModel.findByUserId(req.user.id);

  if (!employee) {
    throw BadRequest(
      "Akun kamu belum terhubung ke data karyawan, hubungi admin terlebih dahulu",
    );
  }

  res.locals.employee ??= employee;

  return employee;
}

function pastikanBolehAbsen(employee: Employee): void {
  if (!employee.is_active) {
    throw Forbidden(
      "Data karyawan kamu berstatus tidak aktif sehingga tidak dapat melakukan absensi, hubungi admin",
    );
  }

  if (employee.employment_status === "resigned") {
    throw Forbidden(
      "Karyawan yang sudah mengundurkan diri tidak dapat melakukan absensi",
    );
  }
}

async function ambilJadwal(employee_id: string): Promise<WorkSchedule> {
  const schedule = await workScheduleModel.resolveForEmployee(employee_id);

  if (!schedule) {
    throw BadRequest(
      "Belum ada jadwal kerja yang berlaku untukmu, hubungi admin untuk mengatur jadwal kerja",
    );
  }

  return schedule;
}

function rentangBulan(
  month: number,
  year: number,
): { start_date: IsoDate; end_date: IsoDate } {
  const akhir = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const bulan = String(month).padStart(2, "0");

  return {
    start_date: `${year}-${bulan}-01`,
    end_date: `${year}-${bulan}-${String(akhir).padStart(2, "0")}`,
  };
}

function bulanDiminta(query: { month?: number; year?: number }): {
  month: number;
  year: number;
} {
  const sekarang = keWaktuLokal();
  const [tahunKini, bulanKini] = sekarang.tanggal.split("-").map(Number);

  return {
    month: query.month ?? bulanKini!,
    year: query.year ?? tahunKini!,
  };
}

async function alasanTidakBolehAbsen(
  employee_id: string,
  schedule: WorkSchedule,
  tanggal: IsoDate,
): Promise<string | null> {
  const hari = namaHariDariTanggal(tanggal);

  if (!adalahHariKerja(schedule, hari)) {
    return `Tanggal ${tanggal} bukan hari kerja menurut jadwal ${schedule.name}`;
  }

  const holiday = await holidayModel.findByDate(tanggal);
  if (holiday) {
    return `Tanggal ${tanggal} adalah hari libur ${holiday.name}`;
  }

  const cuti = await leaveRequestModel.findApprovedCovering(
    employee_id,
    tanggal,
  );

  if (cuti) {
    return `Kamu sedang menjalani cuti yang disetujui pada tanggal ${tanggal}`;
  }

  return null;
}

function jamSingkat(waktu: string): string {
  return waktu.slice(0, 5);
}

function keputusanKedatangan(
  schedule: WorkSchedule,
  menitSekarang: number,
): HasilKedatangan {
  return tentukanStatusKedatangan(
    menitSekarang,
    menitDariJam(schedule.start_time),
    schedule.late_tolerance_minutes,
    menitDariJam(schedule.absent_cutoff_time),
  );
}

function alasanDiLuarJamAbsen(
  schedule: WorkSchedule,
  menitSekarang: number,
): string | null {
  if (keputusanKedatangan(schedule, menitSekarang) !== "ditolak") return null;

  return `Absensi masuk sudah ditutup pukul ${jamSingkat(schedule.absent_cutoff_time)}, kamu tercatat tidak hadir hari ini`;
}

export async function CheckInController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const employee = await ambilKaryawan(req, res);
    pastikanBolehAbsen(employee);

    const { note } = req.body as { note?: string };

    const sekarang = new Date();
    const lokal = keWaktuLokal(sekarang);
    const tanggal = lokal.tanggal;

    const schedule = await ambilJadwal(employee.id);

    const terhalang = await alasanTidakBolehAbsen(
      employee.id,
      schedule,
      tanggal,
    );
    if (terhalang) throw BadRequest(terhalang);

    const existing = await attendanceModel.findByEmployeeAndDate(
      employee.id,
      tanggal,
    );

    if (existing) {
      if (existing.check_in_at) {
        throw Conflict(
          `Kamu sudah melakukan absensi masuk hari ini pukul ${jamLokal(new Date(existing.check_in_at))}`,
          { attendance: existing },
        );
      }

      throw Conflict(
        `Absensi tanggal ${tanggal} sudah tercatat dengan status ${statusLabel(existing.status)}`,
        { attendance: existing },
      );
    }

    const ditutup = alasanDiLuarJamAbsen(
      schedule,
      lokal.menitSejakTengahMalam,
    );
    if (ditutup) throw BadRequest(ditutup);

    const menitMasuk = menitDariJam(schedule.start_time);
    const selisih = menitKeterlambatan(lokal.menitSejakTengahMalam, menitMasuk);

    const terlambat =
      keputusanKedatangan(schedule, lokal.menitSejakTengahMalam) === "late";

    const attendance = await attendanceModel.createCheckIn({
      employee_id: employee.id,
      attendance_date: tanggal,
      check_in_at: sekarang,
      status: terlambat ? "late" : "present",
      late_minutes: terlambat ? selisih : 0,
      note: note ?? null,
    });

    res.status(201).json({
      success: true,
      message: terlambat
        ? `Absensi masuk tercatat pukul ${jamLokal(sekarang)}, terlambat ${selisih} menit dari jam masuk ${schedule.start_time.slice(0, 5)}`
        : `Absensi masuk tercatat pukul ${jamLokal(sekarang)}`,
      data: attendance,
    });
  } catch (err) {
    next(err);
  }
}

export async function CheckOutController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const employee = await ambilKaryawan(req, res);
    pastikanBolehAbsen(employee);

    const sekarang = new Date();
    const lokal = keWaktuLokal(sekarang);
    const tanggal = lokal.tanggal;

    const existing = await attendanceModel.findByEmployeeAndDate(
      employee.id,
      tanggal,
    );

    if (!existing || !existing.check_in_at) {
      throw BadRequest(
        "Kamu belum melakukan absensi masuk hari ini sehingga belum dapat absen pulang",
      );
    }

    if (existing.check_out_at) {
      throw Conflict(
        `Kamu sudah melakukan absensi pulang hari ini pukul ${jamLokal(new Date(existing.check_out_at))}`,
        { attendance: existing },
      );
    }

    const schedule = await ambilJadwal(employee.id);
    const menitMasuk = menitDariJam(schedule.start_time);

    if (lokal.menitSejakTengahMalam < menitMasuk) {
      throw BadRequest(
        `Absensi pulang belum dapat dilakukan sebelum jam kerja dimulai pukul ${schedule.start_time.slice(0, 5)}`,
      );
    }

    const masuk = new Date(existing.check_in_at);
    const menitKerja = selisihMenit(masuk, sekarang);

    if (menitKerja <= 0) {
      throw BadRequest(
        "Jam pulang harus setelah jam masuk, coba beberapa saat lagi",
      );
    }

    const attendance = await attendanceModel.setCheckOut(
      existing.id,
      sekarang,
      menitKerja,
    );

    if (!attendance) {
      throw Conflict(
        "Absensi pulang sudah tercatat dari permintaan lain, silakan muat ulang",
      );
    }

    res.json({
      success: true,
      message: `Absensi pulang tercatat pukul ${jamLokal(sekarang)}, total kerja ${jamMenit(menitKerja)}`,
      data: attendance,
    });
  } catch (err) {
    next(err);
  }
}

export async function TodayAttendanceController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const employee = await ambilKaryawan(req, res);

    const sekarang = new Date();
    const tanggal = tanggalHariIni(sekarang);

    const schedule = await workScheduleModel.resolveForEmployee(employee.id);
    const attendance = await attendanceModel.findByEmployeeAndDate(
      employee.id,
      tanggal,
    );

    const terhalang = schedule
      ? ((await alasanTidakBolehAbsen(employee.id, schedule, tanggal)) ??
        (attendance
          ? null
          : alasanDiLuarJamAbsen(
              schedule,
              keWaktuLokal(sekarang).menitSejakTengahMalam,
            )))
      : "Belum ada jadwal kerja yang berlaku untukmu, hubungi admin";

    res.json({
      success: true,
      data: {
        date: tanggal,
        server_time: jamLokal(sekarang),
        schedule,
        attendance,
        can_check_in: Boolean(schedule) && !terhalang && !attendance,
        can_check_out: Boolean(
          attendance?.check_in_at && !attendance.check_out_at,
        ),
        blocked_reason: terhalang,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function MyAttendanceController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const employee = await ambilKaryawan(req, res);

    const query = res.locals.query as {
      month?: number;
      year?: number;
      status?: attendanceModel.AttendanceStatus;
      page: number;
      limit: number;
    };

    const { month, year } = bulanDiminta(query);
    const { start_date, end_date } = rentangBulan(month, year);

    const { rows, total } = await attendanceModel.listAttendances({
      employee_id: employee.id,
      status: query.status,
      start_date,
      end_date,
      page: query.page,
      limit: query.limit,
    });

    const summary = await attendanceModel.summaryFor(
      employee.id,
      start_date,
      end_date,
    );

    res.json({
      success: true,
      data: rows,
      summary,
      period: { month, year, start_date, end_date },
      meta: meta(total, query.page, query.limit),
    });
  } catch (err) {
    next(err);
  }
}

export async function TeamAttendanceController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const employee = await ambilKaryawan(req, res);
    const query = res.locals.query as ListAttendanceParams;

    const { rows, total } = await attendanceModel.listAttendances({
      ...query,
      manager_id: employee.id,
    });

    res.json({
      success: true,
      data: rows,
      meta: meta(total, query.page, query.limit),
    });
  } catch (err) {
    next(err);
  }
}

export async function ListAttendanceController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const query = res.locals.query as ListAttendanceParams;
    const { rows, total } = await attendanceModel.listAttendances(query);

    res.json({
      success: true,
      data: rows,
      meta: meta(total, query.page, query.limit),
    });
  } catch (err) {
    next(err);
  }
}

export async function ReportAttendanceController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const query = res.locals.query as {
      month?: number;
      year?: number;
      department_id?: string;
    };

    const { month, year } = bulanDiminta(query);
    const { start_date, end_date } = rentangBulan(month, year);

    const rows = await attendanceModel.monthlyReport(
      start_date,
      end_date,
      query.department_id,
    );

    res.json({
      success: true,
      data: rows,
      period: { month, year, start_date, end_date },
    });
  } catch (err) {
    next(err);
  }
}

function susunCatatanKoreksi(
  pengoreksi: Employee,
  alasan: string,
  waktu: Date,
): string {
  const tanggal = tanggalHariIni(waktu);

  return `[Dikoreksi oleh ${pengoreksi.full_name} (${pengoreksi.employee_number}) pada ${tanggal} ${jamLokal(waktu)}] ${alasan}`;
}

export async function CorrectAttendanceController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const pengoreksi = await ambilKaryawan(req, res);
    const { id } = res.locals.params as { id: string };

    const data = req.body as {
      status: attendanceModel.AttendanceStatus;
      check_in_at?: string | null;
      check_out_at?: string | null;
      reason: string;
    };

    const existing = await attendanceModel.findById(id);
    if (!existing) throw NotFound("Data absensi tidak ditemukan");

    const masuk = data.check_in_at ? new Date(data.check_in_at) : null;
    const pulang = data.check_out_at ? new Date(data.check_out_at) : null;

    if (pulang && !masuk) {
      throw BadRequest("Jam pulang tidak dapat diisi tanpa jam masuk");
    }

    let menitTerlambat = 0;

    if (masuk && butuhJamMasuk(data.status)) {
      const schedule = await ambilJadwal(existing.employee_id);
      const lokalMasuk = keWaktuLokal(masuk);

      menitTerlambat =
        data.status === "late"
          ? menitKeterlambatan(
              lokalMasuk.menitSejakTengahMalam,
              menitDariJam(schedule.start_time),
            )
          : 0;
    }

    const attendance = await attendanceModel.correctAttendance(id, {
      status: data.status,
      check_in_at: butuhJamMasuk(data.status) ? masuk : null,
      check_out_at: butuhJamMasuk(data.status) ? pulang : null,
      late_minutes: menitTerlambat,
      work_minutes:
        masuk && pulang && butuhJamMasuk(data.status)
          ? selisihMenit(masuk, pulang)
          : null,
      note: susunCatatanKoreksi(pengoreksi, data.reason, new Date()),
    });

    res.json({
      success: true,
      message: `Absensi tanggal ${existing.attendance_date} berhasil dikoreksi menjadi ${statusLabel(data.status)}`,
      data: attendance,
    });
  } catch (err) {
    next(err);
  }
}

export async function CloseDayController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const dikirim = req.header(HEADER_CRON);

    if (!env.CRON_SECRET) {
      throw Forbidden(
        "CRON_SECRET belum diatur di server sehingga job penutup hari dinonaktifkan",
      );
    }

    if (!dikirim || dikirim !== env.CRON_SECRET) {
      throw Unauthorized(
        `Header ${HEADER_CRON} tidak cocok, job penutup hari ditolak`,
      );
    }

    const query = res.locals.query as { date?: IsoDate };
    const tanggal = query.date ?? tanggalHariIni();
    const hari = namaHariDariTanggal(tanggal);

    const holiday = await holidayModel.findByDate(tanggal);
    const cutiDisetujui = await attendanceModel.findApprovedLeaveOn(tanggal);
    const sudahAda = new Set(
      await attendanceModel.findEmployeeIdsOnDate(tanggal),
    );
    const jadwalKaryawan = await workScheduleModel.resolveForAllActive();

    const petaCuti = new Map(
      cutiDisetujui.map((baris) => [baris.employee_id, baris.leave_request_id]),
    );

    const penanda: attendanceModel.BarisPenanda[] = [];
    let dilewati = 0;

    for (const { employee_id, schedule } of jadwalKaryawan) {
      if (sudahAda.has(employee_id)) {
        dilewati += 1;
        continue;
      }

      if (holiday) {
        penanda.push({
          employee_id,
          status: "holiday",
          note: holiday.name,
        });
        continue;
      }

      const leave_request_id = petaCuti.get(employee_id);
      if (leave_request_id) {
        penanda.push({ employee_id, status: "leave", leave_request_id });
        continue;
      }

      if (!adalahHariKerja(schedule, hari)) {
        dilewati += 1;
        continue;
      }

      penanda.push({ employee_id, status: "absent" });
    }

    let tersimpan = 0;

    for (let i = 0; i < penanda.length; i += UKURAN_BATCH) {
      const potongan = penanda.slice(i, i + UKURAN_BATCH);
      const client = await pool.connect();

      try {
        await client.query("BEGIN");
        tersimpan += await attendanceModel.insertMarkers(
          client,
          tanggal,
          potongan,
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }

    const hitung = (status: string) =>
      penanda.filter((baris) => baris.status === status).length;

    res.json({
      success: true,
      message: `Penutupan hari ${tanggal} selesai, ${tersimpan} baris absensi baru dibuat`,
      data: {
        date: tanggal,
        is_holiday: Boolean(holiday),
        holiday_name: holiday?.name ?? null,
        created: tersimpan,
        skipped: dilewati,
        marked: {
          holiday: hitung("holiday"),
          leave: hitung("leave"),
          absent: hitung("absent"),
        },
      },
    });
  } catch (err) {
    next(err);
  }
}
