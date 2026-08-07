import type { Request, Response, NextFunction } from "express";
import * as departmentModel from "../models/department.js";
import type { DepartmentInput } from "../models/department.js";
import { Conflict, NotFound, BadRequest } from "../helpers/appError.js";

export async function ListDepartmentController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const departments = await departmentModel.findAll();
    res.json({ success: true, data: departments });
  } catch (err) {
    next(err);
  }
}

export async function DetailDepartmentController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = res.locals.params as { id: string };

    const department = await departmentModel.findById(id);
    if (!department) throw NotFound("Departemen tidak ditemukan");

    res.json({ success: true, data: department });
  } catch (err) {
    next(err);
  }
}

export async function CreateDepartmentController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const data = req.body as DepartmentInput;

    const existing = await departmentModel.findByCode(data.code);
    if (existing) throw Conflict("Kode departemen sudah digunakan");

    const department = await departmentModel.createDepartment(data);

    res.status(201).json({ success: true, data: department });
  } catch (err) {
    next(err);
  }
}

export async function UpdateDepartmentController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = res.locals.params as { id: string };
    const data = req.body as Partial<DepartmentInput>;

    const existing = await departmentModel.findById(id);
    if (!existing) throw NotFound("Departemen tidak ditemukan");

    if (data.code && data.code !== existing.code) {
      const duplicate = await departmentModel.findByCode(data.code);
      if (duplicate) throw Conflict("Kode departemen sudah digunakan");
    }

    const department = await departmentModel.updateDepartment(id, data);

    res.json({ success: true, data: department });
  } catch (err) {
    next(err);
  }
}

export async function DeleteDepartmentController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = res.locals.params as { id: string };

    const existing = await departmentModel.findById(id);
    if (!existing) throw NotFound("Departemen tidak ditemukan");

    const jumlah = await departmentModel.countEmployees(id);
    if (jumlah > 0) {
      throw BadRequest(
        `Departemen tidak dapat dihapus karena masih memiliki ${jumlah} karyawan`,
      );
    }

    await departmentModel.softDeleteDepartment(id);

    res.json({ success: true, message: "Departemen berhasil dihapus" });
  } catch (err) {
    next(err);
  }
}
