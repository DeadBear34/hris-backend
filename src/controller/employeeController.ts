import type { Request, Response, NextFunction } from "express";
import { pool } from "../config/databaseConnection.js";
import * as employeeModel from "../models/employee.js";
import * as userModel from "../models/user.js";
import * as departmentModel from "../models/department.js";
import * as positionModel from "../models/position.js";
import type {
  ListParams,
  CreateEmployeeInput,
  UpdateEmployeeInput,
} from "../models/employee.js";
import type { UserRole } from "../models/user.js";
import { hashPassword } from "../helpers/password.js";
import {
  BadRequest,
  NotFound,
  Conflict,
  Unauthorized,
} from "../helpers/appError.js";

async function validasiRelasi(
  data: Partial<CreateEmployeeInput>,
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
  const client = await pool.connect();

  try {
    if (!req.user) throw Unauthorized("Belum login");

    const { email, password, role, ...employeeData } =
      req.body as CreateEmployeeInput & {
        email: string;
        password: string;
        role?: UserRole;
      };

    const existing = await userModel.findByEmail(email);
    if (existing) throw Conflict("Email sudah terdaftar");

    await validasiRelasi(employeeData);

    const hashed = await hashPassword(password);

    await client.query("BEGIN");

    const user = await userModel.insertUserByAdmin(
      client,
      email,
      hashed,
      role ?? "employee",
      req.user.id,
    );

    const employee = await employeeModel.createEmployee(
      client,
      user.id,
      employeeData,
    );

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      message:
        "Karyawan berhasil ditambahkan. Sampaikan password awal kepada karyawan dan minta menggantinya saat login pertama.",
      data: {
        employee,
        account: {
          id: user.id,
          email: user.email,
          role: user.role,
          must_change_password: user.must_change_password,
        },
      },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
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
  const client = await pool.connect();

  try {
    const { id } = res.locals.params as { id: string };

    const existing = await employeeModel.findById(id);
    if (!existing) throw NotFound("Karyawan tidak ditemukan");

    const bawahan = await employeeModel.countSubordinates(id);
    if (bawahan > 0) {
      throw BadRequest(
        `Karyawan tidak dapat dihapus karena masih menjadi manajer dari ${bawahan} karyawan`,
      );
    }

    await client.query("BEGIN");

    await employeeModel.softDeleteEmployee(client, id);

    if (existing.user_id) {
      await userModel.softDeleteUser(client, existing.user_id);
    }

    await client.query("COMMIT");

    res.json({ success: true, message: "Karyawan berhasil dihapus" });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
}
