import type { Request, Response, NextFunction } from "express";
import * as positionModel from "../models/position.js";
import type { PositionInput } from "../models/position.js";
import { Conflict, NotFound, BadRequest } from "../helpers/appError.js";
import { startActivity } from "../helpers/activityLog.js";

export async function ListPositionController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const positions = await positionModel.findAll();
    res.json({ success: true, data: positions });
  } catch (err) {
    next(err);
  }
}

export async function DetailPositionController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = res.locals.params as { id: string };

    const position = await positionModel.findById(id);
    if (!position) throw NotFound("Jabatan tidak ditemukan");

    res.json({ success: true, data: position });
  } catch (err) {
    next(err);
  }
}

export async function CreatePositionController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const activity = startActivity(req);
    const data = req.body as PositionInput;

    const existing = await positionModel.findByCode(data.code);
    if (existing) throw Conflict("Kode jabatan sudah digunakan");

    const position = await positionModel.createPosition(data);

    activity.success({
      action: "position.create",
      entity: "position",
      entity_id: position.id,
      summary: `Jabatan ${position.name} dibuat`,
    });

    res.status(201).json({ success: true, data: position });
  } catch (err) {
    next(err);
  }
}

export async function UpdatePositionController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const activity = startActivity(req);
    const { id } = res.locals.params as { id: string };
    const data = req.body as Partial<PositionInput>;

    const existing = await positionModel.findById(id);
    if (!existing) throw NotFound("Jabatan tidak ditemukan");

    if (data.code && data.code !== existing.code) {
      const duplicate = await positionModel.findByCode(data.code);
      if (duplicate) throw Conflict("Kode jabatan sudah digunakan");
    }

    if (data.is_active === false && existing.is_active) {
      const count = await positionModel.countEmployees(id);

      if (count > 0) {
        throw BadRequest(
          `Jabatan tidak dapat dinonaktifkan karena masih digunakan oleh ${count} karyawan`,
          { employee_count: count },
        );
      }
    }

    const position = await positionModel.updatePosition(id, data);

    activity.success({
      action: "position.update",
      entity: "position",
      entity_id: id,
      summary: `Jabatan ${existing.name} diubah`,
      metadata: { fields: Object.keys(data) },
    });

    res.json({ success: true, data: position });
  } catch (err) {
    next(err);
  }
}

export async function DeletePositionController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const activity = startActivity(req);
    const { id } = res.locals.params as { id: string };

    const existing = await positionModel.findById(id);
    if (!existing) throw NotFound("Jabatan tidak ditemukan");

    const count = await positionModel.countEmployees(id);
    if (count > 0) {
      throw BadRequest(
        `Jabatan tidak dapat dihapus karena masih digunakan oleh ${count} karyawan. Pindahkan karyawan ke jabatan lain terlebih dahulu.`,
        { employee_count: count },
      );
    }

    await positionModel.softDeletePosition(id);

    activity.success({
      action: "position.delete",
      entity: "position",
      entity_id: id,
      summary: `Jabatan ${existing.name} dihapus`,
    });

    res.json({ success: true, message: "Jabatan berhasil dihapus" });
  } catch (err) {
    next(err);
  }
}
