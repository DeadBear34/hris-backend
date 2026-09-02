import type { Request, Response, NextFunction } from "express";
import { pool } from "../config/databaseConnection.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { startActivity } from "../helpers/activityLog.js";
import * as attendanceModel from "../models/attendance.js";
import * as eventModel from "../models/attendanceEvent.js";
import * as workScheduleModel from "../models/workSchedule.js";
import * as employeeModel from "../models/employee.js";
import * as holidayModel from "../models/holiday.js";
import * as leaveRequestModel from "../models/leaveRequest.js";
import type { Employee } from "../models/employee.js";
import type { WorkSchedule } from "../models/workSchedule.js";
import type { Attendance, ListAttendanceParams } from "../models/attendance.js";
import {
  toLocalTime,
  todayInOfficeZone,
  clockTimeOf,
  minutesFromClockTime,
  lateMinutesFrom,
  dayNameOf,
  minutesBetween,
  type IsoDate,
} from "../helpers/timezone.js";
import { isWorkingDay } from "../models/workSchedule.js";
import {
  rejectionReasonForOfflineTime,
  buildOfflineNote,
} from "../helpers/offlineAttendance.js";
import {
  statusLabel,
  requiresCheckIn,
  formatDuration,
  decideArrivalStatus,
  decideDailyMarker,
  type ArrivalOutcome,
} from "../helpers/attendanceStatus.js";
import { hasFeature } from "../middlewares/feature.js";
import {
  BadRequest,
  Conflict,
  Forbidden,
  NotFound,
  Unauthorized,
} from "../helpers/appError.js";

const CRON_HEADER = "x-cron-secret";

const BATCH_SIZE = 500;

function meta(total: number, page: number, limit: number) {
  return {
    page,
    limit,
    total,
    total_pages: Math.ceil(total / limit),
  };
}

async function getRequesterEmployee(req: Request, res: Response): Promise<Employee> {
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

function assertMayCheckIn(employee: Employee): void {
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

async function getSchedule(employee_id: string): Promise<WorkSchedule> {
  const schedule = await workScheduleModel.resolveForEmployee(employee_id);

  if (!schedule) {
    throw BadRequest(
      "Belum ada jadwal kerja yang berlaku untukmu, hubungi admin untuk mengatur jadwal kerja",
    );
  }

  return schedule;
}

function monthRange(
  month: number,
  year: number,
): { start_date: IsoDate; end_date: IsoDate } {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const paddedMonth = String(month).padStart(2, "0");

  return {
    start_date: `${year}-${paddedMonth}-01`,
    end_date: `${year}-${paddedMonth}-${String(lastDay).padStart(2, "0")}`,
  };
}

function requestedMonth(query: { month?: number; year?: number }): {
  month: number;
  year: number;
} {
  const sekarang = toLocalTime();
  const [tahunKini, bulanKini] = sekarang.date.split("-").map(Number);

  return {
    month: query.month ?? bulanKini!,
    year: query.year ?? tahunKini!,
  };
}

async function blockedReasonForDate(
  employee_id: string,
  schedule: WorkSchedule,
  date: IsoDate,
): Promise<string | null> {
  const day = dayNameOf(date);

  if (!isWorkingDay(schedule, day)) {
    return `Tanggal ${date} bukan hari kerja menurut jadwal ${schedule.name}`;
  }

  const holiday = await holidayModel.findByDate(date);
  if (holiday) {
    return `Tanggal ${date} adalah hari libur ${holiday.name}`;
  }

  const leave = await leaveRequestModel.findApprovedCovering(
    employee_id,
    date,
  );

  if (leave) {
    return `Kamu sedang menjalani cuti yang disetujui pada tanggal ${date}`;
  }

  return null;
}

function rejectEvent(
  eventId: string,
  reason: string,
  buatGalat: (message: string) => Error,
): Error {
  void eventModel
    .markRejected(eventId, reason)
    .catch((err) =>
      logger.warn(
        { err, eventId },
        "Gagal menandai kejadian absensi yang ditolak",
      ),
    );

  return buatGalat(reason);
}

interface AttendanceTime {
  at: Date;
  offline: boolean;
}

function resolveAttendanceTime(
  offline_time: string | undefined,
  serverTime: Date,
  schedule: WorkSchedule,
): AttendanceTime {
  if (!offline_time) return { at: serverTime, offline: false };

  const at = new Date(offline_time);

  const reason = rejectionReasonForOfflineTime(
    at,
    serverTime,
    minutesFromClockTime(schedule.start_time),
  );

  if (reason) throw BadRequest(reason);

  return { at, offline: true };
}

function shortTime(at: string): string {
  return at.slice(0, 5);
}

function arrivalDecision(
  schedule: WorkSchedule,
  menitSekarang: number,
): ArrivalOutcome {
  return decideArrivalStatus(
    menitSekarang,
    minutesFromClockTime(schedule.start_time),
    schedule.late_tolerance_minutes,
    minutesFromClockTime(schedule.absent_cutoff_time),
  );
}

function blockedReasonForTime(
  schedule: WorkSchedule,
  menitSekarang: number,
): string | null {
  if (arrivalDecision(schedule, menitSekarang) !== "ditolak") return null;

  return `Absensi masuk sudah ditutup pukul ${shortTime(schedule.absent_cutoff_time)}, kamu tercatat tidak hadir hari ini`;
}

export async function CheckInController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const employee = await getRequesterEmployee(req, res);
    assertMayCheckIn(employee);

    const { note, offline_time } = req.body as {
      note?: string;
      offline_time?: string;
    };

    const sekarang = new Date();
    const schedule = await getSchedule(employee.id);

    const attendanceAt = resolveAttendanceTime(offline_time, sekarang, schedule);

    const event = await eventModel.recordEvent({
      employee_id: employee.id,
      kind: "check_in",
      occurred_at: attendanceAt.at,
      received_at: sekarang,
      source: attendanceAt.offline ? "offline_sync" : "online",
      note: note ?? null,
    });

    const local = toLocalTime(attendanceAt.at);
    const date = local.date;

    const terhalang = await blockedReasonForDate(
      employee.id,
      schedule,
      date,
    );
    if (terhalang) throw rejectEvent(event.id, terhalang, BadRequest);

    const existing = await attendanceModel.findByEmployeeAndDate(
      employee.id,
      date,
    );

    if (existing) {
      const message = existing.check_in_at
        ? `Kamu sudah melakukan absensi masuk hari ini pukul ${clockTimeOf(new Date(existing.check_in_at))}`
        : `Absensi tanggal ${date} sudah tercatat dengan status ${statusLabel(existing.status)}`;

      await eventModel.markRejected(event.id, message);

      throw Conflict(message, { attendance: existing });
    }

    const ditutup = blockedReasonForTime(schedule, local.minutesSinceMidnight);
    if (ditutup) throw rejectEvent(event.id, ditutup, BadRequest);

    const startMinutes = minutesFromClockTime(schedule.start_time);
    const diffMinutes = lateMinutesFrom(local.minutesSinceMidnight, startMinutes);

    const terlambat =
      arrivalDecision(schedule, local.minutesSinceMidnight) === "late";

    const attendance = await attendanceModel.createCheckIn({
      employee_id: employee.id,
      attendance_date: date,
      check_in_at: attendanceAt.at,
      check_in_recorded_at: sekarang,
      check_in_source: attendanceAt.offline ? "offline_sync" : "online",
      status: terlambat ? "late" : "present",
      late_minutes: terlambat ? diffMinutes : 0,
      note: attendanceAt.offline
        ? buildOfflineNote(attendanceAt.at, sekarang, note ?? null)
        : (note ?? null),
    });

    await eventModel.linkToAttendance(event.id, attendance.id);

    const recordedClockTime = clockTimeOf(attendanceAt.at);

    res.status(201).json({
      success: true,
      message: terlambat
        ? `Absensi masuk tercatat pukul ${recordedClockTime}, terlambat ${diffMinutes} menit dari jam masuk ${shortTime(schedule.start_time)}`
        : `Absensi masuk tercatat pukul ${recordedClockTime}`,
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
    const employee = await getRequesterEmployee(req, res);
    assertMayCheckIn(employee);

    const { offline_time } = req.body as { offline_time?: string };

    const sekarang = new Date();
    const schedule = await getSchedule(employee.id);

    const attendanceAt = resolveAttendanceTime(offline_time, sekarang, schedule);

    const event = await eventModel.recordEvent({
      employee_id: employee.id,
      kind: "check_out",
      occurred_at: attendanceAt.at,
      received_at: sekarang,
      source: attendanceAt.offline ? "offline_sync" : "online",
    });

    const local = toLocalTime(attendanceAt.at);
    const date = local.date;

    const existing = await attendanceModel.findByEmployeeAndDate(
      employee.id,
      date,
    );

    if (!existing || !existing.check_in_at) {
      throw rejectEvent(
        event.id,
        "Kamu belum melakukan absensi masuk hari ini sehingga belum dapat absen pulang",
        BadRequest,
      );
    }

    if (existing.check_out_at) {
      const message = `Kamu sudah melakukan absensi pulang hari ini pukul ${clockTimeOf(new Date(existing.check_out_at))}`;

      await eventModel.markRejected(event.id, message);

      throw Conflict(message, { attendance: existing });
    }

    const startMinutes = minutesFromClockTime(schedule.start_time);

    if (local.minutesSinceMidnight < startMinutes) {
      throw rejectEvent(
        event.id,
        `Absensi pulang belum dapat dilakukan sebelum jam kerja dimulai pukul ${shortTime(schedule.start_time)}`,
        BadRequest,
      );
    }

    const checkIn = new Date(existing.check_in_at);
    const workedMinutes = minutesBetween(checkIn, attendanceAt.at);

    if (workedMinutes <= 0) {
      throw rejectEvent(
        event.id,
        `Jam pulang harus setelah jam masuk pukul ${clockTimeOf(checkIn)}`,
        BadRequest,
      );
    }

    const attendance = await attendanceModel.setCheckOut(
      existing.id,
      attendanceAt.at,
      sekarang,
      attendanceAt.offline ? "offline_sync" : "online",
      workedMinutes,
    );

    if (!attendance) {
      throw Conflict(
        "Absensi pulang sudah tercatat dari permintaan lain, silakan muat ulang",
      );
    }

    await eventModel.linkToAttendance(event.id, attendance.id);

    res.json({
      success: true,
      message: `Absensi pulang tercatat pukul ${clockTimeOf(attendanceAt.at)}, total kerja ${formatDuration(workedMinutes)}`,
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
    const employee = await getRequesterEmployee(req, res);

    const sekarang = new Date();
    const date = todayInOfficeZone(sekarang);

    const schedule = await workScheduleModel.resolveForEmployee(employee.id);
    const attendance = await attendanceModel.findByEmployeeAndDate(
      employee.id,
      date,
    );

    const terhalang = schedule
      ? ((await blockedReasonForDate(employee.id, schedule, date)) ??
        (attendance
          ? null
          : blockedReasonForTime(
              schedule,
              toLocalTime(sekarang).minutesSinceMidnight,
            )))
      : "Belum ada jadwal kerja yang berlaku untukmu, hubungi admin";

    res.json({
      success: true,
      data: {
        date: date,
        server_time: clockTimeOf(sekarang),
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
    const employee = await getRequesterEmployee(req, res);

    const query = res.locals.query as {
      month?: number;
      year?: number;
      status?: attendanceModel.AttendanceStatus;
      page: number;
      limit: number;
    };

    const { month, year } = requestedMonth(query);
    const { start_date, end_date } = monthRange(month, year);

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
    const employee = await getRequesterEmployee(req, res);
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

    const { month, year } = requestedMonth(query);
    const { start_date, end_date } = monthRange(month, year);

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

function buildCorrectionNote(
  pengoreksi: Employee,
  reason: string,
  at: Date,
): string {
  const date = todayInOfficeZone(at);

  return `[Dikoreksi oleh ${pengoreksi.full_name} (${pengoreksi.employee_number}) pada ${date} ${clockTimeOf(at)}] ${reason}`;
}

interface TimeWitness {
  recorded_at: Date | null;
  source: attendanceModel.AttendanceSource | null;
}

function witnessAfterCorrection(
  waktuBaru: Date | null,
  waktuLama: Date | null,
  saksiLama: TimeWitness,
  correctedAt: Date,
): TimeWitness {
  if (!waktuBaru) return { recorded_at: null, source: null };

  const tidakBerubah =
    waktuLama !== null && new Date(waktuLama).getTime() === waktuBaru.getTime();

  if (tidakBerubah && saksiLama.recorded_at && saksiLama.source) {
    return saksiLama;
  }

  return { recorded_at: correctedAt, source: "correction" };
}

export async function CorrectAttendanceController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const activity = startActivity(req);
    const pengoreksi = await getRequesterEmployee(req, res);
    const { id } = res.locals.params as { id: string };

    const data = req.body as {
      status: attendanceModel.AttendanceStatus;
      check_in_at?: string | null;
      check_out_at?: string | null;
      reason: string;
    };

    const existing = await attendanceModel.findById(id);
    if (!existing) throw NotFound("Data absensi tidak ditemukan");

    const checkIn = data.check_in_at ? new Date(data.check_in_at) : null;
    const checkOut = data.check_out_at ? new Date(data.check_out_at) : null;

    if (checkOut && !checkIn) {
      throw BadRequest("Jam pulang tidak dapat diisi tanpa jam masuk");
    }

    let lateMinutes = 0;

    if (checkIn && requiresCheckIn(data.status)) {
      const schedule = await getSchedule(existing.employee_id);
      const localCheckIn = toLocalTime(checkIn);

      lateMinutes =
        data.status === "late"
          ? lateMinutesFrom(
              localCheckIn.minutesSinceMidnight,
              minutesFromClockTime(schedule.start_time),
            )
          : 0;
    }

    const correctedAt = new Date();
    const newCheckIn = requiresCheckIn(data.status) ? checkIn : null;
    const newCheckOut = requiresCheckIn(data.status) ? checkOut : null;

    const checkInWitness = witnessAfterCorrection(
      newCheckIn,
      existing.check_in_at,
      {
        recorded_at: existing.check_in_recorded_at,
        source: existing.check_in_source,
      },
      correctedAt,
    );

    const checkOutWitness = witnessAfterCorrection(
      newCheckOut,
      existing.check_out_at,
      {
        recorded_at: existing.check_out_recorded_at,
        source: existing.check_out_source,
      },
      correctedAt,
    );

    const attendance = await attendanceModel.correctAttendance(id, {
      status: data.status,
      check_in_at: newCheckIn,
      check_in_recorded_at: checkInWitness.recorded_at,
      check_in_source: checkInWitness.source,
      check_out_at: newCheckOut,
      check_out_recorded_at: checkOutWitness.recorded_at,
      check_out_source: checkOutWitness.source,
      late_minutes: lateMinutes,
      work_minutes:
        newCheckIn && newCheckOut ? minutesBetween(newCheckIn, newCheckOut) : null,
      note: buildCorrectionNote(pengoreksi, data.reason, correctedAt),
    });

    activity.success({
      action: "attendance.correct",
      entity: "attendance",
      entity_id: id,
      summary: `Absensi ${existing.attendance_date} dikoreksi menjadi ${statusLabel(data.status)}`,
      metadata: {
        employee_id: existing.employee_id,
        from_status: existing.status,
        to_status: data.status,
        reason: data.reason,
      },
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
    const activity = startActivity(req);
    const dikirim = req.header(CRON_HEADER);

    if (!env.CRON_SECRET) {
      throw Forbidden(
        "CRON_SECRET belum diatur di server sehingga job penutup hari dinonaktifkan",
      );
    }

    if (!dikirim || dikirim !== env.CRON_SECRET) {
      throw Unauthorized(
        `Header ${CRON_HEADER} tidak cocok, job penutup hari ditolak`,
      );
    }

    const query = res.locals.query as { date?: IsoDate };
    const date = query.date ?? todayInOfficeZone();
    const day = dayNameOf(date);

    const holiday = await holidayModel.findByDate(date);
    const approvedLeaves = await attendanceModel.findApprovedLeaveOn(date);
    const alreadyRecorded = new Set(
      await attendanceModel.findEmployeeIdsOnDate(date),
    );
    const employeeSchedules = await workScheduleModel.resolveForAllActive();

    const leaveByEmployee = new Map(
      approvedLeaves.map((row) => [row.employee_id, row.leave_request_id]),
    );

    const markers: attendanceModel.MarkerRow[] = [];
    let skipped = 0;

    for (const { employee_id, schedule } of employeeSchedules) {
      const leave_request_id = leaveByEmployee.get(employee_id);

      switch (
        decideDailyMarker({
          alreadyRecorded: alreadyRecorded.has(employee_id),
          isHoliday: Boolean(holiday),
          onLeave: Boolean(leave_request_id),
          isWorkday: isWorkingDay(schedule, day),
        })
      ) {
        case "holiday":
          markers.push({
            employee_id,
            status: "holiday",
            note: holiday?.name ?? null,
          });
          break;

        case "leave":
          markers.push({ employee_id, status: "leave", leave_request_id });
          break;

        case "absent":
          markers.push({ employee_id, status: "absent" });
          break;

        case "lewati":
          skipped += 1;
          break;
      }
    }

    let stored = 0;

    for (let i = 0; i < markers.length; i += BATCH_SIZE) {
      const chunk = markers.slice(i, i + BATCH_SIZE);
      const client = await pool.connect();

      try {
        await client.query("BEGIN");
        stored += await attendanceModel.insertMarkers(
          client,
          date,
          chunk,
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }

    const countByStatus = (status: string) =>
      markers.filter((row) => row.status === status).length;

    activity.success({
      action: "attendance.close_day",
      entity: "attendance",
      summary: `Penutupan hari ${date}: ${stored} baris dibuat, ${skipped} dilewati`,
      metadata: {
        date,
        created: stored,
        skipped,
        marked: {
          holiday: countByStatus("holiday"),
          leave: countByStatus("leave"),
          absent: countByStatus("absent"),
        },
      },
    });

    res.json({
      success: true,
      message: `Penutupan hari ${date} selesai, ${stored} baris absensi baru dibuat`,
      data: {
        date: date,
        is_holiday: Boolean(holiday),
        holiday_name: holiday?.name ?? null,
        created: stored,
        skipped: skipped,
        marked: {
          holiday: countByStatus("holiday"),
          leave: countByStatus("leave"),
          absent: countByStatus("absent"),
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function OfflineLogController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const query = res.locals.query as attendanceModel.OfflineLogParams;
    const { rows, total } = await attendanceModel.listOfflineSync(query);

    res.json({
      success: true,
      data: rows,
      meta: meta(total, query.page, query.limit),
    });
  } catch (err) {
    next(err);
  }
}

export async function EventLogController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const query = res.locals.query as eventModel.ListEventParams;
    const { rows, total } = await eventModel.listEvents(query);

    res.json({
      success: true,
      data: rows,
      meta: meta(total, query.page, query.limit),
    });
  } catch (err) {
    next(err);
  }
}
