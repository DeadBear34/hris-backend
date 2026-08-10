import type { Request, Response, NextFunction } from "express";
import { pool } from "../config/databaseConnection.js";
import * as userModel from "../models/user.js";
import * as employeeModel from "../models/employee.js";
import { hashPassword, verifyPassword } from "../helpers/password.js";
import { createToken } from "../helpers/jwt.js";
import {
  Conflict,
  Unauthorized,
  NotFound,
  BadRequest,
} from "../helpers/appError.js";

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
          must_change_password: user.must_change_password,
          employee_id: employee?.id ?? null,
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

    const detail = employee
      ? await employeeModel.findDetailById(employee.id)
      : null;

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        role: user.role,
        is_active: user.is_active,
        must_change_password: user.must_change_password,
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
              department_name: detail?.department_name ?? null,
              position_name: detail?.position_name ?? null,
              manager_name: detail?.manager_name ?? null,
            }
          : null,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function ChangePasswordController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user) throw Unauthorized("Belum login");

    const { current_password, new_password } = req.body;

    const user = await userModel.findByEmail(req.user.email);
    if (!user) throw NotFound("User tidak ditemukan");

    const valid = await verifyPassword(user.password, current_password);
    if (!valid) throw Unauthorized("Password saat ini salah");

    const hashed = await hashPassword(new_password);
    await userModel.updatePassword(user.id, hashed);

    res.json({ success: true, message: "Password berhasil diubah" });
  } catch (err) {
    next(err);
  }
}

export async function ListPendingUserController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const users = await userModel.findPending();

    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
}

export async function ApproveUserController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user) throw Unauthorized("Belum login");

    const { id } = res.locals.params as { id: string };

    const existing = await userModel.findById(id);
    if (!existing) throw NotFound("User tidak ditemukan");

    if (existing.approved_at) {
      throw BadRequest("Akun ini sudah pernah disetujui");
    }

    const user = await userModel.approveUser(id, req.user.id);

    res.json({
      success: true,
      message: "Akun berhasil disetujui dan sekarang dapat digunakan",
      data: {
        id: user?.id,
        email: user?.email,
        role: user?.role,
        is_active: user?.is_active,
        approved_at: user?.approved_at,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function SetUserActiveController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user) throw Unauthorized("Belum login");

    const { id } = res.locals.params as { id: string };
    const { is_active } = req.body as { is_active: boolean };

    if (id === req.user.id) {
      throw BadRequest("Kamu tidak dapat mengubah status akun sendiri");
    }

    const existing = await userModel.findById(id);
    if (!existing) throw NotFound("User tidak ditemukan");

    if (!existing.approved_at && is_active) {
      throw BadRequest(
        "Akun ini belum pernah disetujui, gunakan endpoint persetujuan terlebih dahulu",
      );
    }

    const user = await userModel.setUserActive(id, is_active);

    res.json({
      success: true,
      message: is_active
        ? "Akun berhasil diaktifkan"
        : "Akun berhasil dinonaktifkan",
      data: {
        id: user?.id,
        email: user?.email,
        is_active: user?.is_active,
      },
    });
  } catch (err) {
    next(err);
  }
}
