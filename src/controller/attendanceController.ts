import type { Request, Response, NextFunction } from "express";
import { pool } from "../config/databaseConnection.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { startActivity } from "../helpers/activityLog.js";
import { rejectStaleUpdate } from "../helpers/concurrency.js";
import * as attendanceModel from "../models/attendance.js";
import * as eventModel from "../models/attendanceEvent.js";
import * as workScheduleModel from "../models/workSchedule.js";
import * as holidayModel from "../models/holiday.js";
import * as leaveRequestModel from "../models/leaveRequest.js";
import type { Employee } from "../models/employee.js";
import type { WorkSchedule } from "../models/workSchedule.js";
import type { ListAttendanceParams } from "../models/attendance.js";
import {
  toLocalTime,
  todayInOfficeZone,
  clockTimeOf,
  minutesFromClockTime,
  lateMinutesFrom,
  dayNameOf,
  minutesBetween,
  shiftDate,
  type IsoDate,
} from "../helpers/timezone.js";
import { isWorkingDay } from "../models/workSchedule.js";
import {
  rejectionReasonForOfflineTime,
  buildOfflineNote,
  DEVICE_CLOCK_SKEW_MINUTES,
} from "../helpers/offlineAttendance.js";
import {
  statusLabel,
  requiresCheckIn,
  formatDuration,
  decideArrivalStatus,
  type ArrivalOutcome,
} from "../helpers/attendanceStatus.js";
import {
  AppError,
  BadRequest,
  Conflict,
  Forbidden,
  NotFound,
  Unauthorized,
} from "../helpers/appError.js";
import { plural } from "../helpers/plural.js";
import { closeDay, dayClosingSummary } from "../helpers/dayClosing.js";
import { requireRequestEmployee } from "../helpers/requestEmployee.js";
import { paginated, paginationMeta } from "../helpers/pagination.js";

const CRON_HEADER = "x-cron-secret";

function assertMayCheckIn(employee: Employee): void {
  if (!employee.is_active) {
    throw Forbidden(
      "Your employee record is inactive, so you cannot record attendance. Please contact an admin",
    );
  }

  if (employee.employment_status === "resigned") {
    throw Forbidden("Employees who have resigned cannot record attendance");
  }
}

async function getSchedule(employee_id: string): Promise<WorkSchedule> {
  const schedule = await workScheduleModel.resolveForEmployee(employee_id);

  if (!schedule) {
    throw BadRequest(
      "No work schedule applies to you yet, please contact an admin to set one up",
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
  const now = toLocalTime();
  const [thisYear, thisMonth] = now.date.split("-").map(Number);

  return {
    month: query.month ?? thisMonth!,
    year: query.year ?? thisYear!,
  };
}

async function blockedReasonForDate(
  employee_id: string,
  schedule: WorkSchedule,
  date: IsoDate,
): Promise<string | null> {
  const day = dayNameOf(date);

  if (!isWorkingDay(schedule, day)) {
    return `${date} is not a workday according to the ${schedule.name} schedule`;
  }

  // Keduanya dibaca bersamaan. Hari libur tetap didahulukan sebagai alasan
  const [holiday, leave] = await Promise.all([
    holidayModel.findByDate(date),
    leaveRequestModel.findApprovedCovering(employee_id, date),
  ]);

  if (holiday) {
    return `${date} is a holiday: ${holiday.name}`;
  }

  if (leave) {
    return `You are on approved leave on ${date}`;
  }

  return null;
}

function rejectEvent(
  eventId: string,
  reason: string,
  makeError: (message: string) => Error,
): Error {
  void eventModel
    .markRejected(eventId, reason)
    .catch((err) =>
      logger.warn(
        { err, eventId },
        "Failed to mark the rejected attendance event",
      ),
    );

  return makeError(reason);
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

  // Selisih sekecil ini berarti tombol ditekan saat online. Jam server yang
  // dipakai, jadi jam perangkat tidak ikut menentukan status kehadiran
  if (
    Math.abs(serverTime.getTime() - at.getTime()) <=
    DEVICE_CLOCK_SKEW_MINUTES * 60_000
  ) {
    return { at: serverTime, offline: false };
  }

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
  currentMinutes: number,
): ArrivalOutcome {
  return decideArrivalStatus(
    currentMinutes,
    minutesFromClockTime(schedule.start_time),
    schedule.late_tolerance_minutes,
    minutesFromClockTime(schedule.absent_cutoff_time),
  );
}

function blockedReasonForTime(
  schedule: WorkSchedule,
  currentMinutes: number,
): string | null {
  if (arrivalDecision(schedule, currentMinutes) !== "rejected") return null;

  return `Check-in closed at ${shortTime(schedule.absent_cutoff_time)}, you are marked absent today`;
}

// Pesan penolakan menyebut karyawan sudah tidak hadir, jadi barisnya langsung
// dibuat saat itu juga, tidak menunggu penutupan hari. Kalau gagal disimpan,
// penolakan tetap berjalan dan penutupan hari yang akan menandainya nanti
async function markAbsentAfterCutoff(
  employee_id: string,
  date: IsoDate,
  attemptedAt: string,
  schedule: WorkSchedule,
): Promise<void> {
  try {
    await attendanceModel.insertMarkers(pool, date, [
      {
        employee_id,
        status: "absent",
        note: `Check-in attempted at ${attemptedAt}, after the ${shortTime(schedule.absent_cutoff_time)} cutoff`,
      },
    ]);
  } catch (err) {
    logger.warn(
      { err, employee_id, date },
      "Failed to mark absence after the check-in cutoff",
    );
  }
}

export async function CheckInController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const activity = startActivity(req);

  try {
    const employee = await requireRequestEmployee(req, res);
    assertMayCheckIn(employee);

    const { note, offline_time } = req.body as {
      note?: string;
      offline_time?: string;
    };

    const now = new Date();
    const schedule = await getSchedule(employee.id);

    const attendanceAt = resolveAttendanceTime(offline_time, now, schedule);

    const event = await eventModel.recordEvent({
      employee_id: employee.id,
      kind: "check_in",
      occurred_at: attendanceAt.at,
      received_at: now,
      source: attendanceAt.offline ? "offline_sync" : "online",
      note: note ?? null,
    });

    const local = toLocalTime(attendanceAt.at);
    const date = local.date;

    const blockedReason = await blockedReasonForDate(
      employee.id,
      schedule,
      date,
    );
    if (blockedReason) throw rejectEvent(event.id, blockedReason, BadRequest);

    const existing = await attendanceModel.findByEmployeeAndDate(
      employee.id,
      date,
    );

    if (existing) {
      const message = existing.check_in_at
        ? `You already checked in today at ${clockTimeOf(new Date(existing.check_in_at))}`
        : `Attendance for ${date} is already recorded with status ${statusLabel(existing.status)}`;

      throw rejectEvent(event.id, message, (reason) =>
        Conflict(reason, { attendance: existing }),
      );
    }

    const closedReason = blockedReasonForTime(
      schedule,
      local.minutesSinceMidnight,
    );
    if (closedReason) {
      await markAbsentAfterCutoff(
        employee.id,
        date,
        clockTimeOf(attendanceAt.at),
        schedule,
      );
      throw rejectEvent(event.id, closedReason, BadRequest);
    }

    const startMinutes = minutesFromClockTime(schedule.start_time);
    const diffMinutes = lateMinutesFrom(
      local.minutesSinceMidnight,
      startMinutes,
    );

    const isLate =
      arrivalDecision(schedule, local.minutesSinceMidnight) === "late";

    const attendance = await attendanceModel.createCheckIn({
      employee_id: employee.id,
      attendance_date: date,
      check_in_at: attendanceAt.at,
      check_in_recorded_at: now,
      check_in_source: attendanceAt.offline ? "offline_sync" : "online",
      status: isLate ? "late" : "present",
      late_minutes: isLate ? diffMinutes : 0,
      note: attendanceAt.offline
        ? buildOfflineNote(attendanceAt.at, now, note ?? null)
        : (note ?? null),
    });

    await eventModel.linkToAttendance(event.id, attendance.id);

    const recordedClockTime = clockTimeOf(attendanceAt.at);

    activity.success({
      action: "attendance.check_in",
      entity: "attendance",
      entity_id: attendance.id,
      actor_name: employee.full_name,
      summary: `${employee.full_name} checked in at ${recordedClockTime}`,
      metadata: {
        employee_id: employee.id,
        status: attendance.status,
        late_minutes: attendance.late_minutes,
        source: attendance.check_in_source,
      },
    });

    res.status(201).json({
      success: true,
      message: isLate
        ? `Check-in recorded at ${recordedClockTime}, ${plural(diffMinutes, "minute")} late for the ${shortTime(schedule.start_time)} start time`
        : `Check-in recorded at ${recordedClockTime}`,
      data: attendance,
    });
  } catch (err) {
    activity.failed({
      action: "attendance.check_in",
      entity: "attendance",
      summary: "Check-in rejected",
      metadata: {
        reason: err instanceof AppError ? err.message : "unexpected error",
      },
    });

    next(err);
  }
}

export async function CheckOutController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const activity = startActivity(req);

  try {
    const employee = await requireRequestEmployee(req, res);
    assertMayCheckIn(employee);

    const { offline_time } = req.body as { offline_time?: string };

    const now = new Date();
    const schedule = await getSchedule(employee.id);

    const attendanceAt = resolveAttendanceTime(offline_time, now, schedule);

    const event = await eventModel.recordEvent({
      employee_id: employee.id,
      kind: "check_out",
      occurred_at: attendanceAt.at,
      received_at: now,
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
        "You haven't checked in today, so you can't check out yet",
        BadRequest,
      );
    }

    if (existing.check_out_at) {
      const message = `You already checked out today at ${clockTimeOf(new Date(existing.check_out_at))}`;

      throw rejectEvent(event.id, message, (reason) =>
        Conflict(reason, { attendance: existing }),
      );
    }

    const startMinutes = minutesFromClockTime(schedule.start_time);

    if (local.minutesSinceMidnight < startMinutes) {
      throw rejectEvent(
        event.id,
        `You can't check out before work starts at ${shortTime(schedule.start_time)}`,
        BadRequest,
      );
    }

    const checkIn = new Date(existing.check_in_at);
    const workedMinutes = minutesBetween(checkIn, attendanceAt.at);

    if (workedMinutes <= 0) {
      throw rejectEvent(
        event.id,
        `Check-out time must be after the check-in time of ${clockTimeOf(checkIn)}`,
        BadRequest,
      );
    }

    const attendance = await attendanceModel.setCheckOut(
      existing.id,
      attendanceAt.at,
      now,
      attendanceAt.offline ? "offline_sync" : "online",
      workedMinutes,
    );

    if (!attendance) {
      throw Conflict(
        "Check-out was already recorded by another request, please reload",
      );
    }

    await eventModel.linkToAttendance(event.id, attendance.id);

    activity.success({
      action: "attendance.check_out",
      entity: "attendance",
      entity_id: attendance.id,
      actor_name: employee.full_name,
      summary: `${employee.full_name} checked out at ${clockTimeOf(attendanceAt.at)}`,
      metadata: {
        employee_id: employee.id,
        work_minutes: workedMinutes,
        source: attendance.check_out_source,
      },
    });

    res.json({
      success: true,
      message: `Check-out recorded at ${clockTimeOf(attendanceAt.at)}, total work time ${formatDuration(workedMinutes)}`,
      data: attendance,
    });
  } catch (err) {
    activity.failed({
      action: "attendance.check_out",
      entity: "attendance",
      summary: "Check-out rejected",
      metadata: {
        reason: err instanceof AppError ? err.message : "unexpected error",
      },
    });

    next(err);
  }
}

// Baris tanpa jam masuk (tidak hadir, cuti, libur) tetap perlu alasan,
// supaya layar tidak menampilkan tombol mati tanpa penjelasan
function recordedWithoutCheckIn(
  attendance: attendanceModel.Attendance,
): string | null {
  if (attendance.check_in_at) return null;

  return `Today's attendance is recorded as ${statusLabel(attendance.status)}`;
}

export async function TodayAttendanceController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const employee = await requireRequestEmployee(req, res);

    const now = new Date();
    const date = todayInOfficeZone(now);

    const [schedule, attendance] = await Promise.all([
      workScheduleModel.resolveForEmployee(employee.id),
      attendanceModel.findByEmployeeAndDate(employee.id, date),
    ]);

    const blockedReason = schedule
      ? ((await blockedReasonForDate(employee.id, schedule, date)) ??
        (attendance
          ? recordedWithoutCheckIn(attendance)
          : blockedReasonForTime(
              schedule,
              toLocalTime(now).minutesSinceMidnight,
            )))
      : "No work schedule applies to you yet, please contact an admin";

    res.json({
      success: true,
      data: {
        date: date,
        server_time: clockTimeOf(now),
        schedule,
        attendance,
        can_check_in: Boolean(schedule) && !blockedReason && !attendance,
        can_check_out: Boolean(
          attendance?.check_in_at && !attendance.check_out_at,
        ),
        blocked_reason: blockedReason,
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
    const employee = await requireRequestEmployee(req, res);

    const query = res.locals.query as {
      month?: number;
      year?: number;
      status?: attendanceModel.AttendanceStatus;
      page: number;
      limit: number;
    };

    const { month, year } = requestedMonth(query);
    const { start_date, end_date } = monthRange(month, year);

    const [{ rows, total }, summary] = await Promise.all([
      attendanceModel.listAttendances({
        employee_id: employee.id,
        status: query.status,
        start_date,
        end_date,
        page: query.page,
        limit: query.limit,
      }),
      attendanceModel.summaryFor(employee.id, start_date, end_date),
    ]);

    res.json({
      success: true,
      data: rows,
      summary,
      period: { month, year, start_date, end_date },
      meta: paginationMeta(total, query.page, query.limit),
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
    const employee = await requireRequestEmployee(req, res);
    const query = res.locals.query as ListAttendanceParams;

    const { rows, total } = await attendanceModel.listAttendances({
      ...query,
      manager_id: employee.id,
    });

    res.json(paginated(rows, total, query));
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

    res.json(paginated(rows, total, query));
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
  corrector: Employee,
  reason: string,
  at: Date,
): string {
  const date = todayInOfficeZone(at);

  return `[Corrected by ${corrector.full_name} (${corrector.employee_number}) on ${date} ${clockTimeOf(at)}] ${reason}`;
}

interface TimeWitness {
  recorded_at: Date | null;
  source: attendanceModel.AttendanceSource | null;
}

function witnessAfterCorrection(
  newTime: Date | null,
  previousTime: Date | null,
  previousWitness: TimeWitness,
  correctedAt: Date,
): TimeWitness {
  if (!newTime) return { recorded_at: null, source: null };

  const unchanged =
    previousTime !== null &&
    new Date(previousTime).getTime() === newTime.getTime();

  if (unchanged && previousWitness.recorded_at && previousWitness.source) {
    return previousWitness;
  }

  return { recorded_at: correctedAt, source: "correction" };
}

// Koreksi hanya boleh menggeser jam pada hari absensi itu sendiri. Jam pulang
// boleh lewat tengah malam (lembur), tetapi tidak lebih dari esok harinya.
// Jam yang belum terjadi juga ditolak: jam hasil koreksi dicatat dengan waktu
// koreksi sebagai saksinya, dan database menolak saksi yang mendahului jamnya
function assertWithinAttendanceDay(
  date: IsoDate,
  checkIn: Date | null,
  checkOut: Date | null,
  now: Date,
): void {
  if (checkIn && checkIn > now) {
    throw BadRequest(
      `Check-in time ${clockTimeOf(checkIn)} on ${todayInOfficeZone(checkIn)} has not happened yet`,
    );
  }

  if (checkOut && checkOut > now) {
    throw BadRequest(
      `Check-out time ${clockTimeOf(checkOut)} on ${todayInOfficeZone(checkOut)} has not happened yet, record it after it happens`,
    );
  }

  if (checkIn && todayInOfficeZone(checkIn) !== date) {
    throw BadRequest(`Check-in time must be on the attendance date ${date}`);
  }

  if (checkOut && todayInOfficeZone(checkOut) > shiftDate(date, 1)) {
    throw BadRequest(`Check-out time must be on ${date} or the following day`);
  }
}

// Hari cuti selalu berasal dari pengajuan yang disetujui, dan saldonya ikut
// terpotong. Mengoreksinya langsung membuat absensi dan saldo tidak cocok,
// jadi perubahannya harus lewat pengajuan cuti itu sendiri
function assertCorrectableLeave(
  existing: attendanceModel.Attendance,
  status: attendanceModel.AttendanceStatus,
): void {
  if (existing.leave_request_id && status !== "leave") {
    throw BadRequest(
      "This day belongs to an approved leave request. Cancel or change the leave request instead of correcting the attendance",
      { leave_request_id: existing.leave_request_id },
    );
  }

  if (status === "leave" && !existing.leave_request_id) {
    throw BadRequest(
      "Leave days can only come from an approved leave request, so attendance cannot be corrected to leave",
    );
  }
}

export async function CorrectAttendanceController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const activity = startActivity(req);
    const corrector = await requireRequestEmployee(req, res);
    const { id } = res.locals.params as { id: string };

    const data = req.body as {
      status: attendanceModel.AttendanceStatus;
      check_in_at?: string | null;
      check_out_at?: string | null;
      reason: string;
      updated_at?: string;
    };

    const existing = await attendanceModel.findById(id);
    if (!existing) throw NotFound("Attendance record not found");

    assertCorrectableLeave(existing, data.status);

    const checkIn = data.check_in_at ? new Date(data.check_in_at) : null;
    const checkOut = data.check_out_at ? new Date(data.check_out_at) : null;

    if (checkOut && !checkIn) {
      throw BadRequest("Check-out time cannot be set without a check-in time");
    }

    const correctedAt = new Date();

    assertWithinAttendanceDay(
      existing.attendance_date,
      checkIn,
      checkOut,
      correctedAt,
    );

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

    const attendance = await attendanceModel.correctAttendance(
      id,
      {
        status: data.status,
        check_in_at: newCheckIn,
        check_in_recorded_at: checkInWitness.recorded_at,
        check_in_source: checkInWitness.source,
        check_out_at: newCheckOut,
        check_out_recorded_at: checkOutWitness.recorded_at,
        check_out_source: checkOutWitness.source,
        late_minutes: lateMinutes,
        work_minutes:
          newCheckIn && newCheckOut
            ? minutesBetween(newCheckIn, newCheckOut)
            : null,
        note: buildCorrectionNote(corrector, data.reason, correctedAt),
      },
      pool,
      data.updated_at,
    );

    if (!attendance) {
      throw await rejectStaleUpdate(
        "attendance",
        () => attendanceModel.findById(id),
        "Attendance record not found",
      );
    }

    activity.success({
      action: "attendance.correct",
      entity: "attendance",
      entity_id: id,
      summary: `Attendance for ${existing.attendance_date} corrected to ${statusLabel(data.status)}`,
      metadata: {
        employee_id: existing.employee_id,
        from_status: existing.status,
        to_status: data.status,
        reason: data.reason,
      },
    });

    res.json({
      success: true,
      message: `Attendance for ${existing.attendance_date} was corrected to ${statusLabel(data.status)}`,
      data: attendance,
    });
  } catch (err) {
    next(err);
  }
}

// Job penutup hari dipanggil penjadwal, bukan pengguna, jadi penjaganya
// rahasia bersama di header dan bukan JWT
function assertCronAuthorized(req: Request): void {
  if (!env.CRON_SECRET) {
    throw Forbidden(
      "CRON_SECRET is not set on the server, so the day-closing job is disabled",
    );
  }

  if (req.header(CRON_HEADER) !== env.CRON_SECRET) {
    throw Unauthorized(
      `Header ${CRON_HEADER} does not match, day-closing job rejected`,
    );
  }
}

export async function CloseDayController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const activity = startActivity(req);

    assertCronAuthorized(req);

    const query = res.locals.query as { date?: IsoDate };
    const result = await closeDay(query.date ?? todayInOfficeZone());

    activity.success({
      action: "attendance.close_day",
      entity: "attendance",
      summary: dayClosingSummary(result),
      metadata: { ...result },
    });

    res.json({
      success: true,
      message: `Day closing for ${result.date} finished, ${result.created} new attendance rows created`,
      data: result,
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

    res.json(paginated(rows, total, query));
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

    res.json(paginated(rows, total, query));
  } catch (err) {
    next(err);
  }
}
