import type { Request, Response, NextFunction } from "express";
import { pool } from "../config/databaseConnection.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import * as userModel from "../models/user.js";
import * as employeeModel from "../models/employee.js";
import type { EmployeeGender } from "../models/employee.js";
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
import {
  AppError,
  Conflict,
  BadRequest,
  TooManyRequests,
} from "../helpers/appError.js";
import { startActivity } from "../helpers/activityLog.js";
import { notifyAccountNeedsApproval } from "../helpers/notify.js";
import { plural } from "../helpers/plural.js";

const CODE_VALID_MINUTES = 10;
const RESET_LINK_TTL_MINUTES = 15;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;

const MESSAGE_INVALID_CODE = "Verification code is invalid or has expired";
const MESSAGE_INVALID_LINK = "Password reset link is invalid or has expired";

const MESSAGE_RESEND =
  "If that email is registered and not yet verified, we've sent a new verification code.";
const MESSAGE_FORGOT_PASSWORD =
  "If that email is registered, we've sent a link to reset your password.";

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

async function issueVerificationCode(
  email: string,
  context: RequestMeta,
): Promise<string> {
  await tokenModel.invalidateActive(email, "email_verification");

  const code = generateVerificationCode();

  await tokenModel.createToken({
    email,
    purpose: "email_verification",
    token_hash: await hashPassword(code),
    expires_at: expiresInMinutes(CODE_VALID_MINUTES),
    ...context,
  });

  return code;
}

async function sendVerificationCode(
  email: string,
  name: string | null,
  context: RequestMeta,
): Promise<void> {
  const code = await issueVerificationCode(email, context);
  const body = verificationCodeEmail(code, CODE_VALID_MINUTES, name);

  const sent = await sendMailWithoutFailing(
    () => sendMail({ to: email, subject: body.subject, html: body.html }),
    "Failed to send verification email",
    { email },
  );

  if (!sent) {
    logFallback(
      "Email could not be sent, the verification code is printed here so development can continue",
      { email, verification_code: code },
    );
  }
}

async function verifyTokenValue(
  email: string,
  purpose: TokenPurpose,
  value: string,
  failureMessage: string,
): Promise<VerificationToken> {
  const token = await tokenModel.findLatest(email, purpose);

  let reason: string | null = null;

  // Jatah percobaan diambil sebelum nilai token dicocokkan. Kalau dihitung
  // belakangan, tebakan yang dikirim bersamaan lolos dari batas percobaan
  if (!token) {
    reason = "token was never issued";
  } else if (token.consumed_at) {
    reason = "token already used";
  } else if (token.expires_at.getTime() <= Date.now()) {
    reason = "token expired";
  } else if (!(await tokenModel.claimAttempt(token.id, MAX_ATTEMPTS))) {
    reason = "attempt limit exceeded";
  } else if (!(await verifyPassword(token.token_hash, value))) {
    reason = "token value does not match";
  }

  if (!token || reason) {
    logger.warn({ email, purpose, reason }, "Token verification rejected");
    throw BadRequest(failureMessage);
  }

  return token;
}

interface RegisterInput {
  email: string;
  password: string;
  full_name: string;
  phone: string;
  gender: EmployeeGender;
}

// Akun dan karyawan harus lahir bersama, jadi keduanya satu transaksi.
// Kalau salah satu gagal, tidak ada akun tanpa karyawan atau sebaliknya
async function createAccountWithEmployee(data: RegisterInput, hashed: string) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const user = await userModel.insertUser(
      client,
      data.email,
      hashed,
      "employee",
      new Date(),
    );

    const employee = await employeeModel.insertEmployee(
      client,
      user.id,
      data.full_name,
      data.phone,
      data.gender,
    );

    await client.query("COMMIT");

    return { user, employee };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function RegisterController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const activity = startActivity(req);

  try {
    const data = req.body as RegisterInput;
    const { email, full_name } = data;

    const existing = await userModel.findByEmail(email);

    // Email yang sudah terverifikasi berarti akunnya benar-benar dipakai
    if (existing?.email_verified_at) {
      activity.failed({
        action: "auth.register",
        entity: "user",
        entity_id: existing.id,
        actor_user_id: existing.id,
        actor_email: email,
        summary: `Registration rejected, email ${email} is already registered`,
        metadata: { reason: "email_already_registered" },
      });

      throw Conflict("Email is already registered");
    }

    // Pernah mendaftar tapi belum verifikasi: kirim ulang kodenya saja,
    // jangan buat akun kedua
    if (existing) {
      await sendVerificationCode(email, full_name, requestMeta(req));

      activity.success({
        action: "auth.register",
        entity: "user",
        entity_id: existing.id,
        actor_user_id: existing.id,
        actor_email: email,
        actor_name: full_name,
        summary: `Verification code resent to ${email}`,
        metadata: { reason: "not_verified", resent: true },
      });

      res.json({
        success: true,
        message:
          "This email was registered before but has not been verified. A new verification code has been sent, please continue to the verification page.",
        data: { email, verification_required: true },
      });
      return;
    }

    const hashed = await hashPassword(data.password);
    const { user, employee } = await createAccountWithEmployee(data, hashed);

    // Notifikasi dulu, email belakangan. Pengiriman email lewat jaringan
    // memakan waktu, dan tidak ada alasan penyetuju menunggunya
    await notifyAccountNeedsApproval({
      user_id: user.id,
      full_name: employee.full_name,
      email: user.email,
    });

    await sendVerificationCode(email, full_name, requestMeta(req));

    activity.success({
      action: "auth.register",
      entity: "user",
      entity_id: user.id,
      actor_user_id: user.id,
      actor_email: user.email,
      actor_name: employee.full_name,
      summary: `${employee.full_name} registered with email ${user.email}`,
      metadata: {
        employee_id: employee.id,
        employee_number: employee.employee_number,
        role: user.role,
      },
    });

    res.status(201).json({
      success: true,
      message:
        "Registration successful. We've sent a verification code to your email. After your email is verified, your account still needs HR approval.",
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
  const activity = startActivity(req);
  const { email, code } = req.body as { email: string; code: string };

  try {
    const token = await verifyTokenValue(
      email,
      "email_verification",
      code,
      MESSAGE_INVALID_CODE,
    );

    const user = await userModel.findByEmail(email);
    if (!user) throw BadRequest(MESSAGE_INVALID_CODE);

    // Hanya satu permintaan yang bisa menandai token terpakai
    const consumed = await tokenModel.markConsumed(token.id);
    if (!consumed) throw BadRequest(MESSAGE_INVALID_CODE);

    if (!user.email_verified_at) {
      await userModel.setEmailVerified(user.id);
    }

    activity.success({
      action: "auth.verify_email",
      entity: "user",
      entity_id: user.id,
      actor_user_id: user.id,
      actor_email: user.email,
      summary: `Email ${user.email} verified`,
    });

    res.json({
      success: true,
      message:
        "Email verified successfully. Your account is now waiting for HR approval.",
      data: { email: user.email, email_verified: true },
    });
  } catch (err) {
    activity.failed({
      action: "auth.verify_email",
      entity: "user",
      actor_email: email,
      summary: `Email verification failed for ${email}`,
      metadata: {
        reason: err instanceof AppError ? err.message : "unexpected error",
      },
    });

    next(err);
  }
}

export async function ResendVerificationController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const activity = startActivity(req);

  try {
    const { email } = req.body as { email: string };

    const latestToken = await tokenModel.findLatest(
      email,
      "email_verification",
    );

    if (latestToken) {
      const cooldownElapsed = Date.now() - latestToken.created_at.getTime();
      const remainder = RESEND_COOLDOWN_SECONDS * 1000 - cooldownElapsed;

      if (remainder > 0) {
        activity.failed({
          action: "auth.resend_verification",
          entity: "user",
          actor_email: email,
          summary: `Verification code request rejected for ${email}`,
          metadata: { reason: "cooldown" },
        });

        throw TooManyRequests(
          `Please wait ${plural(Math.ceil(remainder / 1000), "second")} before requesting a new verification code`,
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

    activity.success({
      action: "auth.resend_verification",
      entity: "user",
      entity_id: user?.id ?? null,
      actor_user_id: user?.id ?? null,
      actor_email: email,
      summary: `Verification code requested again for ${email}`,
      metadata: { sent: Boolean(user && !user.email_verified_at) },
    });

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
  const activity = startActivity(req);

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
        expires_at: expiresInMinutes(RESET_LINK_TTL_MINUTES),
        ...requestMeta(req),
      });

      const link = `${env.APP_URL}/reset-password?token=${value}&email=${encodeURIComponent(email)}`;
      const employee = await employeeModel.findByUserId(user.id);
      const body = passwordResetEmail(
        link,
        RESET_LINK_TTL_MINUTES,
        employee?.full_name ?? null,
      );

      const sent = await sendMailWithoutFailing(
        () => sendMail({ to: email, subject: body.subject, html: body.html }),
        "Failed to send password reset email",
        { email },
      );

      if (!sent) {
        logFallback(
          "Email could not be sent, the password reset link is printed here so development can continue",
          { email, reset_link: link },
        );
      }
    }

    activity.success({
      action: "auth.forgot_password",
      entity: "user",
      entity_id: user?.id ?? null,
      actor_user_id: user?.id ?? null,
      actor_email: email,
      summary: `Password reset requested for ${email}`,
      metadata: { sent: Boolean(user?.is_active) },
    });

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
  const activity = startActivity(req);
  const { email: requestEmail } = req.body as { email: string };

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

    const token = await verifyTokenValue(
      email,
      "password_reset",
      value,
      MESSAGE_INVALID_LINK,
    );

    const user = await userModel.findByEmail(email);
    if (!user) throw BadRequest(MESSAGE_INVALID_LINK);

    // Token ditandai terpakai sebelum password diganti. Dua permintaan dengan
    // token yang sama tidak bisa sama-sama mengganti password
    const consumed = await tokenModel.markConsumed(token.id);
    if (!consumed) throw BadRequest(MESSAGE_INVALID_LINK);

    const hashed = await hashPassword(password);

    await userModel.updatePassword(user.id, hashed);

    const employee = await employeeModel.findByUserId(user.id);
    const body = passwordResetSuccessEmail(employee?.full_name ?? null);

    await sendMailWithoutFailing(
      () => sendMail({ to: email, subject: body.subject, html: body.html }),
      "Failed to send password reset notification email",
      { email },
    );

    activity.success({
      action: "auth.reset_password",
      entity: "user",
      entity_id: user.id,
      actor_user_id: user.id,
      actor_email: user.email,
      summary: `Password reset completed for ${user.email}`,
    });

    res.json({
      success: true,
      message:
        "Password changed successfully. Please log in with your new password.",
    });
  } catch (err) {
    activity.failed({
      action: "auth.reset_password",
      entity: "user",
      actor_email: requestEmail,
      summary: `Password reset failed for ${requestEmail}`,
      metadata: {
        reason: err instanceof AppError ? err.message : "unexpected error",
      },
    });

    next(err);
  }
}
