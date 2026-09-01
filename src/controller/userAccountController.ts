import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env.js";
import * as userModel from "../models/user.js";
import * as employeeModel from "../models/employee.js";
import { sendMail } from "../helpers/mailer.js";
import { sendMailWithoutFailing } from "../helpers/notification.js";
import { accountApprovedEmail } from "../helpers/emailTemplate.js";
import { Unauthorized, NotFound, BadRequest } from "../helpers/appError.js";

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
    if (!req.user)
      throw Unauthorized("Kamu belum login, silakan masuk terlebih dahulu");

    const { id } = res.locals.params as { id: string };

    const existing = await userModel.findById(id);
    if (!existing) throw NotFound("User tidak ditemukan");

    if (existing.approved_at) {
      throw BadRequest("Akun ini sudah pernah disetujui");
    }

    const user = await userModel.approveUser(id, req.user.id);

    const employee = await employeeModel.findByUserId(id);
    const body = accountApprovedEmail(
      `${env.APP_URL}/login`,
      employee?.full_name ?? null,
    );

    await sendMailWithoutFailing(
      () =>
        sendMail({
          to: existing.email,
          subject: body.subject,
          html: body.html,
        }),
      "Gagal mengirim email persetujuan akun",
      { email: existing.email },
    );

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
    if (!req.user)
      throw Unauthorized("Kamu belum login, silakan masuk terlebih dahulu");

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
