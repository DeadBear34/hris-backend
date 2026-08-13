import type { Request, Response, NextFunction } from "express";
import * as leaveTypeModel from "../models/leaveType.js";
import type { LeaveTypeInput } from "../models/leaveType.js";
import { BadRequest, Conflict, NotFound } from "../helpers/appError.js";

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
    const data = req.body as LeaveTypeInput;

    const existing = await leaveTypeModel.findByCode(data.code);
    if (existing) throw Conflict("Kode jenis cuti sudah digunakan");

    const leaveType = await leaveTypeModel.createLeaveType(data);

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
    const { id } = res.locals.params as { id: string };
    const data = req.body as Partial<LeaveTypeInput>;

    const existing = await leaveTypeModel.findById(id);
    if (!existing) throw NotFound("Jenis cuti tidak ditemukan");

    if (data.code && data.code !== existing.code) {
      const duplicate = await leaveTypeModel.findByCode(data.code);
      if (duplicate) throw Conflict("Kode jenis cuti sudah digunakan");
    }

    const leaveType = await leaveTypeModel.updateLeaveType(id, data);

    res.json({ success: true, data: leaveType });
  } catch (err) {
    next(err);
  }
}

export async function DeleteLeaveTypeController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = res.locals.params as { id: string };

    const existing = await leaveTypeModel.findById(id);
    if (!existing) throw NotFound("Jenis cuti tidak ditemukan");

    // riwayat pengajuan harus tetap dapat dibaca, jadi jenis cuti yang sudah
    // terpakai tidak boleh hilang dari referensinya
    const jumlah = await leaveTypeModel.countLeaveRequests(id);
    if (jumlah > 0) {
      throw BadRequest(
        `Jenis cuti tidak dapat dihapus karena sudah dipakai oleh ${jumlah} pengajuan. Nonaktifkan saja agar tidak dapat dipilih lagi.`,
        { leave_request_count: jumlah },
      );
    }

    await leaveTypeModel.softDeleteLeaveType(id);

    res.json({ success: true, message: "Jenis cuti berhasil dihapus" });
  } catch (err) {
    next(err);
  }
}
