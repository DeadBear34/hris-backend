import type { Request, Response, NextFunction } from "express";
import * as leaveTypeModel from "../models/leaveType.js";
import type { LeaveType, LeaveTypeInput } from "../models/leaveType.js";
import * as balanceModel from "../models/leaveBalance.js";
import type { Executor } from "../models/user.js";
import { withTransaction } from "../helpers/transaction.js";
import { currentLeaveYear } from "../helpers/leaveAccrual.js";
import { BadRequest, Conflict, NotFound } from "../helpers/appError.js";
import { startActivity } from "../helpers/activityLog.js";
import { rejectStaleUpdate } from "../helpers/concurrency.js";
import { plural } from "../helpers/plural.js";
import { assertLeaveTypeLimits } from "../helpers/leaveTypeRules.js";

export async function ListLeaveTypeController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const leaveTypes = await leaveTypeModel.findAll();

    res.json({ success: true, data: leaveTypes });
  } catch (err) {
    next(err);
  }
}

export async function DetailLeaveTypeController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = res.locals.params as { id: string };

    const leaveType = await leaveTypeModel.findById(id);
    if (!leaveType) throw NotFound("Leave type not found");

    res.json({ success: true, data: leaveType });
  } catch (err) {
    next(err);
  }
}

async function assertCodeAvailable(
  code: string,
  exceptId?: string,
): Promise<void> {
  const owner = await leaveTypeModel.findCodeOwner(code);
  if (!owner || owner.id === exceptId) return;

  throw owner.deleted
    ? Conflict(
        `Leave type code ${code} was used by a deleted leave type, please choose another code`,
      )
    : Conflict(`Leave type code ${code} is already in use`);
}

export async function CreateLeaveTypeController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const activity = startActivity(req);
    const data = req.body as LeaveTypeInput;

    assertLeaveTypeLimits(data);

    await assertCodeAvailable(data.code);

    const leaveType = await leaveTypeModel.createLeaveType(data);

    activity.success({
      action: "leave_type.create",
      entity: "leave_type",
      entity_id: leaveType.id,
      summary: `Leave type ${leaveType.name} created`,
    });

    res.status(201).json({
      success: true,
      message: "Leave type created successfully",
      data: leaveType,
    });
  } catch (err) {
    next(err);
  }
}

// Jumlah karyawan yang ditampilkan saat perubahan kuota ditolak. Sisanya
// cukup disebut jumlahnya supaya respons tidak membengkak
const SHORTFALL_SAMPLE = 20;

// deducts_balance menentukan apakah pengajuan menahan saldo. Pengajuan yang
// masih menunggu dibuat dengan aturan lama, jadi peralihan ke memotong saldo
// akan meloloskannya tanpa potongan saat disetujui
async function assertDeductionSwitchAllowed(
  existing: LeaveType,
  deducts_balance: boolean | undefined,
): Promise<void> {
  if (deducts_balance !== true || existing.deducts_balance) return;

  const pending = await leaveTypeModel.countPendingRequests(existing.id);

  if (pending > 0) {
    throw Conflict(
      `${existing.name} cannot start deducting balance while ${plural(pending, "request")} of this type ${pending === 1 ? "is" : "are"} still pending. Decide them first`,
      { pending_requests: pending },
    );
  }
}

// Kuota baru diberlakukan ke semua karyawan (seluruh departemen) pada tahun
// berjalan dan tahun depan yang jatahnya sudah dibagikan. Bila ada yang sudah
// memakai atau sedang menahan lebih dari kuota baru, seluruh perubahan
// ditolak dan tidak ada yang tersimpan
async function rebaseQuota(
  client: Executor,
  leaveType: LeaveType,
  newQuota: number,
): Promise<number> {
  const year = currentLeaveYear();
  const note = `Allocation changed from ${Number(leaveType.default_quota ?? 0)} to ${newQuota} days`;
  let employees = 0;

  for (const period_year of [year, year + 1]) {
    const change = await balanceModel.rebaseAllocations(
      client,
      leaveType.id,
      period_year,
      newQuota,
      note,
    );

    if (change.shortfalls.length > 0) {
      throw Conflict(
        `The ${leaveType.name} quota cannot be lowered to ${plural(newQuota, "day")} because ${plural(change.shortfalls.length, "employee")} already used or requested more than that in ${period_year}. Adjust those employees individually instead`,
        {
          period_year,
          new_quota: newQuota,
          affected_count: change.shortfalls.length,
          affected: change.shortfalls.slice(0, SHORTFALL_SAMPLE),
        },
      );
    }

    employees = Math.max(employees, change.employees);
  }

  return employees;
}

export async function UpdateLeaveTypeController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const activity = startActivity(req);
    const { id } = res.locals.params as { id: string };
    const { updated_at: expectedUpdatedAt, ...data } =
      req.body as Partial<LeaveTypeInput> & {
        updated_at?: string;
      };

    const existing = await leaveTypeModel.findById(id);
    if (!existing) throw NotFound("Leave type not found");

    const merged = { ...existing, ...data };

    // perubahan sebagian diperiksa bersama nilai yang tidak ikut diubah
    assertLeaveTypeLimits(merged);

    if (data.code && data.code !== existing.code) {
      await assertCodeAvailable(data.code, id);
    }

    await assertDeductionSwitchAllowed(existing, data.deducts_balance);

    const quotaChanged =
      merged.deducts_balance &&
      data.default_quota !== undefined &&
      data.default_quota !== null &&
      Number(data.default_quota) !== Number(existing.default_quota ?? 0);

    // Perubahan jenis cuti dan penyesuaian jatah karyawan satu transaksi:
    // kalau salah satunya gagal, keduanya batal
    const { leaveType, rebased } = await withTransaction(async (client) => {
      const rebased = quotaChanged
        ? await rebaseQuota(client, existing, Number(data.default_quota))
        : 0;

      const updated = await leaveTypeModel.updateLeaveType(
        id,
        data,
        expectedUpdatedAt,
        client,
      );

      if (!updated) {
        throw await rejectStaleUpdate(
          "leave_type",
          () => leaveTypeModel.findById(id),
          "Leave type not found",
        );
      }

      return { leaveType: updated, rebased };
    });

    activity.success({
      action: "leave_type.update",
      entity: "leave_type",
      entity_id: id,
      summary: quotaChanged
        ? `Leave type ${existing.name} updated, quota ${Number(existing.default_quota ?? 0)} to ${Number(data.default_quota)} days for ${plural(rebased, "employee")}`
        : `Leave type ${existing.name} updated`,
      metadata: {
        fields: Object.keys(data),
        ...(quotaChanged
          ? {
              quota_from: existing.default_quota,
              quota_to: data.default_quota,
              employees_rebased: rebased,
            }
          : {}),
      },
    });

    res.json({
      success: true,
      message: quotaChanged
        ? `Leave type updated, the new quota applies to ${plural(rebased, "employee")} who already received this year's allocation`
        : "Leave type updated successfully",
      data: leaveType,
    });
  } catch (err) {
    next(err);
  }
}

export async function DeleteLeaveTypeController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const activity = startActivity(req);
    const { id } = res.locals.params as { id: string };

    const existing = await leaveTypeModel.findById(id);
    if (!existing) throw NotFound("Leave type not found");

    const count = await leaveTypeModel.countLeaveRequests(id);
    if (count > 0) {
      throw BadRequest(
        `Leave type cannot be deleted because it is used by ${plural(count, "request")}. Deactivate it instead so it can no longer be selected.`,
        { leave_request_count: count },
      );
    }

    await leaveTypeModel.softDeleteLeaveType(id);

    activity.success({
      action: "leave_type.delete",
      entity: "leave_type",
      entity_id: id,
      summary: `Leave type ${existing.name} deleted`,
    });

    res.json({ success: true, message: "Leave type deleted successfully" });
  } catch (err) {
    next(err);
  }
}
