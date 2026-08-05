import type { Request, Response, NextFunction } from "express";
import * as userModel from "../models/user.js";
import { hashPassword, verifyPassword } from "../helpers/password.js";
import { createToken } from "../helpers/jwt.js";
import { BadRequest, Conflict, Unauthorized } from "../helpers/appError.js";

export async function RegisterController(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password, full_name, phone, gender } = req.body;

    const existing = await userModel.findByEmail(email);

    if (existing) {
      throw Conflict("Email sudah terdaftar");
    }

    const hashed = await hashPassword(password);

    const user = await userModel.insertUser(email, hashed, full_name, phone, gender, "employee", new Date());

    res.status(201).json({
    success: true,
    data: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone,
        gender: user.gender,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function LoginController(req: Request, res: Response, next: NextFunction) {
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
      throw Unauthorized("Akun tidak aktif");
    }

    const token = createToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function MeController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      throw Unauthorized("Belum login");
    }

    const user = await userModel.findById(req.user.id);

    if (!user) {
      throw Unauthorized("User tidak ditemukan");
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone,
        gender: user.gender,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
}