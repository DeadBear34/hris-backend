import type { Request, Response, NextFunction } from "express";
import { pool } from "../config/databaseConnection.js";
import * as employeeModel from "../models/employee.js";
import * as holidayModel from "../models/holiday.js";
import * as leaveTypeModel from "../models/leaveType.js";
import * as leaveRequestModel from "../models/leaveRequest.js";
import * as balanceModel from "../models/leaveBalance.js";
import * as attachmentModel from "../models/leaveAttachment.js";
import * as attendanceModel from "../models/attendance.js";
import * as workScheduleModel from "../models/workSchedule.js";
import type { Employee } from "../models/employee.js";
import type { Executor } from "../models/user.js";
import type { LeaveType } from "../models/leaveType.js";
import type {
  LeaveRequest,
  ListLeaveRequestParams,
} from "../models/leaveRequest.js";
import {
  countWorkdays,
  daysFromToday,
  isPastDate,
} from "../helpers/workdays.js";
import { canTransition, statusLabel } from "../helpers/leaveStatus.js";
import { hasFeature } from "../middlewares/feature.js";
import {
  BadRequest,
  Conflict,
  Forbidden,
  NotFound,
  Unauthorized,
} from "../helpers/appError.js";

const SICK_LEAVE_CODE = "SICK";

interface Requester {
  employee: Employee;
  canApproveAll: boolean;
  canViewAll: boolean;
}

async function getRequester(req: Request, res: Response): Promise<Requester> {
  if (!req.user)
    throw Unauthorized("Kamu belum login, silakan masuk terlebih dahulu");

  const employee = await employeeModel.findByUserId(req.user.id);

  if (!employee) {
    throw BadRequest(
      "Akun kamu belum terhubung ke data karyawan, hubungi admin terlebih dahulu",
    );
  }

  res.locals.employee ??= employee;

  return {
    employee,
    canApproveAll: await hasFeature(req, res, "leave.approve_all"),
    canViewAll: await hasFeature(req, res, "leave.view_all"),
  };
}

function resolveApprover(employee: Employee): string | null {
  return employee.manager_id ?? null;
}

function canView(request: LeaveRequest, requester: Requester): boolean {
  return (
    requester.canViewAll ||
    request.employee_id === requester.employee.id ||
    request.approver_id === requester.employee.id
  );
}

function canDecide(request: LeaveRequest, requester: Requester): boolean {
  return (
    requester.canApproveAll || request.approver_id === requester.employee.id
  );
}

function periodYearOf(date: string): number {
  return Number(date.slice(0, 4));
}

function meta(total: number, page: number, limit: number) {
  return { page, limit, total, total_pages: Math.ceil(total / limit) };
}

async function countWorkdaysFor(
  start_date: string,
  end_date: string,
): Promise<number> {
  const holidays = await holidayModel.findDatesBetween(start_date, end_date);

  return countWorkdays(start_date, end_date, holidays);
}

function validasiTanggal(
  leaveType: LeaveType,
  start_date: string,
  totalDays: number,
): void {
  if (totalDays <= 0) {
    throw BadRequest(
      "Rentang tanggal tersebut tidak memuat satu pun hari kerja",
    );
  }

  const canGoBack = leaveType.code === SICK_LEAVE_CODE;

  if (!canGoBack && isPastDate(start_date)) {
    throw BadRequest(
      "Pengajuan untuk tanggal yang sudah lewat hanya diperbolehkan untuk cuti sakit",
    );
  }

  if (
    leaveType.max_days_per_request !== null &&
    totalDays > leaveType.max_days_per_request
  ) {
    throw BadRequest(
      `Jenis cuti ini maksimal ${leaveType.max_days_per_request} hari kerja per pengajuan, sedangkan pengajuanmu ${totalDays} hari`,
    );
  }

  if (!canGoBack && leaveType.min_notice_days > 0) {
    const jarak = daysFromToday(start_date);

    if (jarak < leaveType.min_notice_days) {
      throw BadRequest(
        `Jenis cuti ini harus diajukan minimal ${leaveType.min_notice_days} hari sebelum tanggal mulai`,
      );
    }
  }
}

function validasiGender(leaveType: LeaveType, employee: Employee): void {
  if (
    leaveType.gender_restriction &&
    leaveType.gender_restriction !== employee.gender
  ) {
    throw BadRequest(
      `Jenis cuti ${leaveType.name} tidak tersedia untuk gender kamu`,
    );
  }
}

async function validasiSaldo(
  leaveType: LeaveType,
  employee: Employee,
  totalDays: number,
  periode: number,
): Promise<void> {
  if (!leaveType.deducts_balance) return;

  const saldo = await balanceModel.balanceFor(
    employee.id,
    leaveType.id,
    periode,
  );

  if (saldo < totalDays) {
    throw BadRequest(
      `Saldo ${leaveType.name} tidak mencukupi. Tersisa ${saldo} hari, sedangkan pengajuanmu ${totalDays} hari`,
      { balance: saldo, requested: totalDays },
    );
  }
}

export function attachmentRequired(
  leaveType: LeaveType,
  totalDays: number,
): boolean {
  if (!leaveType.requires_attachment) return false;

  if (leaveType.attachment_required_after === null) return true;

  return totalDays > leaveType.attachment_required_after;
}

export async function ListMyLeaveRequestController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const requester = await getRequester(req, res);
    const query = res.locals.query as ListLeaveRequestParams;

    const { rows, total } = await leaveRequestModel.listRequests({
      ...query,
      employee_id: requester.employee.id,
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

export async function ListApprovalLeaveRequestController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const requester = await getRequester(req, res);
    const query = res.locals.query as ListLeaveRequestParams;

    const { rows, total } = await leaveRequestModel.listRequests({
      ...query,
      approver_id: requester.employee.id,
      include_unassigned: requester.canApproveAll,
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

export async function ListAllLeaveRequestController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const query = res.locals.query as ListLeaveRequestParams;

    const { rows, total } = await leaveRequestModel.listRequests(query);

    res.json({
      success: true,
      data: rows,
      meta: meta(total, query.page, query.limit),
    });
  } catch (err) {
    next(err);
  }
}

export async function DetailLeaveRequestController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const requester = await getRequester(req, res);
    const { id } = res.locals.params as { id: string };

    const request = await leaveRequestModel.findDetailById(id);
    if (!request) throw NotFound("Pengajuan cuti tidak ditemukan");

    if (!canView(request, requester)) {
      throw Forbidden("Kamu tidak punya akses ke pengajuan cuti ini");
    }

    const attachments = await attachmentModel.findByRequest(id);

    res.json({ success: true, data: { ...request, attachments } });
  } catch (err) {
    next(err);
  }
}

export async function CreateLeaveRequestController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const requester = await getRequester(req, res);
    const { leave_type_id, start_date, end_date, reason } = req.body as {
      leave_type_id: string;
      start_date: string;
      end_date: string;
      reason?: string;
    };

    const leaveType = await leaveTypeModel.findById(leave_type_id);
    if (!leaveType) throw BadRequest("Jenis cuti tidak ditemukan");
    if (!leaveType.is_active) {
      throw BadRequest("Jenis cuti tersebut sedang tidak aktif");
    }

    const totalDays = await countWorkdaysFor(start_date, end_date);
    const periode = periodYearOf(start_date);

    validasiGender(leaveType, requester.employee);
    validasiTanggal(leaveType, start_date, totalDays);
    await validasiSaldo(leaveType, requester.employee, totalDays, periode);

    const bentrok = await leaveRequestModel.findOverlapping(
      requester.employee.id,
      start_date,
      end_date,
    );

    if (bentrok) {
      throw Conflict(
        `Kamu sudah punya pengajuan cuti ${statusLabel(bentrok.status)} pada ${bentrok.start_date} sampai ${bentrok.end_date}`,
        { conflicting_request_id: bentrok.id },
      );
    }

    const client = await pool.connect();
    let request: LeaveRequest;

    try {
      await client.query("BEGIN");

      request = await leaveRequestModel.createRequest(client, {
        employee_id: requester.employee.id,
        leave_type_id,
        start_date,
        end_date,
        total_days: totalDays,
        reason: reason ?? null,
        approver_id: resolveApprover(requester.employee),
      });

      if (leaveType.deducts_balance) {
        await balanceModel.createTransaction(client, {
          employee_id: requester.employee.id,
          leave_type_id,
          period_year: periode,
          amount: -totalDays,
          type: "hold",
          leave_request_id: request.id,
          note: "Penahanan saldo untuk pengajuan cuti",
          created_by: requester.employee.id,
        });
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    res.status(201).json({
      success: true,
      message: "Pengajuan cuti berhasil dibuat dan menunggu persetujuan",
      data: {
        ...request,
        attachment_required: attachmentRequired(leaveType, totalDays),
      },
    });
  } catch (err) {
    next(err);
  }
}

async function markLeaveDays(
  db: Executor,
  request: LeaveRequest,
): Promise<number> {
  const schedule = await workScheduleModel.resolveForEmployee(
    request.employee_id,
  );

  if (!schedule) return 0;

  const holidays = await holidayModel.findDatesBetween(
    request.start_date,
    request.end_date,
  );

  const workingDates = workScheduleModel.workingDatesInRange(
    schedule,
    request.start_date,
    request.end_date,
    holidays,
  );

  return attendanceModel.upsertLeaveDays(
    db,
    request.employee_id,
    workingDates,
    request.id,
  );
}

export async function ApproveLeaveRequestController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const client = await pool.connect();

  try {
    const requester = await getRequester(req, res);
    const { id } = res.locals.params as { id: string };
    const { decision_note } = req.body as { decision_note?: string };

    const existing = await leaveRequestModel.findById(id);
    if (!existing) throw NotFound("Pengajuan cuti tidak ditemukan");

    if (!canDecide(existing, requester)) {
      throw Forbidden("Kamu bukan penyetuju pengajuan cuti ini");
    }

    if (!canTransition(existing.status, "approved")) {
      throw BadRequest(
        `Pengajuan berstatus ${statusLabel(existing.status)} tidak dapat disetujui`,
      );
    }

    const leaveType = await leaveTypeModel.findById(existing.leave_type_id);
    if (!leaveType) throw BadRequest("Jenis cuti tidak ditemukan");

    if (attachmentRequired(leaveType, existing.total_days)) {
      const count = await attachmentModel.countByRequest(id);

      if (count === 0) {
        throw BadRequest(
          `Pengajuan ${leaveType.name} selama ${existing.total_days} hari wajib melampirkan bukti sebelum dapat disetujui`,
        );
      }
    }

    await client.query("BEGIN");

    const request = await leaveRequestModel.approveRequest(
      client,
      id,
      requester.employee.id,
      decision_note ?? null,
    );

    if (!request) {
      throw Conflict("Status pengajuan sudah berubah, silakan muat ulang");
    }

    if (leaveType.deducts_balance) {
      await balanceModel.convertHoldToDeduction(client, id);
    }

    await markLeaveDays(client, request);

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Pengajuan cuti berhasil disetujui",
      data: request,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
}

export async function RejectLeaveRequestController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const client = await pool.connect();

  try {
    const requester = await getRequester(req, res);
    const { id } = res.locals.params as { id: string };
    const { decision_note } = req.body as { decision_note?: string };

    const existing = await leaveRequestModel.findById(id);
    if (!existing) throw NotFound("Pengajuan cuti tidak ditemukan");

    if (!canDecide(existing, requester)) {
      throw Forbidden("Kamu bukan penyetuju pengajuan cuti ini");
    }

    if (!canTransition(existing.status, "rejected")) {
      throw BadRequest(
        `Pengajuan berstatus ${statusLabel(existing.status)} tidak dapat ditolak`,
      );
    }

    const leaveType = await leaveTypeModel.findById(existing.leave_type_id);

    await client.query("BEGIN");

    const request = await leaveRequestModel.rejectRequest(
      client,
      id,
      requester.employee.id,
      decision_note ?? null,
    );

    if (!request) {
      throw Conflict("Status pengajuan sudah berubah, silakan muat ulang");
    }

    if (leaveType?.deducts_balance) {
      await balanceModel.createTransaction(client, {
        employee_id: existing.employee_id,
        leave_type_id: existing.leave_type_id,
        period_year: periodYearOf(existing.start_date),
        amount: existing.total_days,
        type: "refund",
        leave_request_id: id,
        note: "Pengembalian saldo karena pengajuan ditolak",
        created_by: requester.employee.id,
      });
    }

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Pengajuan cuti berhasil ditolak",
      data: request,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
}

export async function CancelLeaveRequestController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const client = await pool.connect();

  try {
    const requester = await getRequester(req, res);
    const { id } = res.locals.params as { id: string };

    const existing = await leaveRequestModel.findById(id);
    if (!existing) throw NotFound("Pengajuan cuti tidak ditemukan");

    if (existing.employee_id !== requester.employee.id) {
      throw Forbidden("Kamu hanya dapat membatalkan pengajuan cuti sendiri");
    }

    if (!canTransition(existing.status, "cancelled")) {
      throw BadRequest(
        `Pengajuan berstatus ${statusLabel(existing.status)} tidak dapat dibatalkan`,
      );
    }

    if (existing.status === "approved" && isPastDate(existing.start_date)) {
      throw BadRequest(
        "Cuti yang sudah disetujui dan sudah berjalan tidak dapat dibatalkan",
      );
    }

    const leaveType = await leaveTypeModel.findById(existing.leave_type_id);

    await client.query("BEGIN");

    const request = await leaveRequestModel.cancelRequest(
      client,
      id,
      requester.employee.id,
    );

    if (!request) {
      throw Conflict("Status pengajuan sudah berubah, silakan muat ulang");
    }

    if (leaveType?.deducts_balance) {
      await balanceModel.createTransaction(client, {
        employee_id: existing.employee_id,
        leave_type_id: existing.leave_type_id,
        period_year: periodYearOf(existing.start_date),
        amount: existing.total_days,
        type: "refund",
        leave_request_id: id,
        note: "Pengembalian saldo karena pengajuan dibatalkan",
        created_by: requester.employee.id,
      });
    }

    if (existing.status === "approved") {
      await attendanceModel.deleteLeaveDays(client, id);
    }

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Pengajuan cuti berhasil dibatalkan",
      data: request,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
}
