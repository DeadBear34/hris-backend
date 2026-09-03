import type { Request, Response, NextFunction } from "express";
import { pool } from "../config/databaseConnection.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import * as userModel from "../models/user.js";
import * as employeeModel from "../models/employee.js";
import * as tokenModel from "../models/verificationToken.js";
import type {
  TokenPurpose,
  VerificationToken,
} from "../models/verificationToken.js";
import { hashPassword, verifyPassword } from "../helpers/password.js";
import { sendMail } from "../helpers/mailer.js";
import {
  sendMailWithoutFailing,
  logFallback,
} from "../helpers/notification.js";
import {
  verificationCodeEmail,
  passwordResetEmail,
  passwordResetSuccessEmail,
} from "../helpers/emailTemplate.js";
import {
  generateVerificationCode,
  generateResetToken,
  expiresInMinutes,
} from "../helpers/token.js";
import { Conflict, BadRequest, TooManyRequests } from "../helpers/appError.js";
import { startActivity } from "../helpers/activityLog.js";

const CODE_VALID_MINUTES = 10;
const TAUTAN_BERLAKU_MENIT = 15;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;

const MESSAGE_INVALID_CODE =
  "Kode verifikasi tidak valid atau sudah kedaluwarsa";
const MESSAGE_INVALID_LINK =
  "Tautan reset password tidak valid atau sudah kedaluwarsa";

const MESSAGE_RESEND =
  "Kalau email tersebut terdaftar dan belum diverifikasi, kode verifikasi baru sudah kami kirim.";
const MESSAGE_FORGOT_PASSWORD =
  "Kalau email tersebut terdaftar, tautan untuk mengatur ulang password sudah kami kirim.";

interface RequestMeta {
  ip_address: string | null;
  user_agent: string | null;
}

function requestMeta(req: Request): RequestMeta {
  return {
    ip_address: req.ip ?? null,
    user_agent: req.headers["user-agent"] ?? null,
  };
}

async function terbitkanKodeVerifikasi(
  email: string,
  konteks: RequestMeta,
): Promise<string> {
  await tokenModel.invalidateActive(email, "email_verification");

  const code = generateVerificationCode();

  await tokenModel.createToken({
    email,
    purpose: "email_verification",
    token_hash: await hashPassword(code),
    expires_at: expiresInMinutes(CODE_VALID_MINUTES),
    ...konteks,
  });

  return code;
}

async function sendVerificationCode(
  email: string,
  name: string | null,
  konteks: RequestMeta,
): Promise<void> {
  const code = await terbitkanKodeVerifikasi(email, konteks);
  const body = verificationCodeEmail(code, CODE_VALID_MINUTES, name);

  const sent = await sendMailWithoutFailing(
    () => sendMail({ to: email, subject: body.subject, html: body.html }),
    "Gagal mengirim email verifikasi",
    { email },
  );

  if (!sent) {
    logFallback(
      "Email gagal dikirim, kode verifikasi dicetak di sini agar pengembangan dapat dilanjutkan",
      { email, verification_code: code },
    );
  }
}

async function increaseAttempts(token: VerificationToken): Promise<void> {
  if (!token.consumed_at) {
    await tokenModel.incrementAttempts(token.id);
  }
}

async function verifikasiToken(
  email: string,
  purpose: TokenPurpose,
  value: string,
  failureMessage: string,
): Promise<VerificationToken> {
  const token = await tokenModel.findLatest(email, purpose);

  if (!token) {
    logger.warn(
      { email, purpose, reason: "token belum pernah diterbitkan" },
      "Verifikasi token ditolak",
    );
    throw BadRequest(failureMessage);
  }

  let reason: string | null = null;

  if (token.consumed_at) {
    reason = "token sudah digunakan";
  } else if (token.expires_at.getTime() <= Date.now()) {
    reason = "token sudah kedaluwarsa";
  } else if (token.attempts >= MAX_ATTEMPTS) {
    reason = "percobaan melebihi batas";
  } else if (!(await verifyPassword(token.token_hash, value))) {
    reason = "nilai token tidak cocok";
  }

  if (reason) {
    await increaseAttempts(token);
    logger.warn({ email, purpose, alasan: reason }, "Verifikasi token ditolak");
    throw BadRequest(failureMessage);
  }

  return token;
}

export async function RegisterController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const activity = startActivity(req);

  try {
    const { email, password, full_name, phone, gender } = req.body;

    const existing = await userModel.findByEmail(email);

    if (existing) {
      if (existing.email_verified_at) {
        activity.failed({
          action: "auth.register",
          entity: "user",
          entity_id: existing.id,
          actor_user_id: existing.id,
          actor_email: email,
          summary: `Pendaftaran ditolak, email ${email} sudah terdaftar`,
          metadata: { reason: "email_sudah_terdaftar" },
        });

        throw Conflict("Email sudah terdaftar");
      }
      await sendVerificationCode(email, full_name, requestMeta(req));

      // Bukan akun baru, hanya kode verifikasi yang dikirim ulang
      activity.success({
        action: "auth.register",
        entity: "user",
        entity_id: existing.id,
        actor_user_id: existing.id,
        actor_email: email,
        actor_name: full_name,
        summary: `Kode verifikasi dikirim ulang ke ${email}`,
        metadata: { reason: "belum_diverifikasi", resent: true },
      });

      res.json({
        success: true,
        message:
          "Email ini sudah pernah didaftarkan tetapi belum diverifikasi. Kode verifikasi baru sudah dikirim, silakan lanjutkan ke halaman verifikasi.",
        data: { email, verification_required: true },
      });
      return;
    }

    const hashed = await hashPassword(password);
    const client = await pool.connect();

    let user;
    let employee;

    try {
      await client.query("BEGIN");

      user = await userModel.insertUser(
        client,
        email,
        hashed,
        "employee",
        new Date(),
      );

      employee = await employeeModel.insertEmployee(
        client,
        user.id,
        full_name,
        phone,
        gender,
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    await sendVerificationCode(email, full_name, requestMeta(req));

    activity.success({
      action: "auth.register",
      entity: "user",
      entity_id: user.id,
      actor_user_id: user.id,
      actor_email: user.email,
      actor_name: employee.full_name,
      summary: `${employee.full_name} mendaftar dengan email ${user.email}`,
      metadata: {
        employee_id: employee.id,
        employee_number: employee.employee_number,
        role: user.role,
      },
    });

    res.status(201).json({
      success: true,
      message:
        "Pendaftaran berhasil. Kami sudah mengirim kode verifikasi ke email kamu. Setelah email terverifikasi, akun masih menunggu persetujuan HR.",
      data: {
        id: user.id,
        email: user.email,
        role: user.role,
        is_active: user.is_active,
        verification_required: true,
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
    next(err);
  }
}

export async function VerifyEmailController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { email, code } = req.body as { email: string; code: string };

    const token = await verifikasiToken(
      email,
      "email_verification",
      code,
      MESSAGE_INVALID_CODE,
    );

    const user = await userModel.findByEmail(email);
    if (!user) throw BadRequest(MESSAGE_INVALID_CODE);

    await tokenModel.markConsumed(token.id);

    if (!user.email_verified_at) {
      await userModel.setEmailVerified(user.id);
    }

    res.json({
      success: true,
      message:
        "Email berhasil diverifikasi. Akun kamu sekarang menunggu persetujuan dari HR.",
      data: { email: user.email, email_verified: true },
    });
  } catch (err) {
    next(err);
  }
}

export async function ResendVerificationController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { email } = req.body as { email: string };

    const terakhir = await tokenModel.findLatest(email, "email_verification");

    if (terakhir) {
      const cooldownElapsed = Date.now() - terakhir.created_at.getTime();
      const remainder = RESEND_COOLDOWN_SECONDS * 1000 - cooldownElapsed;

      if (remainder > 0) {
        throw TooManyRequests(
          `Mohon tunggu ${Math.ceil(remainder / 1000)} detik sebelum meminta kode verifikasi baru`,
        );
      }
    }

    const user = await userModel.findByEmail(email);

    if (user && !user.email_verified_at) {
      const employee = await employeeModel.findByUserId(user.id);
      await sendVerificationCode(
        email,
        employee?.full_name ?? null,
        requestMeta(req),
      );
    }

    res.json({ success: true, message: MESSAGE_RESEND });
  } catch (err) {
    next(err);
  }
}

export async function ForgotPasswordController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { email } = req.body as { email: string };

    const user = await userModel.findByEmail(email);

    if (user?.is_active) {
      await tokenModel.invalidateActive(email, "password_reset");

      const value = generateResetToken();

      await tokenModel.createToken({
        email,
        purpose: "password_reset",
        token_hash: await hashPassword(value),
        expires_at: expiresInMinutes(TAUTAN_BERLAKU_MENIT),
        ...requestMeta(req),
      });

      const link = `${env.APP_URL}/reset-password?token=${value}&email=${encodeURIComponent(email)}`;
      const employee = await employeeModel.findByUserId(user.id);
      const body = passwordResetEmail(
        link,
        TAUTAN_BERLAKU_MENIT,
        employee?.full_name ?? null,
      );

      const sent = await sendMailWithoutFailing(
        () => sendMail({ to: email, subject: body.subject, html: body.html }),
        "Gagal mengirim email reset password",
        { email },
      );

      if (!sent) {
        logFallback(
          "Email gagal dikirim, tautan reset password dicetak di sini agar pengembangan dapat dilanjutkan",
          { email, reset_link: link },
        );
      }
    }

    res.json({ success: true, message: MESSAGE_FORGOT_PASSWORD });
  } catch (err) {
    next(err);
  }
}

export async function ResetPasswordController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const {
      email,
      token: value,
      password,
    } = req.body as {
      email: string;
      token: string;
      password: string;
    };

    const token = await verifikasiToken(
      email,
      "password_reset",
      value,
      MESSAGE_INVALID_LINK,
    );

    const user = await userModel.findByEmail(email);
    if (!user) throw BadRequest(MESSAGE_INVALID_LINK);

    const hashed = await hashPassword(password);

    await userModel.updatePassword(user.id, hashed);
    await tokenModel.markConsumed(token.id);

    const employee = await employeeModel.findByUserId(user.id);
    const body = passwordResetSuccessEmail(employee?.full_name ?? null);

    await sendMailWithoutFailing(
      () => sendMail({ to: email, subject: body.subject, html: body.html }),
      "Gagal mengirim email pemberitahuan reset password",
      { email },
    );

    res.json({
      success: true,
      message: "Password berhasil diubah. Silakan login memakai password baru.",
    });
  } catch (err) {
    next(err);
  }
}
