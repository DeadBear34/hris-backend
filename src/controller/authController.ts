import type { Request, Response, NextFunction } from "express";
import * as userModel from "../models/user.js";
import * as employeeModel from "../models/employee.js";
import { hashPassword, verifyPassword } from "../helpers/password.js";
import { createToken } from "../helpers/jwt.js";
import { forgetSession, revokeToken } from "../helpers/sessionStore.js";
import { getUserFeatureCodes } from "../middlewares/feature.js";
import {
  Unauthorized,
  NotFound,
  BadRequest,
  Conflict,
} from "../helpers/appError.js";
import { photoUrlFor } from "../helpers/storage.js";
import { startActivity } from "../helpers/activityLog.js";
import { rejectStaleUpdate } from "../helpers/concurrency.js";

// Hash tiruan untuk email yang tidak terdaftar. Tanpa ini, login dengan email
// asing selesai jauh lebih cepat karena argon2 dilewati, sehingga selisih
// waktunya membocorkan email mana yang terdaftar walaupun pesannya sama.
// Dibuat sekali saat pertama dibutuhkan, dengan parameter argon2 yang sama
let dummyHash: Promise<string> | null = null;

function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(`not-a-real-account-${Date.now()}`);
  return dummyHash;
}

function buildProfile(
  user: userModel.User,
  employee: employeeModel.Employee | null,
  detail: employeeModel.EmployeeListItem | null,
  features: string[],
) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    is_active: user.is_active,
    must_change_password: user.must_change_password,
    email_verified_at: user.email_verified_at,
    last_login_at: user.last_login_at,
    features,
    employee: employee
      ? {
          id: employee.id,
          employee_number: employee.employee_number,
          full_name: employee.full_name,
          phone: employee.phone,
          gender: employee.gender,
          birth_date: employee.birth_date,
          address: employee.address,
          photo_path: employee.photo_path,
          photo_url: photoUrlFor(employee.photo_path),
          employment_status: employee.employment_status,
          join_date: employee.join_date,
          department_id: employee.department_id,
          position_id: employee.position_id,
          manager_id: employee.manager_id,
          department_name: detail?.department_name ?? null,
          position_name: detail?.position_name ?? null,
          manager_name: detail?.manager_name ?? null,
          updated_at: employee.updated_at,
        }
      : null,
  };
}

export async function LoginController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const activity = startActivity(req);

  try {
    const { email, password } = req.body;

    // Password tidak pernah masuk metadata, hanya email dan sebab gagalnya
    const reject = (reason: string, message: string, user_id?: string) => {
      activity.failed({
        action: "auth.login",
        entity: "user",
        entity_id: user_id ?? null,
        actor_user_id: user_id ?? null,
        actor_email: email,
        summary: `Login failed for ${email}`,
        metadata: { reason },
      });

      return Unauthorized(message);
    };

    const user = await userModel.findByEmail(email);

    if (!user) {
      // hasilnya diabaikan; yang dibutuhkan hanya waktu kerjanya
      await verifyPassword(await dummyPasswordHash(), password);
      throw reject("email_not_registered", "Incorrect email or password");
    }

    const valid = await verifyPassword(user.password, password);

    if (!valid) {
      throw reject("wrong_password", "Incorrect email or password", user.id);
    }

    if (!user.email_verified_at) {
      throw reject(
        "email_not_verified",
        "Your email is not verified yet. Please enter the verification code we sent to your email.",
        user.id,
      );
    }

    if (!user.approved_at) {
      throw reject(
        "not_approved",
        "Your account is still waiting for admin approval",
        user.id,
      );
    }

    if (!user.is_active) {
      throw reject(
        "account_inactive",
        "Your account has been deactivated, please contact an admin",
        user.id,
      );
    }

    const employee = await employeeModel.findByUserId(user.id);

    const token = createToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    await userModel.updateLastLogin(user.id);

    activity.success({
      action: "auth.login",
      entity: "user",
      entity_id: user.id,
      actor_user_id: user.id,
      actor_email: user.email,
      actor_name: employee?.full_name ?? null,
      summary: `${employee?.full_name ?? user.email} logged in`,
      metadata: { role: user.role },
    });

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
      throw Unauthorized("You are not logged in, please log in first");
    }

    const user = await userModel.findById(req.user.id);

    if (!user) {
      throw NotFound("User not found");
    }

    const employee = await employeeModel.findByUserId(user.id);

    const detail = employee
      ? await employeeModel.findDetailById(employee.id)
      : null;

    res.json({
      success: true,
      data: buildProfile(
        user,
        employee,
        detail,
        await getUserFeatureCodes(req, res),
      ),
    });
  } catch (err) {
    next(err);
  }
}

export async function UpdateMeController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const activity = startActivity(req);

  try {
    if (!req.user)
      throw Unauthorized("You are not logged in, please log in first");

    const user = await userModel.findById(req.user.id);
    if (!user) throw NotFound("User not found");

    const employee = await employeeModel.findByUserId(user.id);

    if (!employee) {
      throw BadRequest(
        "Your account is not linked to an employee record yet, please contact an admin first",
      );
    }

    const { updated_at: expectedUpdatedAt, ...changes } =
      req.body as employeeModel.UpdateOwnProfileInput & {
        updated_at?: string;
      };

    if (changes.phone) {
      const usedPhone = await employeeModel.findByPhone(
        changes.phone,
        employee.id,
      );

      if (usedPhone) throw Conflict("Phone number is already registered");
    }

    const updated = await employeeModel.updateOwnProfile(
      employee.id,
      changes,
      expectedUpdatedAt,
    );

    if (!updated) {
      throw await rejectStaleUpdate(
        "employee",
        () => employeeModel.findById(employee.id),
        "Employee not found",
      );
    }

    const detail = await employeeModel.findDetailById(updated.id);

    activity.success({
      action: "profile.update",
      entity: "employee",
      entity_id: employee.id,
      actor_name: updated.full_name,
      summary: `${updated.full_name} updated their own profile`,
      metadata: { fields: Object.keys(changes) },
    });

    res.json({
      success: true,
      message: "Profile updated successfully",
      data: buildProfile(
        user,
        updated,
        detail,
        await getUserFeatureCodes(req, res),
      ),
    });
  } catch (err) {
    next(err);
  }
}

// Mencabut token yang dipakai request ini sampai waktu kedaluwarsanya.
// Token lain milik pengguna yang sama, misalnya di perangkat lain, tetap
// berlaku. Untuk keluar dari semua perangkat sekaligus, ganti password
export async function LogoutController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const activity = startActivity(req);

  try {
    if (!req.user)
      throw Unauthorized("You are not logged in, please log in first");

    const revoked = await revokeToken(req.user);

    activity.success({
      action: "auth.logout",
      entity: "user",
      entity_id: req.user.id,
      summary: `${req.user.email} logged out`,
      // token lama tanpa jti tidak dapat dicabut satu per satu, tapi tetap
      // kedaluwarsa dengan sendirinya
      metadata: { token_revoked: revoked },
    });

    res.json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    next(err);
  }
}

export async function ChangePasswordController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const activity = startActivity(req);

  try {
    if (!req.user)
      throw Unauthorized("You are not logged in, please log in first");

    const { current_password, new_password } = req.body;

    const user = await userModel.findByEmail(req.user.email);
    if (!user) throw NotFound("User not found");

    const valid = await verifyPassword(user.password, current_password);

    if (!valid) {
      activity.failed({
        action: "auth.change_password",
        entity: "user",
        entity_id: user.id,
        summary: `Password change rejected for ${user.email}`,
        metadata: { reason: "wrong_current_password" },
      });

      throw Unauthorized("Current password is incorrect");
    }

    const hashed = await hashPassword(new_password);
    await userModel.updatePassword(user.id, hashed);
    // token lama langsung ditolak, tanpa menunggu cache sesi kedaluwarsa
    await forgetSession(user.id);

    activity.success({
      action: "auth.change_password",
      entity: "user",
      entity_id: user.id,
      summary: `${user.email} changed their own password`,
    });

    res.json({
      success: true,
      message: "Password changed successfully. Please log in again.",
    });
  } catch (err) {
    next(err);
  }
}
