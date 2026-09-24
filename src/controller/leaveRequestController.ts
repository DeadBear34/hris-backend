import type { Request, Response, NextFunction } from "express";
import { pool } from "../config/databaseConnection.js";
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
import { startActivity } from "../helpers/activityLog.js";
import {
  notifyLeaveSubmitted,
  notifyLeaveDecided,
  clearLeaveApproval,
} from "../helpers/notify.js";
import {
  BadRequest,
  Conflict,
  Forbidden,
  NotFound,
} from "../helpers/appError.js";
import { plural } from "../helpers/plural.js";
import { requireRequestEmployee } from "../helpers/requestEmployee.js";
import { deleteAttachments, isStorageConfigured } from "../helpers/storage.js";
import { logger } from "../config/logger.js";

const SICK_LEAVE_CODE = "SICK";

// Pembatalan tetap dianggap berhasil walaupun berkasnya gagal dihapus.
// Pengajuannya sudah batal dan tercatat; menggagalkan seluruh operasi hanya
// karena satu berkas justru merugikan pengguna. Yang tersisa cuma berkas
// yatim, dan itu tercatat di log untuk ditelusuri
async function discardAttachments(storagePaths: string[]): Promise<void> {
  if (storagePaths.length === 0 || !isStorageConfigured()) return;

  try {
    await deleteAttachments(storagePaths);
  } catch (err) {
    logger.warn(
      { err, storagePaths },
      "Failed to delete leave attachments from storage",
    );
  }
}

interface Requester {
  employee: Employee;
  canApproveTeam: boolean;
  canApproveAll: boolean;
  canViewAll: boolean;
}

async function getRequester(req: Request, res: Response): Promise<Requester> {
  const employee = await requireRequestEmployee(req, res);

  const [canApproveTeam, canApproveAll, canViewAll] = await Promise.all([
    hasFeature(req, res, "leave.approve_team"),
    hasFeature(req, res, "leave.approve_all"),
    hasFeature(req, res, "leave.view_all"),
  ]);

  return { employee, canApproveTeam, canApproveAll, canViewAll };
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

// Atasan langsung tetap membutuhkan fitur menyetujui cuti bawahannya, supaya
// kotak centang leave.approve_team benar-benar menentukan sesuatu
function canDecide(request: LeaveRequest, requester: Requester): boolean {
  if (requester.canApproveAll) return true;

  return (
    request.approver_id === requester.employee.id && requester.canApproveTeam
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

function validateLeaveDates(
  leaveType: LeaveType,
  start_date: string,
  totalDays: number,
): void {
  if (totalDays <= 0) {
    throw BadRequest("That date range contains no workdays");
  }

  const canGoBack = leaveType.code === SICK_LEAVE_CODE;

  if (!canGoBack && isPastDate(start_date)) {
    throw BadRequest("Requests for past dates are only allowed for sick leave");
  }

  if (
    leaveType.max_days_per_request !== null &&
    totalDays > leaveType.max_days_per_request
  ) {
    throw BadRequest(
      `This leave type allows at most ${plural(leaveType.max_days_per_request, "workday")} per request, but your request is ${plural(totalDays, "day")}`,
    );
  }

  if (!canGoBack && leaveType.min_notice_days > 0) {
    const gapDays = daysFromToday(start_date);

    if (gapDays < leaveType.min_notice_days) {
      throw BadRequest(
        `This leave type must be requested at least ${plural(leaveType.min_notice_days, "day")} before the start date`,
      );
    }
  }
}

function assertGenderAllowed(leaveType: LeaveType, employee: Employee): void {
  if (
    leaveType.gender_restriction &&
    leaveType.gender_restriction !== employee.gender
  ) {
    throw BadRequest(`${leaveType.name} is not available for your gender`);
  }
}

// db diisi klien transaksi saat pemeriksaan menentukan, supaya angkanya
// dibaca setelah baris karyawan dikunci
async function assertSufficientBalance(
  leaveType: LeaveType,
  employee: Employee,
  totalDays: number,
  period: number,
  db: Executor = pool,
): Promise<void> {
  if (!leaveType.deducts_balance) return;

  const balance = await balanceModel.balanceFor(
    employee.id,
    leaveType.id,
    period,
    db,
  );

  if (balance < totalDays) {
    throw BadRequest(
      `Insufficient ${leaveType.name} balance. You have ${plural(balance, "day")} left, but your request is ${plural(totalDays, "day")}`,
      { balance, requested: totalDays },
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

    // Tanpa salah satu fitur penyetuju tidak ada pengajuan yang boleh
    // ditindak, jadi daftarnya kosong alih-alih ditolak
    if (!requester.canApproveTeam && !requester.canApproveAll) {
      res.json({
        success: true,
        data: [],
        meta: meta(0, query.page, query.limit),
      });
      return;
    }

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
    if (!request) throw NotFound("Leave request not found");

    if (!canView(request, requester)) {
      throw Forbidden("You don't have access to this leave request");
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
  const activity = startActivity(req);

  try {
    const requester = await getRequester(req, res);
    const { leave_type_id, start_date, end_date, reason } = req.body as {
      leave_type_id: string;
      start_date: string;
      end_date: string;
      reason?: string;
    };

    const leaveType = await leaveTypeModel.findById(leave_type_id);
    if (!leaveType) throw BadRequest("Leave type not found");
    if (!leaveType.is_active) {
      throw BadRequest("That leave type is currently inactive");
    }

    const totalDays = await countWorkdaysFor(start_date, end_date);
    const period = periodYearOf(start_date);

    assertGenderAllowed(leaveType, requester.employee);
    validateLeaveDates(leaveType, start_date, totalDays);

    // Penyaring awal supaya kasus yang jelas kurang tidak perlu membuka
    // transaksi. Pemeriksaan yang menentukan ada di dalam transaksi
    await assertSufficientBalance(
      leaveType,
      requester.employee,
      totalDays,
      period,
    );

    const overlapping = await leaveRequestModel.findOverlapping(
      requester.employee.id,
      start_date,
      end_date,
    );

    if (overlapping) {
      throw Conflict(
        `You already have a leave request with status ${statusLabel(overlapping.status)} from ${overlapping.start_date} to ${overlapping.end_date}`,
        { conflicting_request_id: overlapping.id },
      );
    }

    const client = await pool.connect();
    let request: LeaveRequest;

    try {
      await client.query("BEGIN");

      // Kunci dulu, baru baca saldo. Tanpa ini dua pengajuan bersamaan
      // sama-sama membaca saldo lama dan keduanya lolos
      await balanceModel.lockEmployeeBalance(client, requester.employee.id);
      await assertSufficientBalance(
        leaveType,
        requester.employee,
        totalDays,
        period,
        client,
      );

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
          period_year: period,
          amount: -totalDays,
          type: "hold",
          leave_request_id: request.id,
          note: "Balance hold for leave request",
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

    // setelah COMMIT, supaya atasan tidak diberi tahu pengajuan yang batal
    await notifyLeaveSubmitted({
      request_id: request.id,
      requester_name: requester.employee.full_name,
      approver_employee_id: request.approver_id,
      leave_type_name: leaveType.name,
      start_date: request.start_date,
      end_date: request.end_date,
      total_days: request.total_days,
    });

    activity.success({
      action: "leave.create",
      entity: "leave_request",
      entity_id: request.id,
      actor_name: requester.employee.full_name,
      summary: `${requester.employee.full_name} requested ${plural(totalDays, "day")} of ${leaveType.name} for ${request.start_date} to ${request.end_date}`,
      metadata: {
        employee_id: requester.employee.id,
        leave_type_id,
        total_days: totalDays,
        start_date: request.start_date,
        end_date: request.end_date,
        approver_id: request.approver_id,
      },
    });

    res.status(201).json({
      success: true,
      message: "Leave request created and waiting for approval",
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
    const activity = startActivity(req);
    const requester = await getRequester(req, res);
    const { id } = res.locals.params as { id: string };
    const { decision_note } = req.body as { decision_note?: string };

    const existing = await leaveRequestModel.findById(id);
    if (!existing) throw NotFound("Leave request not found");

    if (!canDecide(existing, requester)) {
      throw Forbidden("You are not the approver for this leave request");
    }

    if (!canTransition(existing.status, "approved")) {
      throw BadRequest(
        `Requests with status ${statusLabel(existing.status)} cannot be approved`,
      );
    }

    const leaveType = await leaveTypeModel.findById(existing.leave_type_id);
    if (!leaveType) throw BadRequest("Leave type not found");

    if (attachmentRequired(leaveType, existing.total_days)) {
      const count = await attachmentModel.countByRequest(id);

      if (count === 0) {
        throw BadRequest(
          `A ${existing.total_days}-day ${leaveType.name} request needs supporting evidence before it can be approved`,
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
      throw Conflict("The request status has changed, please reload");
    }

    if (leaveType.deducts_balance) {
      await balanceModel.convertHoldToDeduction(client, id);
    }

    await markLeaveDays(client, request);

    await client.query("COMMIT");

    activity.success({
      action: "leave.approve",
      entity: "leave_request",
      entity_id: id,
      summary: `Leave request ${existing.start_date} to ${existing.end_date} approved`,
      metadata: {
        employee_id: existing.employee_id,
        total_days: existing.total_days,
      },
    });

    await notifyLeaveDecided({
      request_id: id,
      requester_employee_id: existing.employee_id,
      decision: "approved",
      leave_type_name: leaveType.name,
      start_date: existing.start_date,
      end_date: existing.end_date,
      decision_note: decision_note ?? null,
    });

    res.json({
      success: true,
      message: "Leave request approved successfully",
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
    const activity = startActivity(req);
    const requester = await getRequester(req, res);
    const { id } = res.locals.params as { id: string };
    const { decision_note } = req.body as { decision_note?: string };

    const existing = await leaveRequestModel.findById(id);
    if (!existing) throw NotFound("Leave request not found");

    if (!canDecide(existing, requester)) {
      throw Forbidden("You are not the approver for this leave request");
    }

    if (!canTransition(existing.status, "rejected")) {
      throw BadRequest(
        `Requests with status ${statusLabel(existing.status)} cannot be rejected`,
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
      throw Conflict("The request status has changed, please reload");
    }

    if (leaveType?.deducts_balance) {
      await balanceModel.createTransaction(client, {
        employee_id: existing.employee_id,
        leave_type_id: existing.leave_type_id,
        period_year: periodYearOf(existing.start_date),
        amount: existing.total_days,
        type: "refund",
        leave_request_id: id,
        note: "Balance refund because the request was rejected",
        created_by: requester.employee.id,
      });
    }

    await client.query("COMMIT");

    activity.success({
      action: "leave.reject",
      entity: "leave_request",
      entity_id: id,
      summary: `Leave request ${existing.start_date} to ${existing.end_date} rejected`,
      metadata: { employee_id: existing.employee_id },
    });

    await notifyLeaveDecided({
      request_id: id,
      requester_employee_id: existing.employee_id,
      decision: "rejected",
      // jenis cuti boleh saja sudah dihapus, judulnya tetap harus terbaca
      leave_type_name: leaveType?.name ?? "Leave",
      start_date: existing.start_date,
      end_date: existing.end_date,
      decision_note: decision_note ?? null,
    });

    res.json({
      success: true,
      message: "Leave request rejected successfully",
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
  const activity = startActivity(req);
  const client = await pool.connect();

  try {
    const requester = await getRequester(req, res);
    const { id } = res.locals.params as { id: string };

    const existing = await leaveRequestModel.findById(id);
    if (!existing) throw NotFound("Leave request not found");

    if (existing.employee_id !== requester.employee.id) {
      throw Forbidden("You can only cancel your own leave requests");
    }

    if (!canTransition(existing.status, "cancelled")) {
      throw BadRequest(
        `Requests with status ${statusLabel(existing.status)} cannot be cancelled`,
      );
    }

    if (existing.status === "approved" && isPastDate(existing.start_date)) {
      throw BadRequest(
        "Approved leave that has already started cannot be cancelled",
      );
    }

    const leaveType = await leaveTypeModel.findById(existing.leave_type_id);

    await client.query("BEGIN");

    // Status yang sudah diperiksa di atas ikut jadi syarat. Kalau pengajuan
    // disetujui di tengah jalan, pembatalan gagal alih-alih memakai status lama
    const request = await leaveRequestModel.cancelRequest(
      client,
      id,
      requester.employee.id,
      existing.status,
    );

    if (!request) {
      throw Conflict("The request status has changed, please reload");
    }

    if (leaveType?.deducts_balance) {
      await balanceModel.createTransaction(client, {
        employee_id: existing.employee_id,
        leave_type_id: existing.leave_type_id,
        period_year: periodYearOf(existing.start_date),
        amount: existing.total_days,
        type: "refund",
        leave_request_id: id,
        note: "Balance refund because the request was cancelled",
        created_by: requester.employee.id,
      });
    }

    if (existing.status === "approved") {
      await attendanceModel.deleteLeaveDays(client, id);
    }

    // Lampiran tidak diperlukan lagi setelah pengajuan batal, dan isinya
    // sering berupa surat dokter. Barisnya dihapus di dalam transaksi,
    // berkasnya menyusul setelah COMMIT
    const discardedPaths = await attachmentModel.deleteByRequest(id, client);

    await client.query("COMMIT");

    // Storage bukan bagian dari transaksi. Menghapus berkas sebelum COMMIT
    // berarti kehilangan berkas selamanya bila transaksinya dibatalkan,
    // sedangkan gagal menghapus setelah COMMIT hanya menyisakan berkas yatim
    await discardAttachments(discardedPaths);

    // setelah COMMIT, supaya lencana atasan tidak kehilangan tugas yang
    // ternyata gagal dibatalkan
    clearLeaveApproval(id);

    activity.success({
      action: "leave.cancel",
      entity: "leave_request",
      entity_id: id,
      actor_name: requester.employee.full_name,
      summary: `Leave request ${existing.start_date} to ${existing.end_date} cancelled`,
      metadata: {
        employee_id: existing.employee_id,
        previous_status: existing.status,
        total_days: existing.total_days,
        // Berkasnya sudah tidak ada, jadi jumlahnya dicatat di sini supaya
        // tetap ada jejaknya
        attachments_deleted: discardedPaths.length,
      },
    });

    res.json({
      success: true,
      message: "Leave request cancelled successfully",
      data: request,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
}
