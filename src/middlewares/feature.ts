import type { Request, Response, NextFunction } from "express";
import * as employeeModel from "../models/employee.js";
import * as featureModel from "../models/feature.js";
import type { Employee } from "../models/employee.js";
import { ambilDariCache, simpanKeCache } from "../helpers/featureCache.js";
import { Forbidden } from "../helpers/appError.js";

/**
 * Otorisasi berjalan tiga lapis dan urutannya menentukan:
 *
 * 1. Role admin melewati seluruh pemeriksaan fitur tanpa kecuali. Lapis ini
 *    yang mencegah sistem terkunci sendiri ketika pemberian fitur salah atur.
 * 2. Selain admin, kemampuan berasal dari fitur yang diberikan ke jabatannya
 *    lewat tabel position_features.
 * 3. Kemampuan atas diri sendiri, misalnya melihat profil dan mengajukan cuti,
 *    tidak melewati berkas ini sama sekali sehingga tidak dapat dicabut.
 *
 * Karyawan tanpa jabatan, dan akun yang belum terhubung ke data karyawan,
 * hanya memiliki kemampuan lapis ketiga.
 */

/**
 * Karyawan pemilik request. Hasilnya disimpan di res.locals agar beberapa
 * pemeriksaan fitur dalam satu request cukup sekali query ke tabel employees.
 *
 * Mengembalikan null alih-alih melempar error, karena ketiadaan data karyawan
 * adalah keadaan yang sah dan pemanggilnya yang menentukan artinya.
 */
async function ambilKaryawanRequest(
  req: Request,
  res: Response,
): Promise<Employee | null> {
  const tersimpan = res.locals.employee as Employee | undefined;
  if (tersimpan) return tersimpan;

  if (!req.user) return null;

  const employee = await employeeModel.findByUserId(req.user.id);
  if (!employee) return null;

  res.locals.employee = employee;

  return employee;
}

async function ambilKodeFiturJabatan(position_id: string): Promise<string[]> {
  const dariCache = ambilDariCache(position_id);
  if (dariCache) return dariCache;

  const codes = await featureModel.findCodesByPosition(position_id);
  simpanKeCache(position_id, codes);

  return codes;
}

/**
 * Daftar kode fitur milik pengguna yang sedang login. Admin memperoleh seluruh
 * kode yang ada, karena ia memang melewati setiap pemeriksaan.
 *
 * Pengguna tanpa jabatan memperoleh daftar kosong, bukan error, karena
 * pertanyaan "apa saja yang boleh saya lakukan" selalu punya jawaban sah.
 */
export async function ambilKodeFiturPengguna(
  req: Request,
  res: Response,
): Promise<string[]> {
  if (req.user?.role === "admin") {
    return featureModel.findAllCodes();
  }

  const employee = await ambilKaryawanRequest(req, res);

  if (!employee?.position_id) return [];

  return ambilKodeFiturJabatan(employee.position_id);
}

/**
 * Pemeriksaan fitur dari dalam controller, dipakai saat keputusan bergantung
 * pada kepemilikan fitur dan bukan sekadar boleh atau tidak masuk. Contohnya
 * membedakan leave.approve_team yang terbatas pada bawahan langsung dari
 * leave.approve_all yang berlaku untuk pengajuan siapa pun.
 */
export async function punyaFitur(
  req: Request,
  res: Response,
  code: string,
): Promise<boolean> {
  if (req.user?.role === "admin") return true;

  const employee = await ambilKaryawanRequest(req, res);

  if (!employee?.position_id) return false;

  const codes = await ambilKodeFiturJabatan(employee.position_id);

  return codes.includes(code);
}

/**
 * Middleware penjaga rute. Dipasang setelah authenticate karena bergantung
 * pada req.user.
 *
 * Penolakan memakai 403 dan bukan 400, karena penggunanya sudah terautentikasi
 * dan yang kurang adalah kewenangannya. Kode fitur yang dibutuhkan disertakan
 * pada details supaya frontend dapat menyusun pesan yang tepat.
 */
export function requireFeature(code: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.user?.role === "admin") return next();

      const employee = await ambilKaryawanRequest(req, res);

      if (!employee) {
        throw Forbidden(
          "Akun kamu belum terhubung ke data karyawan sehingga belum memiliki akses apa pun, hubungi admin",
          { required_feature: code },
        );
      }

      if (!employee.position_id) {
        throw Forbidden(
          "Jabatan kamu belum ditentukan sehingga belum ada fitur yang dapat diakses, hubungi admin",
          { required_feature: code },
        );
      }

      const codes = await ambilKodeFiturJabatan(employee.position_id);

      if (!codes.includes(code)) {
        throw Forbidden(
          "Jabatan kamu tidak memiliki akses ke fitur yang diminta",
          { required_feature: code },
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
