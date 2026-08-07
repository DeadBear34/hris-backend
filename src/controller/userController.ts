import type { Request, Response, NextFunction } from "express";
import { pool } from "../config/databaseConnection.js";
import * as userModel from "../models/user.js";
import * as employeeModel from "../models/employee.js";
import { hashPassword, verifyPassword } from "../helpers/password.js";
import { createToken } from "../helpers/jwt.js";
import { Conflict, Unauthorized, NotFound } from "../helpers/appError.js";

export async function RegisterController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const client = await pool.connect();

  try {
    const { email, password, full_name, phone, gender } = req.body;

    const existing = await userModel.findByEmail(email);

    if (existing) {
      throw Conflict("Email sudah terdaftar");
    }

    const hashed = await hashPassword(password);

    await client.query("BEGIN");

    const user = await userModel.insertUser(
      client,
      email,
      hashed,
      "employee",
      new Date(),
    );
    const employee = await employeeModel.insertEmployee(
      client,
      user.id,
      full_name,
      phone,
      gender,
    );
    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      message:
        "Pendaftaran berhasil. Akun kamu menunggu persetujuan dari HR sebelum dapat digunakan.",
      data: {
        id: user.id,
        email: user.email,
        role: user.role,
        is_active: user.is_active,
        employee: {
          id: employee.id,
          employee_number: employee.employee_number,
          full_name: employee.full_name,
          phone: employee.phone,
          gender: employee.gender,
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

export async function LoginController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { email, password } = req.body;

    const user = await userModel.findByEmail(email);

    if (!user) {
      throw Unauthorized("Email atau password salah");
    }

    const valid = await verifyPassword(user.password, password);

    if (!valid) {
      throw Unauthorized("Email atau password salah");
    }

    if (!user.is_active) {
      if (!user.approved_at) {
        throw Unauthorized("Akun kamu masih menunggu persetujuan dari HR");
      }
      throw Unauthorized("Akun tidak aktif, silakan hubungi HR");
    }

    const employee = await employeeModel.findByUserId(user.id);

    const token = createToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    await userModel.updateLastLogin(user.id);

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          full_name: employee?.full_name ?? null,
          employee_number: employee?.employee_number ?? null,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function MeController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user) {
      throw Unauthorized("Belum login");
    }

    const user = await userModel.findById(req.user.id);

    if (!user) {
      throw NotFound("User tidak ditemukan");
    }

    const employee = await employeeModel.findByUserId(user.id);

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        role: user.role,
        is_active: user.is_active,
        last_login_at: user.last_login_at,
        employee: employee
          ? {
              id: employee.id,
              employee_number: employee.employee_number,
              full_name: employee.full_name,
              phone: employee.phone,
              gender: employee.gender,
              employment_status: employee.employment_status,
              join_date: employee.join_date,
            }
          : null,
      },
    });
  } catch (err) {
    next(err);
  }
}
