import type { Request, Response, NextFunction } from "express";
import * as employeeModel from "../models/employee.js";
import * as departmentModel from "../models/department.js";
import * as positionModel from "../models/position.js";
import type {
  ListParams,
  CreateEmployeeInput,
  UpdateEmployeeInput,
} from "../models/employee.js";
import { BadRequest, NotFound } from "../helpers/appError.js";

async function validasiRelasi(
  data: CreateEmployeeInput | UpdateEmployeeInput,
  currentId?: string,
) {
  if (data.department_id) {
    const dept = await departmentModel.findById(data.department_id);
    if (!dept) throw BadRequest("Departemen tidak ditemukan");
  }

  if (data.position_id) {
    const pos = await positionModel.findById(data.position_id);
    if (!pos) throw BadRequest("Jabatan tidak ditemukan");
  }

  if (data.manager_id) {
    if (currentId && data.manager_id === currentId) {
      throw BadRequest("Karyawan tidak bisa menjadi manajer dirinya sendiri");
    }

    const manager = await employeeModel.findById(data.manager_id);
    if (!manager) throw BadRequest("Manajer tidak ditemukan");
  }
}

export async function ListEmployeeController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const query = res.locals.query as ListParams;
    const { rows, total } = await employeeModel.listEmployees(query);

    res.json({
      success: true,
      data: rows,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        total_pages: Math.ceil(total / query.limit),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function DetailEmployeeController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = res.locals.params as { id: string };

    const employee = await employeeModel.findDetailById(id);
    if (!employee) throw NotFound("Karyawan tidak ditemukan");

    res.json({ success: true, data: employee });
  } catch (err) {
    next(err);
  }
}

export async function CreateEmployeeController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const data = req.body as CreateEmployeeInput;

    await validasiRelasi(data);

    const employee = await employeeModel.createEmployee(data);

    res.status(201).json({ success: true, data: employee });
  } catch (err) {
    next(err);
  }
}

export async function UpdateEmployeeController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = res.locals.params as { id: string };
    const data = req.body as UpdateEmployeeInput;

    const existing = await employeeModel.findById(id);
    if (!existing) throw NotFound("Karyawan tidak ditemukan");

    await validasiRelasi(data, id);

    const employee = await employeeModel.updateEmployee(id, data);

    res.json({ success: true, data: employee });
  } catch (err) {
    next(err);
  }
}

export async function DeleteEmployeeController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = res.locals.params as { id: string };

    const employee = await employeeModel.softDeleteEmployee(id);
    if (!employee) throw NotFound("Karyawan tidak ditemukan");

    res.json({
      success: true,
      message: "Karyawan berhasil dihapus",
    });
  } catch (err) {
    next(err);
  }
}
