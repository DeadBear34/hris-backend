import type { Request, Response, NextFunction } from "express";
import * as userModel from "../models/user.js";
import { hashPassword, verifyPassword } from "../helpers/password.js";
import { createToken } from "../helpers/jwt.js";
import { BadRequest, Conflict, Unauthorized } from "../helpers/appError.js";

export async function RegisterController(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      throw BadRequest("Email, password, dan nama wajib diisi");
    }

    if (password.length < 8) {
      throw BadRequest("Password minimal 8 karakter");
    }

    const existing = await userModel.findByEmail(email);

    if (existing) {
      throw Conflict("Email sudah terdaftar");
    }

    const hashed = await hashPassword(password);

    const user = await userModel.insertUser(email, hashed, name, "employee");

    res.status(201).json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
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

    if (!email || !password) {
      throw BadRequest("Email dan password wajib diisi");
    }

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
          name: user.name,
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
        name: user.name,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
}