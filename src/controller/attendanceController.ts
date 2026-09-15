import type { Request, Response, NextFunction } from "express";
import { pool } from "../config/databaseConnection.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { startActivity } from "../helpers/activityLog.js";
import * as attendanceModel from "../models/attendance.js";
import * as eventModel from "../models/attendanceEvent.js";
import * as workScheduleModel from "../models/workSchedule.js";
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
  type DayName,
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
import { plural } from "../helpers/plural.js";
import { requireRequestEmployee } from "../helpers/requestEmployee.js";

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

  const holiday = await holidayModel.findByDate(date);
  if (holiday) {
    return `${date} is a holiday: ${holiday.name}`;
  }

  const leave = await leaveRequestModel.findApprovedCovering(employee_id, date);

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

export async function CheckInController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
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

      await eventModel.markRejected(event.id, message);

      throw Conflict(message, { attendance: existing });
    }

    const closedReason = blockedReasonForTime(
      schedule,
      local.minutesSinceMidnight,
    );
    if (closedReason) throw rejectEvent(event.id, closedReason, BadRequest);

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

    res.status(201).json({
      success: true,
      message: isLate
        ? `Check-in recorded at ${recordedClockTime}, ${plural(diffMinutes, "minute")} late for the ${shortTime(schedule.start_time)} start time`
        : `Check-in recorded at ${recordedClockTime}`,
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

      await eventModel.markRejected(event.id, message);

      throw Conflict(message, { attendance: existing });
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

    res.json({
      success: true,
      message: `Check-out recorded at ${clockTimeOf(attendanceAt.at)}, total work time ${formatDuration(workedMinutes)}`,
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
    const employee = await requireRequestEmployee(req, res);

    const now = new Date();
    const date = todayInOfficeZone(now);

    const schedule = await workScheduleModel.resolveForEmployee(employee.id);
    const attendance = await attendanceModel.findByEmployeeAndDate(
      employee.id,
      date,
    );

    const blockedReason = schedule
      ? ((await blockedReasonForDate(employee.id, schedule, date)) ??
        (attendance
          ? null
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
    const employee = await requireRequestEmployee(req, res);
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
    };

    const existing = await attendanceModel.findById(id);
    if (!existing) throw NotFound("Attendance record not found");

    const checkIn = data.check_in_at ? new Date(data.check_in_at) : null;
    const checkOut = data.check_out_at ? new Date(data.check_out_at) : null;

    if (checkOut && !checkIn) {
      throw BadRequest("Check-out time cannot be set without a check-in time");
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
        newCheckIn && newCheckOut
          ? minutesBetween(newCheckIn, newCheckOut)
          : null,
      note: buildCorrectionNote(corrector, data.reason, correctedAt),
    });

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

interface DayFacts {
  holiday: Awaited<ReturnType<typeof holidayModel.findByDate>>;
  leaveByEmployee: Map<string, string>;
  alreadyRecorded: Set<string>;
  employeeSchedules: Awaited<
    ReturnType<typeof workScheduleModel.resolveForAllActive>
  >;
}

// Semua keadaan hari itu dikumpulkan sekali di depan, supaya keputusan
// per karyawan tidak menyentuh database lagi
async function collectDayFacts(date: IsoDate): Promise<DayFacts> {
  const [holiday, approvedLeaves, recorded, employeeSchedules] =
    await Promise.all([
      holidayModel.findByDate(date),
      attendanceModel.findApprovedLeaveOn(date),
      attendanceModel.findEmployeeIdsOnDate(date),
      workScheduleModel.resolveForAllActive(),
    ]);

  return {
    holiday,
    leaveByEmployee: new Map(
      approvedLeaves.map((row) => [row.employee_id, row.leave_request_id]),
    ),
    alreadyRecorded: new Set(recorded),
    employeeSchedules,
  };
}

// Menentukan penanda harian tiap karyawan. skipped dihitung terpisah karena
// baris yang dilewati memang tidak menghasilkan apa pun untuk disimpan
function buildMarkers(
  facts: DayFacts,
  day: DayName,
): { markers: attendanceModel.MarkerRow[]; skipped: number } {
  const markers: attendanceModel.MarkerRow[] = [];
  let skipped = 0;

  for (const { employee_id, schedule } of facts.employeeSchedules) {
    const leave_request_id = facts.leaveByEmployee.get(employee_id);

    switch (
      decideDailyMarker({
        alreadyRecorded: facts.alreadyRecorded.has(employee_id),
        isHoliday: Boolean(facts.holiday),
        onLeave: Boolean(leave_request_id),
        isWorkday: isWorkingDay(schedule, day),
      })
    ) {
      case "holiday":
        markers.push({
          employee_id,
          status: "holiday",
          note: facts.holiday?.name ?? null,
        });
        break;

      case "leave":
        markers.push({ employee_id, status: "leave", leave_request_id });
        break;

      case "absent":
        markers.push({ employee_id, status: "absent" });
        break;

      case "skip":
        skipped += 1;
        break;
    }
  }

  return { markers, skipped };
}

// Ditulis per potongan supaya satu transaksi tidak menahan ribuan baris
// sekaligus. Tiap potongan berdiri sendiri
async function storeMarkers(
  date: IsoDate,
  markers: attendanceModel.MarkerRow[],
): Promise<number> {
  let stored = 0;

  for (let i = 0; i < markers.length; i += BATCH_SIZE) {
    const chunk = markers.slice(i, i + BATCH_SIZE);
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      stored += await attendanceModel.insertMarkers(client, date, chunk);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  return stored;
}

function countMarkers(markers: attendanceModel.MarkerRow[]) {
  const count = (status: string) =>
    markers.filter((row) => row.status === status).length;

  return {
    holiday: count("holiday"),
    leave: count("leave"),
    absent: count("absent"),
  };
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
    const date = query.date ?? todayInOfficeZone();

    const facts = await collectDayFacts(date);
    const { markers, skipped } = buildMarkers(facts, dayNameOf(date));
    const stored = await storeMarkers(date, markers);

    const marked = countMarkers(markers);

    activity.success({
      action: "attendance.close_day",
      entity: "attendance",
      summary: `Day closing for ${date}: ${plural(stored, "row")} created, ${skipped} skipped`,
      metadata: { date, created: stored, skipped, marked },
    });

    res.json({
      success: true,
      message: `Day closing for ${date} finished, ${stored} new attendance rows created`,
      data: {
        date,
        is_holiday: Boolean(facts.holiday),
        holiday_name: facts.holiday?.name ?? null,
        created: stored,
        skipped,
        marked,
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
