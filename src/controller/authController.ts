import type { Request, Response, NextFunction } from "express";
import * as userModel from "../models/user.js";
import * as employeeModel from "../models/employee.js";
import { hashPassword, verifyPassword } from "../helpers/password.js";
import { createToken } from "../helpers/jwt.js";
import { ambilKodeFiturPengguna } from "../middlewares/feature.js";
import { Unauthorized, NotFound, BadRequest } from "../helpers/appError.js";

function susunProfil(
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

    if (!user.email_verified_at) {
      throw Unauthorized(
        "Email belum diverifikasi. Silakan masukkan kode verifikasi yang kami kirim ke email kamu.",
      );
    }

    if (!user.approved_at) {
      throw Unauthorized("Akun kamu masih menunggu persetujuan admin");
    }

    if (!user.is_active) {
      throw Unauthorized("Akun kamu dinonaktifkan, silakan hubungi admin");
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
      data: susunProfil(
        user,
        employee,
        detail,
        await ambilKodeFiturPengguna(req, res),
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

    const diperbarui = await employeeModel.updateOwnProfile(
      employee.id,
      req.body as employeeModel.UpdateOwnProfileInput,
    );

    const detail = diperbarui
      ? await employeeModel.findDetailById(diperbarui.id)
      : null;

    res.json({
      success: true,
      message: "Profil berhasil diperbarui",
      data: susunProfil(
        user,
        diperbarui ?? employee,
        detail,
        await ambilKodeFiturPengguna(req, res),
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
