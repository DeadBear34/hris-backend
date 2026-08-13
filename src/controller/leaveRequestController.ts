import type { Request, Response, NextFunction } from "express";
import { pool } from "../config/databaseConnection.js";
import * as employeeModel from "../models/employee.js";
import * as holidayModel from "../models/holiday.js";
import * as leaveTypeModel from "../models/leaveType.js";
import * as leaveRequestModel from "../models/leaveRequest.js";
import * as balanceModel from "../models/leaveBalance.js";
import * as attachmentModel from "../models/leaveAttachment.js";
import type { Employee } from "../models/employee.js";
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
import {
  BadRequest,
  Conflict,
  Forbidden,
  NotFound,
  Unauthorized,
} from "../helpers/appError.js";

const KODE_CUTI_SAKIT = "SICK";

interface Pemohon {
  employee: Employee;
  isAdmin: boolean;
}

async function ambilPemohon(req: Request): Promise<Pemohon> {
  if (!req.user) throw Unauthorized("Belum login");

  const employee = await employeeModel.findByUserId(req.user.id);

  if (!employee) {
    throw BadRequest(
      "Akun kamu belum terhubung ke data karyawan, hubungi HR terlebih dahulu",
    );
  }

  return {
    employee,
    isAdmin: req.user.role === "admin",
  };
}

function tentukanPenyetuju(employee: Employee): string | null {
  return employee.manager_id ?? null;
}

function bolehMelihat(request: LeaveRequest, pemohon: Pemohon): boolean {
  return (
    pemohon.isAdmin ||
    request.employee_id === pemohon.employee.id ||
    request.approver_id === pemohon.employee.id
  );
}

function bolehMemutuskan(request: LeaveRequest, pemohon: Pemohon): boolean {
  return pemohon.isAdmin || request.approver_id === pemohon.employee.id;
}

function periodeDari(tanggal: string): number {
  return Number(tanggal.slice(0, 4));
}

function meta(total: number, page: number, limit: number) {
  return { page, limit, total, total_pages: Math.ceil(total / limit) };
}

async function hitungHariKerja(
  start_date: string,
  end_date: string,
): Promise<number> {
  const libur = await holidayModel.findDatesBetween(start_date, end_date);

  return countWorkdays(start_date, end_date, libur);
}

function validasiTanggal(
  leaveType: LeaveType,
  start_date: string,
  totalHari: number,
): void {
  if (totalHari <= 0) {
    throw BadRequest(
      "Rentang tanggal tersebut tidak memuat satu pun hari kerja",
    );
  }

  const bolehMundur = leaveType.code === KODE_CUTI_SAKIT;

  if (!bolehMundur && isPastDate(start_date)) {
    throw BadRequest(
      "Pengajuan untuk tanggal yang sudah lewat hanya diperbolehkan untuk cuti sakit",
    );
  }

  if (
    leaveType.max_days_per_request !== null &&
    totalHari > leaveType.max_days_per_request
  ) {
    throw BadRequest(
      `Jenis cuti ini maksimal ${leaveType.max_days_per_request} hari kerja per pengajuan, sedangkan pengajuanmu ${totalHari} hari`,
    );
  }

  if (!bolehMundur && leaveType.min_notice_days > 0) {
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
  totalHari: number,
  periode: number,
): Promise<void> {
  if (!leaveType.deducts_balance) return;

  const saldo = await balanceModel.balanceFor(
    employee.id,
    leaveType.id,
    periode,
  );

  if (saldo < totalHari) {
    throw BadRequest(
      `Saldo ${leaveType.name} tidak mencukupi. Tersisa ${saldo} hari, sedangkan pengajuanmu ${totalHari} hari`,
      { balance: saldo, requested: totalHari },
    );
  }
}

export function lampiranDiwajibkan(
  leaveType: LeaveType,
  totalHari: number,
): boolean {
  if (!leaveType.requires_attachment) return false;

  if (leaveType.attachment_required_after === null) return true;

  return totalHari > leaveType.attachment_required_after;
}

export async function ListMyLeaveRequestController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const pemohon = await ambilPemohon(req);
    const query = res.locals.query as ListLeaveRequestParams;

    const { rows, total } = await leaveRequestModel.listRequests({
      ...query,
      employee_id: pemohon.employee.id,
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
    const pemohon = await ambilPemohon(req);
    const query = res.locals.query as ListLeaveRequestParams;

    const { rows, total } = await leaveRequestModel.listRequests({
      ...query,
      approver_id: pemohon.employee.id,
      include_unassigned: pemohon.isAdmin,
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
    const pemohon = await ambilPemohon(req);
    const { id } = res.locals.params as { id: string };

    const request = await leaveRequestModel.findDetailById(id);
    if (!request) throw NotFound("Pengajuan cuti tidak ditemukan");

    if (!bolehMelihat(request, pemohon)) {
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
    const pemohon = await ambilPemohon(req);
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

    const totalHari = await hitungHariKerja(start_date, end_date);
    const periode = periodeDari(start_date);

    validasiGender(leaveType, pemohon.employee);
    validasiTanggal(leaveType, start_date, totalHari);
    await validasiSaldo(leaveType, pemohon.employee, totalHari, periode);

    const bentrok = await leaveRequestModel.findOverlapping(
      pemohon.employee.id,
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
        employee_id: pemohon.employee.id,
        leave_type_id,
        start_date,
        end_date,
        total_days: totalHari,
        reason: reason ?? null,
        approver_id: tentukanPenyetuju(pemohon.employee),
      });

      if (leaveType.deducts_balance) {
        await balanceModel.createTransaction(client, {
          employee_id: pemohon.employee.id,
          leave_type_id,
          period_year: periode,
          amount: -totalHari,
          type: "hold",
          leave_request_id: request.id,
          note: "Penahanan saldo untuk pengajuan cuti",
          created_by: pemohon.employee.id,
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
        attachment_required: lampiranDiwajibkan(leaveType, totalHari),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function ApproveLeaveRequestController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const client = await pool.connect();

  try {
    const pemohon = await ambilPemohon(req);
    const { id } = res.locals.params as { id: string };
    const { decision_note } = req.body as { decision_note?: string };

    const existing = await leaveRequestModel.findById(id);
    if (!existing) throw NotFound("Pengajuan cuti tidak ditemukan");

    if (!bolehMemutuskan(existing, pemohon)) {
      throw Forbidden("Kamu bukan penyetuju pengajuan cuti ini");
    }

    if (!canTransition(existing.status, "approved")) {
      throw BadRequest(
        `Pengajuan berstatus ${statusLabel(existing.status)} tidak dapat disetujui`,
      );
    }

    const leaveType = await leaveTypeModel.findById(existing.leave_type_id);
    if (!leaveType) throw BadRequest("Jenis cuti tidak ditemukan");

    if (lampiranDiwajibkan(leaveType, existing.total_days)) {
      const jumlah = await attachmentModel.countByRequest(id);

      if (jumlah === 0) {
        throw BadRequest(
          `Pengajuan ${leaveType.name} selama ${existing.total_days} hari wajib melampirkan bukti sebelum dapat disetujui`,
        );
      }
    }

    await client.query("BEGIN");

    const request = await leaveRequestModel.approveRequest(
      client,
      id,
      pemohon.employee.id,
      decision_note ?? null,
    );

    if (!request) {
      throw Conflict("Status pengajuan sudah berubah, silakan muat ulang");
    }

    if (leaveType.deducts_balance) {
      await balanceModel.convertHoldToDeduction(client, id);
    }

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
    const pemohon = await ambilPemohon(req);
    const { id } = res.locals.params as { id: string };
    const { decision_note } = req.body as { decision_note?: string };

    const existing = await leaveRequestModel.findById(id);
    if (!existing) throw NotFound("Pengajuan cuti tidak ditemukan");

    if (!bolehMemutuskan(existing, pemohon)) {
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
      pemohon.employee.id,
      decision_note ?? null,
    );

    if (!request) {
      throw Conflict("Status pengajuan sudah berubah, silakan muat ulang");
    }

    if (leaveType?.deducts_balance) {
      await balanceModel.createTransaction(client, {
        employee_id: existing.employee_id,
        leave_type_id: existing.leave_type_id,
        period_year: periodeDari(existing.start_date),
        amount: existing.total_days,
        type: "refund",
        leave_request_id: id,
        note: "Pengembalian saldo karena pengajuan ditolak",
        created_by: pemohon.employee.id,
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
    const pemohon = await ambilPemohon(req);
    const { id } = res.locals.params as { id: string };

    const existing = await leaveRequestModel.findById(id);
    if (!existing) throw NotFound("Pengajuan cuti tidak ditemukan");

    if (existing.employee_id !== pemohon.employee.id) {
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
      pemohon.employee.id,
    );

    if (!request) {
      throw Conflict("Status pengajuan sudah berubah, silakan muat ulang");
    }

    if (leaveType?.deducts_balance) {
      await balanceModel.createTransaction(client, {
        employee_id: existing.employee_id,
        leave_type_id: existing.leave_type_id,
        period_year: periodeDari(existing.start_date),
        amount: existing.total_days,
        type: "refund",
        leave_request_id: id,
        note: "Pengembalian saldo karena pengajuan dibatalkan",
        created_by: pemohon.employee.id,
      });
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
