import type { Request, Response, NextFunction } from "express";
import { pool } from "../config/databaseConnection.js";
import * as holidayModel from "../models/holiday.js";
import * as leaveTypeModel from "../models/leaveType.js";
import * as leaveRequestModel from "../models/leaveRequest.js";
import * as balanceModel from "../models/leaveBalance.js";
import * as attachmentModel from "../models/leaveAttachment.js";
import * as attendanceModel from "../models/attendance.js";
import * as workScheduleModel from "../models/workSchedule.js";
import * as employeeModel from "../models/employee.js";
import * as departmentModel from "../models/department.js";
import type { Employee } from "../models/employee.js";
import type { Executor } from "../models/user.js";
import type { LeaveType } from "../models/leaveType.js";
import type { WorkSchedule } from "../models/workSchedule.js";
import type {
  LeaveRequest,
  ListLeaveRequestParams,
} from "../models/leaveRequest.js";
import {
  countWorkdays,
  daysFromToday,
  eachDateInRange,
  isPastDate,
  isWeekend,
  toIsoDate,
} from "../helpers/workdays.js";
import { dateRange } from "../helpers/timezone.js";
import {
  OVERRIDE_NOTE_MIN_LENGTH,
  findFullDays,
  staffingLimitError,
} from "../helpers/staffingLimit.js";
import type { FullDay } from "../helpers/staffingLimit.js";
import type { Department } from "../models/department.js";
import { canTransition, statusLabel } from "../helpers/leaveStatus.js";
import { hasFeature } from "../middlewares/feature.js";
import { startActivity } from "../helpers/activityLog.js";
import { withTransaction } from "../helpers/transaction.js";
import { ensureAccruals } from "../helpers/leaveAccrual.js";
import {
  notifyLeaveSubmitted,
  notifyLeaveDecided,
  clearLeaveApproval,
} from "../helpers/notify.js";
import {
  AppError,
  BadRequest,
  Conflict,
  Forbidden,
  NotFound,
} from "../helpers/appError.js";
import { plural } from "../helpers/plural.js";
import { requireRequestEmployee } from "../helpers/requestEmployee.js";
import { deleteAttachments, isStorageConfigured } from "../helpers/storage.js";
import { logger } from "../config/logger.js";
import { paginationMeta } from "../helpers/pagination.js";

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
      meta: paginationMeta(total, query.page, query.limit),
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
        meta: paginationMeta(0, query.page, query.limit),
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
      meta: paginationMeta(total, query.page, query.limit),
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
      meta: paginationMeta(total, query.page, query.limit),
    });
  } catch (err) {
    next(err);
  }
}

// Jumlah rekan satu departemen yang cutinya sudah disetujui per tanggal,
// untuk menandai tanggal yang penuh di kalender pengajuan. Pemohon sendiri
// tidak dihitung, jadi is_full berarti "Anda tidak bisa cuti di tanggal ini".
// Hanya jumlah, tanpa nama, supaya karyawan tidak melihat cuti rekannya.
// Departemen lain hanya boleh dilihat pemegang leave.view_all
export async function DepartmentLeaveCalendarController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const requester = await getRequester(req, res);
    const { start_date, end_date, department_id } = res.locals.query as {
      start_date: string;
      end_date: string;
      department_id?: string;
    };

    const ownDepartmentId = requester.employee.department_id ?? null;

    if (
      department_id &&
      department_id !== ownDepartmentId &&
      !requester.canViewAll
    ) {
      throw Forbidden(
        "You can only view the leave calendar of your own department",
      );
    }

    const targetId = department_id ?? ownDepartmentId;

    if (!targetId) {
      res.json({ success: true, data: { department: null, days: [] } });
      return;
    }

    const department = await departmentModel.findById(targetId);
    if (!department) throw NotFound("Department not found");

    const limit = department.max_concurrent_leave ?? null;
    const dates = dateRange(start_date, end_date);
    const [counts, pendingCounts] = await Promise.all([
      leaveRequestModel.countApprovedLeaveByDate(
        department.id,
        requester.employee.id,
        dates,
      ),
      leaveRequestModel.countPendingLeaveByDate(
        department.id,
        requester.employee.id,
        dates,
      ),
    ]);

    res.json({
      success: true,
      data: {
        department: {
          id: department.id,
          name: department.name,
          max_concurrent_leave: limit,
        },
        days: dates.map((date) => {
          const onLeave = counts.get(date) ?? 0;

          return {
            date,
            on_leave: onLeave,
            // menunggu keputusan, belum mengisi kuota. Untuk peringatan saja
            pending: pendingCounts.get(date) ?? 0,
            is_full: limit !== null && onLeave >= limit,
          };
        }),
      },
    });
  } catch (err) {
    next(err);
  }
}

// Rekan satu departemen yang cutinya bentrok dengan pengajuan ini, supaya
// penyetuju bisa menimbang sebelum memutuskan walaupun departemennya belum
// diberi batas. Berisi nama, jadi hanya untuk penyetujunya atau pemegang
// leave.view_all, bukan untuk pemohon. undefined berarti tidak ditampilkan
async function colleaguesOnLeaveFor(
  request: LeaveRequest,
  requester: Requester,
): Promise<leaveRequestModel.ColleagueLeave[] | undefined> {
  const isOwner = request.employee_id === requester.employee.id;

  if (isOwner || !(canDecide(request, requester) || requester.canViewAll)) {
    return undefined;
  }

  const owner = await employeeModel.findById(request.employee_id);
  if (!owner?.department_id) return [];

  return leaveRequestModel.findColleagueLeaves(
    owner.department_id,
    request.employee_id,
    request.start_date,
    request.end_date,
  );
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

    const [attachments, colleagues_on_leave] = await Promise.all([
      attachmentModel.findByRequest(id),
      colleaguesOnLeaveFor(request, requester),
    ]);

    res.json({
      success: true,
      data: {
        ...request,
        attachments,
        ...(colleagues_on_leave ? { colleagues_on_leave } : {}),
      },
    });
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

    // Hari libur dipakai lagi untuk pemeriksaan batas departemen di bawah
    const [leaveType, holidays] = await Promise.all([
      leaveTypeModel.findById(leave_type_id),
      holidayModel.findDatesBetween(start_date, end_date),
    ]);

    if (!leaveType) throw BadRequest("Leave type not found");
    if (!leaveType.is_active) {
      throw BadRequest("That leave type is currently inactive");
    }

    const totalDays = countWorkdays(start_date, end_date, holidays);
    const period = periodYearOf(start_date);

    assertGenderAllowed(leaveType, requester.employee);
    validateLeaveDates(leaveType, start_date, totalDays);

    // Tanpa ini karyawan yang belum pernah diberi jatah tahun ini bersaldo
    // nol dan setiap pengajuannya ditolak sebagai saldo tidak cukup
    if (leaveType.deducts_balance) {
      await ensureAccruals(requester.employee.id, period);
    }

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

    // Ditolak sejak awal kalo ada hari yang sudah penuh oleh cuti rekan yang
    // disetujui, supaya karyawan tidak menunggu keputusan yang pasti gagal.
    // Pengajuan rekan yang masih pending tidak dihitung, jadi pengajuan tidak
    // saling memblokir sebelum ada keputusan. Pemeriksaan yang menentukan
    // dilakukan lagi saat penyetujuan
    const limitedDepartment = await limitedDepartmentFor(
      leaveType,
      requester.employee.department_id,
    );

    if (limitedDepartment) {
      const schedule = await workScheduleModel.resolveForEmployee(
        requester.employee.id,
      );
      const fullDays = await findFullDays(
        limitedDepartment,
        requester.employee.id,
        workingDatesOf({ schedule, holidays }, start_date, end_date),
      );

      if (fullDays.length > 0) {
        throw staffingLimitError(limitedDepartment, fullDays);
      }
    }

    const request = await withTransaction(async (client) => {
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

      const created = await leaveRequestModel.createRequest(client, {
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
          leave_request_id: created.id,
          note: "Balance hold for leave request",
          created_by: requester.employee.id,
        });
      }

      return created;
    });

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
    // Pengajuan yang ditolak tidak disimpan sebagai leave_request, karena
    // baris itu ikut menentukan saldo dan bentrok tanggal. Jejaknya dicatat
    // di log aktivitas supaya HR tetap dapat merekap percobaan yang gagal
    const employee = res.locals.employee as Employee | null | undefined;
    const body = (req.body ?? {}) as Record<string, unknown>;

    activity.failed({
      action: "leave.create",
      entity: "leave_request",
      actor_name: employee?.full_name ?? null,
      summary: `Leave request for ${String(body.start_date ?? "?")} to ${String(body.end_date ?? "?")} rejected`,
      metadata: {
        employee_id: employee?.id ?? null,
        leave_type_id: body.leave_type_id ?? null,
        start_date: body.start_date ?? null,
        end_date: body.end_date ?? null,
        reason: err instanceof AppError ? err.message : "unexpected error",
        code: err instanceof AppError ? err.code : null,
        details: err instanceof AppError ? (err.details ?? null) : null,
      },
    });

    next(err);
  }
}

// Jadwal kerja karyawan dan hari libur dalam rentang cuti. Diambil sekali,
// lalu dipakai untuk menghitung hari cuti sekaligus menandai absensi
interface LeaveCalendar {
  schedule: WorkSchedule | null;
  holidays: string[];
}

async function leaveCalendarOf(
  employee_id: string,
  start_date: string,
  end_date: string,
): Promise<LeaveCalendar> {
  const [schedule, holidays] = await Promise.all([
    workScheduleModel.resolveForEmployee(employee_id),
    holidayModel.findDatesBetween(start_date, end_date),
  ]);

  return { schedule, holidays };
}

// Hari kerja seorang karyawan dalam rentang cuti, menurut jadwal kerjanya.
// Karyawan yang belum punya jadwal dianggap bekerja Senin sampai Jumat.
// Hari libur selalu dikeluarkan
function workingDatesOf(
  { schedule, holidays }: LeaveCalendar,
  start_date: string,
  end_date: string,
): string[] {
  if (schedule) {
    return workScheduleModel.workingDatesInRange(
      schedule,
      start_date,
      end_date,
      holidays,
    );
  }

  const holidaySet = new Set(holidays);

  return eachDateInRange(start_date, end_date)
    .filter((date) => !isWeekend(date))
    .map(toIsoDate)
    .filter((date) => !holidaySet.has(date));
}

// Melampaui batas hanya boleh oleh pemegang leave.approve_all, harus diminta
// secara sadar lewat override_staffing_limit, dan alasannya wajib ditulis.
// Selain itu penyetujuan ditolak dengan 409 beserta tanggal yang penuh
function assertStaffingOverride(
  department: Department,
  fullDays: FullDay[],
  requester: Requester,
  override: boolean | undefined,
  decisionNote: string | undefined,
): void {
  if (!override || !requester.canApproveAll) {
    throw staffingLimitError(department, fullDays, requester.canApproveAll);
  }

  if ((decisionNote ?? "").trim().length < OVERRIDE_NOTE_MIN_LENGTH) {
    throw BadRequest(
      `Approving above the staffing limit needs a reason of at least ${OVERRIDE_NOTE_MIN_LENGTH} characters in decision_note`,
    );
  }
}

// Departemen yang batas cuti bersamaannya berlaku untuk pengajuan ini.
// Null bila jenis cutinya dikecualikan, karyawannya tanpa departemen, atau
// departemennya tanpa batas, sehingga tidak ada yang perlu diperiksa
async function limitedDepartmentFor(
  leaveType: LeaveType,
  department_id: string | null | undefined,
): Promise<Department | null> {
  if (leaveType.exempt_from_staffing_limit || !department_id) return null;

  const department = await departmentModel.findById(department_id);

  // undefined juga dianggap tanpa batas, untuk berjaga bila kolomnya belum
  // dibuat karena migrasi belum dijalankan
  if (
    !department ||
    department.max_concurrent_leave === null ||
    department.max_concurrent_leave === undefined
  ) {
    return null;
  }

  return department;
}

// Karyawan tanpa jadwal kerja tidak punya absensi untuk ditandai
async function markLeaveDays(
  db: Executor,
  request: LeaveRequest,
  calendar: LeaveCalendar,
): Promise<number> {
  if (!calendar.schedule) return 0;

  return attendanceModel.upsertLeaveDays(
    db,
    request.employee_id,
    workingDatesOf(calendar, request.start_date, request.end_date),
    request.id,
  );
}

// Saldo yang ditahan saat pengajuan dikembalikan bila pengajuannya batal
function refundHold(
  db: Executor,
  request: LeaveRequest,
  created_by: string,
  outcome: "rejected" | "cancelled",
) {
  return balanceModel.createTransaction(db, {
    employee_id: request.employee_id,
    leave_type_id: request.leave_type_id,
    period_year: periodYearOf(request.start_date),
    amount: request.total_days,
    type: "refund",
    leave_request_id: request.id,
    note: `Balance refund because the request was ${outcome}`,
    created_by,
  });
}

export async function ApproveLeaveRequestController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const activity = startActivity(req);
    const requester = await getRequester(req, res);
    const { id } = res.locals.params as { id: string };
    const { decision_note, override_staffing_limit } = req.body as {
      decision_note?: string;
      override_staffing_limit?: boolean;
    };

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

    // Pembacaan yang tidak bergantung pada kunci dilakukan sebelum transaksi,
    // supaya kunci departemen dipegang sesingkat mungkin
    const [leaveType, owner, calendar] = await Promise.all([
      leaveTypeModel.findById(existing.leave_type_id),
      employeeModel.findById(existing.employee_id),
      leaveCalendarOf(
        existing.employee_id,
        existing.start_date,
        existing.end_date,
      ),
    ]);

    if (!leaveType) throw BadRequest("Leave type not found");

    if (attachmentRequired(leaveType, existing.total_days)) {
      const count = await attachmentModel.countByRequest(id);

      if (count === 0) {
        throw BadRequest(
          `A ${existing.total_days}-day ${leaveType.name} request needs supporting evidence before it can be approved`,
        );
      }
    }

    const limitedDepartment = await limitedDepartmentFor(
      leaveType,
      owner?.department_id,
    );

    let overriddenDays: FullDay[] = [];

    const request = await withTransaction(async (client) => {
      if (limitedDepartment) {
        // Penyetujuan di departemen yang sama dibuat bergiliran, supaya dua
        // penyetujuan bersamaan tidak sama-sama lolos dari batas
        await departmentModel.lockForLeaveApproval(
          client,
          limitedDepartment.id,
        );

        const fullDays = await findFullDays(
          limitedDepartment,
          existing.employee_id,
          workingDatesOf(calendar, existing.start_date, existing.end_date),
          client,
        );

        if (fullDays.length > 0) {
          assertStaffingOverride(
            limitedDepartment,
            fullDays,
            requester,
            override_staffing_limit,
            decision_note,
          );
          overriddenDays = fullDays;
        }
      }

      const approved = await leaveRequestModel.approveRequest(
        client,
        id,
        requester.employee.id,
        decision_note ?? null,
      );

      if (!approved) {
        throw Conflict("The request status has changed, please reload");
      }

      if (leaveType.deducts_balance) {
        await balanceModel.convertHoldToDeduction(client, id);
      }

      await markLeaveDays(client, approved, calendar);

      return approved;
    });

    activity.success({
      action: "leave.approve",
      entity: "leave_request",
      entity_id: id,
      summary:
        overriddenDays.length > 0
          ? `Leave request ${existing.start_date} to ${existing.end_date} approved above the department staffing limit`
          : `Leave request ${existing.start_date} to ${existing.end_date} approved`,
      metadata: {
        employee_id: existing.employee_id,
        total_days: existing.total_days,
        // Jejak penyetujuan yang melampaui batas: tanggalnya dan alasannya
        ...(overriddenDays.length > 0
          ? {
              staffing_override: {
                department_id: limitedDepartment?.id,
                max_concurrent_leave: limitedDepartment?.max_concurrent_leave,
                full_dates: overriddenDays,
                reason: decision_note,
              },
            }
          : {}),
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
    next(err);
  }
}

export async function RejectLeaveRequestController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
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

    const request = await withTransaction(async (client) => {
      const rejected = await leaveRequestModel.rejectRequest(
        client,
        id,
        requester.employee.id,
        decision_note ?? null,
      );

      if (!rejected) {
        throw Conflict("The request status has changed, please reload");
      }

      if (leaveType?.deducts_balance) {
        await refundHold(client, existing, requester.employee.id, "rejected");
      }

      return rejected;
    });

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
    next(err);
  }
}

export async function CancelLeaveRequestController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const activity = startActivity(req);
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

    const { request, discardedPaths } = await withTransaction(
      async (client) => {
        // Status yang sudah diperiksa di atas ikut jadi syarat. Kalau pengajuan
        // disetujui di tengah jalan, pembatalan gagal alih-alih memakai status lama
        const cancelled = await leaveRequestModel.cancelRequest(
          client,
          id,
          requester.employee.id,
          existing.status,
        );

        if (!cancelled) {
          throw Conflict("The request status has changed, please reload");
        }

        if (leaveType?.deducts_balance) {
          await refundHold(
            client,
            existing,
            requester.employee.id,
            "cancelled",
          );
        }

        if (existing.status === "approved") {
          await attendanceModel.deleteLeaveDays(client, id);
        }

        // Lampiran tidak diperlukan lagi setelah pengajuan batal, dan isinya
        // sering berupa surat dokter. Barisnya dihapus di dalam transaksi,
        // berkasnya menyusul setelah COMMIT
        const paths = await attachmentModel.deleteByRequest(id, client);

        return { request: cancelled, discardedPaths: paths };
      },
    );

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
    next(err);
  }
}
