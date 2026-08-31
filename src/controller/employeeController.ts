import type pg from "pg";
import type { Request, Response, NextFunction } from "express";
import { pool } from "../config/databaseConnection.js";
import * as employeeModel from "../models/employee.js";
import * as userModel from "../models/user.js";
import * as departmentModel from "../models/department.js";
import * as positionModel from "../models/position.js";
import type {
  ListParams,
  CreateEmployeeInput,
  UpdateEmployeeInput,
} from "../models/employee.js";
import type { UserRole } from "../models/user.js";
import type { ZodError } from "zod";
import { hashPassword } from "../helpers/password.js";
import { createEmployeeSchema } from "../schema/employeeSchema.js";
import { photoUrlFor } from "../helpers/storage.js";
import {
  AppError,
  BadRequest,
  NotFound,
  Conflict,
  Unauthorized,
} from "../helpers/appError.js";

// Satu masalah pada satu kolom
interface GalatKolom {
  field: string;
  message: string;
}

// Memeriksa departemen, jabatan, dan manajer. Mengembalikan daftar masalah
// beserta kolomnya, bukan melempar, agar bisa dilaporkan per baris
async function periksaRelasi(
  data: Partial<CreateEmployeeInput>,
  currentId?: string,
): Promise<GalatKolom[]> {
  const galat: GalatKolom[] = [];

  if (data.department_id) {
    const dept = await departmentModel.findById(data.department_id);
    if (!dept) {
      galat.push({
        field: "department_id",
        message: "Departemen tidak ditemukan",
      });
    }
  }

  if (data.position_id) {
    const pos = await positionModel.findById(data.position_id);
    if (!pos) {
      galat.push({ field: "position_id", message: "Jabatan tidak ditemukan" });
    }
  }

  if (data.manager_id) {
    if (currentId && data.manager_id === currentId) {
      galat.push({
        field: "manager_id",
        message: "Karyawan tidak bisa menjadi manajer dirinya sendiri",
      });
    } else {
      const manager = await employeeModel.findById(data.manager_id);

      if (!manager) {
        galat.push({ field: "manager_id", message: "Manajer tidak ditemukan" });
      } else if (currentId) {
        const siklus = await employeeModel.isDescendantOf(
          data.manager_id,
          currentId,
        );

        if (siklus) {
          galat.push({
            field: "manager_id",
            message:
              "Manajer yang dipilih merupakan bawahan dari karyawan ini, sehingga akan membentuk struktur melingkar",
          });
        }
      }
    }
  }

  return galat;
}

// Pembungkus untuk jalur yang cukup berhenti di masalah pertama
async function validasiRelasi(
  data: Partial<CreateEmployeeInput>,
  currentId?: string,
) {
  const galat = await periksaRelasi(data, currentId);

  if (galat[0]) throw BadRequest(galat[0].message);
}

function denganFotoUrl<T extends { photo_path: string | null }>(baris: T) {
  return { ...baris, photo_url: photoUrlFor(baris.photo_path) };
}

export async function ListEmployeeController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const query = res.locals.query as ListParams;
    const { rows, total } = await employeeModel.listEmployees(query);

    res.json({
      success: true,
      data: rows.map(denganFotoUrl),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        total_pages: Math.ceil(total / query.limit),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function DetailEmployeeController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = res.locals.params as { id: string };

    const employee = await employeeModel.findDetailById(id);
    if (!employee) throw NotFound("Karyawan tidak ditemukan");

    res.json({ success: true, data: denganFotoUrl(employee) });
  } catch (err) {
    next(err);
  }
}

// Data satu karyawan beserta akunnya
type KaryawanBaru = CreateEmployeeInput & {
  email: string;
  password: string;
  role?: UserRole;
};

// Satu baris yang gagal, lengkap dengan kolom mana saja yang bermasalah
interface BarisGagal {
  index: number;
  email: string;
  message: string;
  errors: GalatKolom[];
  // dipakai untuk menjawab 409 kalau kirimannya satu karyawan
  duplikat: boolean;
}

function jadikanBarisGagal(
  index: number,
  email: string,
  errors: GalatKolom[],
  duplikat = false,
): BarisGagal {
  return {
    index,
    email,
    message: errors.map((e) => e.message).join("; "),
    errors,
    duplikat,
  };
}

// Mengubah galat zod jadi daftar kolom bermasalah
function galatDariZod(error: ZodError): GalatKolom[] {
  return error.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  }));
}

// Ambil email buat penanda baris, walau barisnya sendiri belum tentu valid
function ambilEmail(baris: unknown): string {
  const nilai = (baris as { email?: unknown } | null)?.email;

  return typeof nilai === "string" ? nilai : "";
}

// Memeriksa isi satu baris terhadap data yang sudah ada di database
async function periksaIsiBaris(
  baris: KaryawanBaru,
  index: number,
  emailSebelumnya: Map<string, number>,
  emailTerpakai: Set<string>,
  cacheRelasi: Map<string, Promise<GalatKolom[]>>,
): Promise<GalatKolom[]> {
  const kembar = emailSebelumnya.get(baris.email);
  if (kembar !== undefined) {
    return [
      {
        field: "email",
        message: `Email sama dengan baris ke-${kembar + 1} pada permintaan ini`,
      },
    ];
  }
  emailSebelumnya.set(baris.email, index);

  if (emailTerpakai.has(baris.email)) {
    return [{ field: "email", message: "Email sudah terdaftar" }];
  }

  // Satu CSV biasanya menunjuk departemen dan jabatan yang itu-itu saja,
  // jadi hasil pemeriksaannya dipakai ulang antar baris
  const kunci = [baris.department_id, baris.position_id, baris.manager_id].join("|");

  const tersimpan = cacheRelasi.get(kunci);
  if (tersimpan) return tersimpan;

  const proses = periksaRelasi(baris);
  cacheRelasi.set(kunci, proses);

  return proses;
}

// Menambah karyawan satu objek atau banyak dalam array lewat satu endpoint
export async function CreateEmployeeController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const client = await pool.connect();

  try {
    if (!req.user)
      throw Unauthorized("Kamu belum login, silakan masuk terlebih dahulu");

    // Cek dulu bentuk kiriman array berarti itu banyak kalo objek berarti satu
    const kiriman = req.body as unknown;
    const banyak = Array.isArray(kiriman);
    const mentah: unknown[] = banyak ? kiriman : [kiriman];

    const gagal: BarisGagal[] = [];
    const daftar: KaryawanBaru[] = [];

    // Tahap 1: cek bentuk tiap baris, yaitu kolom kosong dan data tidak sesuai
    for (const [index, baris] of mentah.entries()) {
      const hasil = createEmployeeSchema.safeParse(baris);

      if (hasil.success) {
        daftar.push(hasil.data as KaryawanBaru);
        continue;
      }

      // Kiriman satu objek dilempar apa adanya biar jawabannya tetap
      // VALIDATION_ERROR seperti sebelumnya
      if (!banyak) throw hasil.error;

      gagal.push(jadikanBarisGagal(index, ambilEmail(baris), galatDariZod(hasil.error)));
    }

    // Tahap 2: cek isinya ke database, cuma untuk baris yang bentuknya benar.
    // Semua email dicek sekali jalan, bukan satu query per baris
    const emailTerpakai = new Set(
      await userModel.findExistingEmails(daftar.map((baris) => baris.email)),
    );
    const cacheRelasi = new Map<string, Promise<GalatKolom[]>>();
    const emailSebelumnya = new Map<string, number>();
    let urutanValid = 0;

    for (const [index, baris] of mentah.entries()) {
      if (gagal.some((g) => g.index === index)) continue;

      const data = daftar[urutanValid]!;
      urutanValid += 1;

      const galat = await periksaIsiBaris(
        data,
        index,
        emailSebelumnya,
        emailTerpakai,
        cacheRelasi,
      );

      if (galat.length > 0) {
        const duplikat = galat.some((g) => g.field === "email");
        gagal.push(jadikanBarisGagal(index, data.email, galat, duplikat));
      }
    }

    if (gagal.length > 0) {
      gagal.sort((a, b) => a.index - b.index);

      const pertama = gagal[0]!;

      // Kiriman satu objek tidak punya daftar baris untuk dilaporkan,
      if (!banyak) {
        throw pertama.duplikat
          ? Conflict(pertama.message)
          : BadRequest(pertama.message);
      }

      // Semua baris gagal di laporkan sekaligus dan tidak ada yang disimpan
      throw BadRequest(
        `${gagal.length} dari ${mentah.length} baris tidak dapat diproses, tidak ada karyawan yang ditambahkan`,
        {
          total: mentah.length,
          valid: mentah.length - gagal.length,
          invalid: gagal.length,
          failed_rows: gagal.map(({ duplikat: _duplikat, ...baris }) => baris),
        },
      );
    }

    // Hashing di kerjakan sebelum transaksi dibuka karena argon2 lambat.
    // Password yang sama cukup dihitung sekali, dan impor massal hampir
    // selalu pakai satu password awal untuk semua orang
    const cacheHash = new Map<string, Promise<string>>();
    const hashed = await Promise.all(
      daftar.map((baris) => {
        const tersimpan = cacheHash.get(baris.password);
        if (tersimpan) return tersimpan;

        const proses = hashPassword(baris.password);
        cacheHash.set(baris.password, proses);

        return proses;
      }),
    );

    await client.query("BEGIN");

    // Satu query untuk semua akun, satu lagi untuk semua karyawan. Kalau
    // ditulis satu per satu, 250 baris jadi 500 perjalanan ke database
    const akun = await userModel.insertUsersByAdmin(
      client,
      daftar.map((baris, index) => ({
        email: baris.email,
        password: hashed[index]!,
        role: baris.role ?? "employee",
      })),
      req.user.id,
    );

    const karyawan = await employeeModel.createEmployees(
      client,
      daftar.map((baris, index) => {
        const { email: _email, password: _password, role: _role, ...data } = baris;

        return { user_id: akun[index]!.id, data };
      }),
    );

    await client.query("COMMIT");

    const dibuat = karyawan.map((employee, index) => ({
      employee,
      account: {
        id: akun[index]!.id,
        email: akun[index]!.email,
        role: akun[index]!.role,
        must_change_password: akun[index]!.must_change_password,
      },
    }));

    const pesan = banyak
      ? `${dibuat.length} karyawan berhasil ditambahkan. Sampaikan password awal kepada masing-masing karyawan dan minta menggantinya saat login pertama.`
      : "Karyawan berhasil ditambahkan. Sampaikan password awal kepada karyawan dan minta menggantinya saat login pertama.";

    // Bentuk respons mengikuti bentuk kiriman
    res.status(201).json({
      success: true,
      message: pesan,
      data: banyak ? dibuat : dibuat[0],
      ...(banyak ? { meta: { created: dibuat.length } } : {}),
    });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
}

export async function UpdateEmployeeController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = res.locals.params as { id: string };
    const data = req.body as UpdateEmployeeInput;

    const existing = await employeeModel.findById(id);
    if (!existing) throw NotFound("Karyawan tidak ditemukan");

    await validasiRelasi(data, id);

    const employee = await employeeModel.updateEmployee(id, data);

    res.json({ success: true, data: employee });
  } catch (err) {
    next(err);
  }
}

export async function DeleteEmployeeController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  const client = await pool.connect();

  try {
    const { id } = res.locals.params as { id: string };

    const existing = await employeeModel.findById(id);
    if (!existing) throw NotFound("Karyawan tidak ditemukan");

    const bawahan = await employeeModel.findSubordinates(id);

    if (bawahan.length > 0) {
      throw BadRequest(
        `Karyawan tidak dapat dihapus karena masih menjadi manajer dari ${bawahan.length} karyawan. Pindahkan mereka ke manajer lain terlebih dahulu.`,
        { subordinates: bawahan },
      );
    }

    await client.query("BEGIN");

    await employeeModel.softDeleteEmployee(client, id);

    if (existing.user_id) {
      await userModel.softDeleteUser(client, existing.user_id);
    }

    await client.query("COMMIT");

    res.json({ success: true, message: "Karyawan berhasil dihapus" });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
}
