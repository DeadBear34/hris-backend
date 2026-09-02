import type { Request, Response, NextFunction } from "express";
import * as leaveTypeModel from "../models/leaveType.js";
import type { LeaveTypeInput } from "../models/leaveType.js";
import { BadRequest, Conflict, NotFound } from "../helpers/appError.js";
import { startActivity } from "../helpers/activityLog.js";

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
    if (!leaveType) throw NotFound("Jenis cuti tidak ditemukan");

    res.json({ success: true, data: leaveType });
  } catch (err) {
    next(err);
  }
}

export async function CreateLeaveTypeController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const activity = startActivity(req);
    const data = req.body as LeaveTypeInput;

    const existing = await leaveTypeModel.findByCode(data.code);
    if (existing) throw Conflict("Kode jenis cuti sudah digunakan");

    const leaveType = await leaveTypeModel.createLeaveType(data);

    activity.success({
      action: "leave_type.create",
      entity: "leave_type",
      entity_id: leaveType.id,
      summary: `Jenis cuti ${leaveType.name} dibuat`,
    });

    res.status(201).json({ success: true, data: leaveType });
  } catch (err) {
    next(err);
  }
}

export async function UpdateLeaveTypeController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const activity = startActivity(req);
    const { id } = res.locals.params as { id: string };
    const data = req.body as Partial<LeaveTypeInput>;

    const existing = await leaveTypeModel.findById(id);
    if (!existing) throw NotFound("Jenis cuti tidak ditemukan");

    if (data.code && data.code !== existing.code) {
      const duplicate = await leaveTypeModel.findByCode(data.code);
      if (duplicate) throw Conflict("Kode jenis cuti sudah digunakan");
    }

    const leaveType = await leaveTypeModel.updateLeaveType(id, data);

    activity.success({
      action: "leave_type.update",
      entity: "leave_type",
      entity_id: id,
      summary: `Jenis cuti ${existing.name} diubah`,
      metadata: { fields: Object.keys(data) },
    });

    res.json({ success: true, data: leaveType });
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
    if (!existing) throw NotFound("Jenis cuti tidak ditemukan");

    const count = await leaveTypeModel.countLeaveRequests(id);
    if (count > 0) {
      throw BadRequest(
        `Jenis cuti tidak dapat dihapus karena sudah dipakai oleh ${count} pengajuan. Nonaktifkan saja agar tidak dapat dipilih lagi.`,
        { leave_request_count: count },
      );
    }

    await leaveTypeModel.softDeleteLeaveType(id);

    activity.success({
      action: "leave_type.delete",
      entity: "leave_type",
      entity_id: id,
      summary: `Jenis cuti ${existing.name} dihapus`,
    });

    res.json({ success: true, message: "Jenis cuti berhasil dihapus" });
  } catch (err) {
    next(err);
  }
}
