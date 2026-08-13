import type { Request, Response, NextFunction } from "express";
import * as positionModel from "../models/position.js";
import type { PositionInput } from "../models/position.js";
import { Conflict, NotFound, BadRequest } from "../helpers/appError.js";

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
    const data = req.body as PositionInput;

    const existing = await positionModel.findByCode(data.code);
    if (existing) throw Conflict("Kode jabatan sudah digunakan");

    const position = await positionModel.createPosition(data);

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
    const { id } = res.locals.params as { id: string };
    const data = req.body as Partial<PositionInput>;

    const existing = await positionModel.findById(id);
    if (!existing) throw NotFound("Jabatan tidak ditemukan");

    if (data.code && data.code !== existing.code) {
      const duplicate = await positionModel.findByCode(data.code);
      if (duplicate) throw Conflict("Kode jabatan sudah digunakan");
    }

    if (data.is_active === false && existing.is_active) {
      const jumlah = await positionModel.countEmployees(id);

      if (jumlah > 0) {
        throw BadRequest(
          `Jabatan tidak dapat dinonaktifkan karena masih digunakan oleh ${jumlah} karyawan`,
          { employee_count: jumlah },
        );
      }
    }

    const position = await positionModel.updatePosition(id, data);

    res.json({ success: true, data: position });
  } catch (err) {
    next(err);
  }
}

export async function DeletePositionController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = res.locals.params as { id: string };

    const existing = await positionModel.findById(id);
    if (!existing) throw NotFound("Jabatan tidak ditemukan");

    const jumlah = await positionModel.countEmployees(id);
    if (jumlah > 0) {
      throw BadRequest(
        `Jabatan tidak dapat dihapus karena masih digunakan oleh ${jumlah} karyawan. Pindahkan karyawan ke jabatan lain terlebih dahulu.`,
        { employee_count: jumlah },
      );
    }

    await positionModel.softDeletePosition(id);

    res.json({ success: true, message: "Jabatan berhasil dihapus" });
  } catch (err) {
    next(err);
  }
}
