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
  kirimEmailTanpaMenggagalkan,
  cetakCadanganKeLog,
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

const KODE_BERLAKU_MENIT = 10;
const TAUTAN_BERLAKU_MENIT = 15;
const MAKS_PERCOBAAN = 5;
const JEDA_KIRIM_ULANG_DETIK = 60;

const PESAN_KODE_TIDAK_VALID =
  "Kode verifikasi tidak valid atau sudah kedaluwarsa";
const PESAN_TAUTAN_TIDAK_VALID =
  "Tautan reset password tidak valid atau sudah kedaluwarsa";

const PESAN_KIRIM_ULANG =
  "Kalau email tersebut terdaftar dan belum diverifikasi, kode verifikasi baru sudah kami kirim.";
const PESAN_LUPA_PASSWORD =
  "Kalau email tersebut terdaftar, tautan untuk mengatur ulang password sudah kami kirim.";

interface KonteksPermintaan {
  ip_address: string | null;
  user_agent: string | null;
}

function konteksPermintaan(req: Request): KonteksPermintaan {
  return {
    ip_address: req.ip ?? null,
    user_agent: req.headers["user-agent"] ?? null,
  };
}

async function terbitkanKodeVerifikasi(
  email: string,
  konteks: KonteksPermintaan,
): Promise<string> {
  await tokenModel.invalidateActive(email, "email_verification");

  const kode = generateVerificationCode();

  await tokenModel.createToken({
    email,
    purpose: "email_verification",
    token_hash: await hashPassword(kode),
    expires_at: expiresInMinutes(KODE_BERLAKU_MENIT),
    ...konteks,
  });

  return kode;
}

async function kirimKodeVerifikasi(
  email: string,
  nama: string | null,
  konteks: KonteksPermintaan,
): Promise<void> {
  const kode = await terbitkanKodeVerifikasi(email, konteks);
  const isi = verificationCodeEmail(kode, KODE_BERLAKU_MENIT, nama);

  const terkirim = await kirimEmailTanpaMenggagalkan(
    () => sendMail({ to: email, subject: isi.subject, html: isi.html }),
    "Gagal mengirim email verifikasi",
    { email },
  );

  if (!terkirim) {
    cetakCadanganKeLog(
      "Email gagal dikirim, kode verifikasi dicetak di sini agar pengembangan dapat dilanjutkan",
      { email, kode_verifikasi: kode },
    );
  }
}

async function naikkanPercobaan(token: VerificationToken): Promise<void> {
  if (!token.consumed_at) {
    await tokenModel.incrementAttempts(token.id);
  }
}

async function verifikasiToken(
  email: string,
  purpose: TokenPurpose,
  nilai: string,
  pesanGagal: string,
): Promise<VerificationToken> {
  const token = await tokenModel.findLatest(email, purpose);

  if (!token) {
    logger.warn(
      { email, purpose, alasan: "token belum pernah diterbitkan" },
      "Verifikasi token ditolak",
    );
    throw BadRequest(pesanGagal);
  }

  let alasan: string | null = null;

  if (token.consumed_at) {
    alasan = "token sudah digunakan";
  } else if (token.expires_at.getTime() <= Date.now()) {
    alasan = "token sudah kedaluwarsa";
  } else if (token.attempts >= MAKS_PERCOBAAN) {
    alasan = "percobaan melebihi batas";
  } else if (!(await verifyPassword(token.token_hash, nilai))) {
    alasan = "nilai token tidak cocok";
  }

  if (alasan) {
    await naikkanPercobaan(token);
    logger.warn({ email, purpose, alasan }, "Verifikasi token ditolak");
    throw BadRequest(pesanGagal);
  }

  return token;
}

export async function RegisterController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { email, password, full_name, phone, gender } = req.body;

    const existing = await userModel.findByEmail(email);

    if (existing) {
      if (existing.email_verified_at) {
        throw Conflict("Email sudah terdaftar");
      }
      await kirimKodeVerifikasi(email, full_name, konteksPermintaan(req));

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

    await kirimKodeVerifikasi(email, full_name, konteksPermintaan(req));

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
      PESAN_KODE_TIDAK_VALID,
    );

    const user = await userModel.findByEmail(email);
    if (!user) throw BadRequest(PESAN_KODE_TIDAK_VALID);

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
      const jedaBerlalu = Date.now() - terakhir.created_at.getTime();
      const sisa = JEDA_KIRIM_ULANG_DETIK * 1000 - jedaBerlalu;

      if (sisa > 0) {
        throw TooManyRequests(
          `Mohon tunggu ${Math.ceil(sisa / 1000)} detik sebelum meminta kode verifikasi baru`,
        );
      }
    }

    const user = await userModel.findByEmail(email);

    if (user && !user.email_verified_at) {
      const employee = await employeeModel.findByUserId(user.id);
      await kirimKodeVerifikasi(
        email,
        employee?.full_name ?? null,
        konteksPermintaan(req),
      );
    }

    res.json({ success: true, message: PESAN_KIRIM_ULANG });
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

      const nilai = generateResetToken();

      await tokenModel.createToken({
        email,
        purpose: "password_reset",
        token_hash: await hashPassword(nilai),
        expires_at: expiresInMinutes(TAUTAN_BERLAKU_MENIT),
        ...konteksPermintaan(req),
      });

      const tautan = `${env.APP_URL}/reset-password?token=${nilai}&email=${encodeURIComponent(email)}`;
      const employee = await employeeModel.findByUserId(user.id);
      const isi = passwordResetEmail(
        tautan,
        TAUTAN_BERLAKU_MENIT,
        employee?.full_name ?? null,
      );

      const terkirim = await kirimEmailTanpaMenggagalkan(
        () => sendMail({ to: email, subject: isi.subject, html: isi.html }),
        "Gagal mengirim email reset password",
        { email },
      );

      if (!terkirim) {
        cetakCadanganKeLog(
          "Email gagal dikirim, tautan reset password dicetak di sini agar pengembangan dapat dilanjutkan",
          { email, tautan_reset: tautan },
        );
      }
    }

    res.json({ success: true, message: PESAN_LUPA_PASSWORD });
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
      token: nilai,
      password,
    } = req.body as {
      email: string;
      token: string;
      password: string;
    };

    const token = await verifikasiToken(
      email,
      "password_reset",
      nilai,
      PESAN_TAUTAN_TIDAK_VALID,
    );

    const user = await userModel.findByEmail(email);
    if (!user) throw BadRequest(PESAN_TAUTAN_TIDAK_VALID);

    const hashed = await hashPassword(password);

    await userModel.updatePassword(user.id, hashed);
    await tokenModel.markConsumed(token.id);

    const employee = await employeeModel.findByUserId(user.id);
    const isi = passwordResetSuccessEmail(employee?.full_name ?? null);

    await kirimEmailTanpaMenggagalkan(
      () => sendMail({ to: email, subject: isi.subject, html: isi.html }),
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
