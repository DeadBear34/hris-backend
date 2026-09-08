import type { Request, Response, NextFunction } from "express";
import * as userModel from "../models/user.js";
import * as employeeModel from "../models/employee.js";
import { hashPassword, verifyPassword } from "../helpers/password.js";
import { createToken } from "../helpers/jwt.js";
import { getUserFeatureCodes } from "../middlewares/feature.js";
import { Unauthorized, NotFound, BadRequest } from "../helpers/appError.js";
import { photoUrlFor } from "../helpers/storage.js";
import { startActivity } from "../helpers/activityLog.js";

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
        summary: `Login gagal untuk ${email}`,
        metadata: { reason },
      });

      return Unauthorized(message);
    };

    const user = await userModel.findByEmail(email);

    if (!user) {
      throw reject("email_tidak_terdaftar", "Email atau password salah");
    }

    const valid = await verifyPassword(user.password, password);

    if (!valid) {
      throw reject("password_salah", "Email atau password salah", user.id);
    }

    if (!user.email_verified_at) {
      throw reject(
        "email_belum_diverifikasi",
        "Email belum diverifikasi. Silakan masukkan kode verifikasi yang kami kirim ke email kamu.",
        user.id,
      );
    }

    if (!user.approved_at) {
      throw reject(
        "belum_disetujui",
        "Akun kamu masih menunggu persetujuan admin",
        user.id,
      );
    }

    if (!user.is_active) {
      throw reject(
        "akun_nonaktif",
        "Akun kamu dinonaktifkan, silakan hubungi admin",
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
      summary: `${employee?.full_name ?? user.email} berhasil login`,
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
      throw Unauthorized("Kamu belum login, silakan masuk terlebih dahulu");
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
  try {
    if (!req.user)
      throw Unauthorized("Kamu belum login, silakan masuk terlebih dahulu");

    const user = await userModel.findById(req.user.id);
    if (!user) throw NotFound("User tidak ditemukan");

    const employee = await employeeModel.findByUserId(user.id);

    if (!employee) {
      throw BadRequest(
        "Akun kamu belum terhubung ke data karyawan, hubungi admin terlebih dahulu",
      );
    }

    const updated = await employeeModel.updateOwnProfile(
      employee.id,
      req.body as employeeModel.UpdateOwnProfileInput,
    );

    const detail = updated
      ? await employeeModel.findDetailById(updated.id)
      : null;

    res.json({
      success: true,
      message: "Profil berhasil diperbarui",
      data: buildProfile(
        user,
        updated ?? employee,
        detail,
        await getUserFeatureCodes(req, res),
      ),
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
    if (!req.user)
      throw Unauthorized("Kamu belum login, silakan masuk terlebih dahulu");

    const { current_password, new_password } = req.body;

    const user = await userModel.findByEmail(req.user.email);
    if (!user) throw NotFound("User tidak ditemukan");

    const valid = await verifyPassword(user.password, current_password);
    if (!valid) throw Unauthorized("Password saat ini salah");

    const hashed = await hashPassword(new_password);
    await userModel.updatePassword(user.id, hashed);

    res.json({
      success: true,
      message: "Password berhasil diubah. Silakan login kembali.",
    });
  } catch (err) {
    next(err);
  }
}
