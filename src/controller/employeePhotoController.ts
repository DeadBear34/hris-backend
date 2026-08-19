import type { Request, Response, NextFunction } from "express";
import * as employeeModel from "../models/employee.js";
import type { Employee } from "../models/employee.js";
import { detectImageMimeType, MAX_FILE_SIZE } from "../helpers/fileType.js";
import { logger } from "../config/logger.js";
import {
  buildPhotoPath,
  deletePhoto,
  isStorageConfigured,
  photoUrlFor,
  uploadPhoto,
} from "../helpers/storage.js";
import {
  BadRequest,
  NotFound,
  Unauthorized,
} from "../helpers/appError.js";

async function karyawanSendiri(req: Request): Promise<Employee> {
  if (!req.user) {
    throw Unauthorized("Kamu belum login, silakan masuk terlebih dahulu");
  }

  const employee = await employeeModel.findByUserId(req.user.id);

  if (!employee) {
    throw BadRequest(
      "Akun kamu belum terhubung ke data karyawan, hubungi admin terlebih dahulu",
    );
  }

  return employee;
}

async function karyawanTujuan(id: string): Promise<Employee> {
  const employee = await employeeModel.findById(id);

  if (!employee) throw NotFound("Karyawan tidak ditemukan");

  return employee;
}

function pastikanPenyimpananSiap(): void {
  if (!isStorageConfigured()) {
    throw BadRequest(
      "Penyimpanan foto profil belum dikonfigurasi, hubungi administrator",
    );
  }
}

async function buangFotoLama(storagePath: string | null): Promise<void> {
  if (!storagePath) return;

  try {
    await deletePhoto(storagePath);
  } catch (err) {
    logger.warn(
      { err, storagePath },
      "Foto profil lama gagal dihapus dari penyimpanan",
    );
  }
}

async function gantiFoto(
  employee: Employee,
  berkas: Express.Multer.File | undefined,
) {
  pastikanPenyimpananSiap();

  if (!berkas) {
    throw BadRequest("Foto profil wajib diunggah pada field 'photo'");
  }

  if (berkas.size > MAX_FILE_SIZE) {
    throw BadRequest("Ukuran foto profil maksimal 5 MB");
  }

  const mime = detectImageMimeType(berkas.buffer);

  if (!mime) {
    throw BadRequest(
      "Foto profil harus berupa gambar JPEG, PNG, atau WebP yang sah",
    );
  }

  const storagePath = buildPhotoPath(employee.id, mime);

  await uploadPhoto(storagePath, berkas.buffer, mime);

  const diperbarui = await employeeModel.updatePhotoPath(
    employee.id,
    storagePath,
  );

  if (!diperbarui) {
    await buangFotoLama(storagePath);
    throw NotFound("Karyawan tidak ditemukan");
  }

  await buangFotoLama(employee.photo_path);

  return {
    employee_id: diperbarui.id,
    photo_path: diperbarui.photo_path,
    photo_url: photoUrlFor(diperbarui.photo_path),
  };
}

async function hapusFoto(employee: Employee) {
  if (!employee.photo_path) {
    throw BadRequest("Karyawan ini belum memiliki foto profil");
  }

  pastikanPenyimpananSiap();

  await employeeModel.updatePhotoPath(employee.id, null);
  await buangFotoLama(employee.photo_path);
}

export async function UploadOwnPhotoController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const employee = await karyawanSendiri(req);
    const data = await gantiFoto(employee, req.file);

    res.json({
      success: true,
      message: "Foto profil berhasil diperbarui",
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function DeleteOwnPhotoController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const employee = await karyawanSendiri(req);
    await hapusFoto(employee);

    res.json({ success: true, message: "Foto profil berhasil dihapus" });
  } catch (err) {
    next(err);
  }
}

export async function UploadEmployeePhotoController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = res.locals.params as { id: string };
    const employee = await karyawanTujuan(id);
    const data = await gantiFoto(employee, req.file);

    res.json({
      success: true,
      message: `Foto profil ${employee.full_name} berhasil diperbarui`,
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function DeleteEmployeePhotoController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = res.locals.params as { id: string };
    const employee = await karyawanTujuan(id);
    await hapusFoto(employee);

    res.json({
      success: true,
      message: `Foto profil ${employee.full_name} berhasil dihapus`,
    });
  } catch (err) {
    next(err);
  }
}
