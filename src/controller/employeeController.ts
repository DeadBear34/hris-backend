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
import { hashPassword } from "../helpers/password.js";
import { photoUrlFor } from "../helpers/storage.js";
import {
  AppError,
  BadRequest,
  NotFound,
  Conflict,
  Unauthorized,
} from "../helpers/appError.js";

async function validasiRelasi(
  data: Partial<CreateEmployeeInput>,
  currentId?: string,
) {
  if (data.department_id) {
    const dept = await departmentModel.findById(data.department_id);
    if (!dept) throw BadRequest("Departemen tidak ditemukan");
  }

  if (data.position_id) {
    const pos = await positionModel.findById(data.position_id);
    if (!pos) throw BadRequest("Jabatan tidak ditemukan");
  }

  if (data.manager_id) {
    if (currentId && data.manager_id === currentId) {
      throw BadRequest("Karyawan tidak bisa menjadi manajer dirinya sendiri");
    }

    const manager = await employeeModel.findById(data.manager_id);
    if (!manager) throw BadRequest("Manajer tidak ditemukan");

    if (currentId) {
      const siklus = await employeeModel.isDescendantOf(
        data.manager_id,
        currentId,
      );

      if (siklus) {
        throw BadRequest(
          "Manajer yang dipilih merupakan bawahan dari karyawan ini, sehingga akan membentuk struktur melingkar",
        );
      }
    }
  }
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

type KaryawanBaru = CreateEmployeeInput & {
  email: string;
  password: string;
  role?: UserRole;
};

interface BarisGagal {
  index: number;
  email: string;
  message: string;
  /** Email yang sudah dipakai dijawab 409 bila kirimannya satu karyawan. */
  duplikat: boolean;
}

async function periksaSatuBaris(
  baris: KaryawanBaru,
  index: number,
  emailSebelumnya: Map<string, number>,
): Promise<BarisGagal | null> {
  const gagal = (message: string, duplikat = false): BarisGagal => ({
    index,
    email: baris.email,
    message,
    duplikat,
  });

  const kembar = emailSebelumnya.get(baris.email);
  if (kembar !== undefined) {
    return gagal(
      `Email sama dengan baris ke-${kembar + 1} pada permintaan ini`,
      true,
    );
  }
  emailSebelumnya.set(baris.email, index);

  const terdaftar = await userModel.findByEmail(baris.email);
  if (terdaftar) return gagal("Email sudah terdaftar", true);

  try {
    await validasiRelasi(baris);
  } catch (err) {
    return gagal(err instanceof AppError ? err.message : "Data tidak valid");
  }

  return null;
}

async function simpanSatuKaryawan(
  client: pg.PoolClient,
  baris: KaryawanBaru,
  password: string,
  dibuatOleh: string,
) {
  const { email, password: _password, role, ...employeeData } = baris;

  const user = await userModel.insertUserByAdmin(
    client,
    email,
    password,
    role ?? "employee",
    dibuatOleh,
  );

  const employee = await employeeModel.createEmployee(
    client,
    user.id,
    employeeData,
  );

  return {
    employee,
    account: {
      id: user.id,
      email: user.email,
      role: user.role,
      must_change_password: user.must_change_password,
    },
  };
}

/**
 * Menambah satu karyawan atau banyak sekaligus lewat satu endpoint. Bentuknya
 * ditentukan dari kiriman: objek berarti satu, larik berarti banyak.
 *
 * Bentuk respons mengikuti bentuk kiriman, sehingga pemanggil yang mengirim
 * satu objek tetap menerima satu objek seperti sebelumnya.
 *
 * Seluruh baris diperiksa lebih dulu dan penyimpanan baru berjalan bila tidak
 * ada satu pun yang bermasalah. Keberhasilan sebagian sengaja tidak
 * disediakan, karena memaksa admin menebak baris mana yang sudah tersimpan
 * sebelum mencoba lagi.
 */
export async function CreateEmployeeController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const client = await pool.connect();

  try {
    if (!req.user)
      throw Unauthorized("Kamu belum login, silakan masuk terlebih dahulu");

    const kiriman = req.body as KaryawanBaru | KaryawanBaru[];
    const banyak = Array.isArray(kiriman);
    const daftar = banyak ? kiriman : [kiriman];

    const emailSebelumnya = new Map<string, number>();
    const gagal: BarisGagal[] = [];

    for (const [index, baris] of daftar.entries()) {
      const masalah = await periksaSatuBaris(baris, index, emailSebelumnya);
      if (masalah) gagal.push(masalah);
    }

    if (gagal.length > 0) {
      const pertama = gagal[0]!;

      if (!banyak) {
        throw pertama.duplikat
          ? Conflict(pertama.message)
          : BadRequest(pertama.message);
      }

      throw BadRequest(
        `${gagal.length} dari ${daftar.length} baris tidak dapat diproses, tidak ada karyawan yang ditambahkan`,
        {
          failed_rows: gagal.map(({ duplikat: _duplikat, ...baris }) => baris),
        },
      );
    }

    const hashed = await Promise.all(
      daftar.map((baris) => hashPassword(baris.password)),
    );

    await client.query("BEGIN");

    const dibuat = [];

    for (const [index, baris] of daftar.entries()) {
      dibuat.push(
        await simpanSatuKaryawan(client, baris, hashed[index]!, req.user.id),
      );
    }

    await client.query("COMMIT");

    const pesan = banyak
      ? `${dibuat.length} karyawan berhasil ditambahkan. Sampaikan password awal kepada masing-masing karyawan dan minta menggantinya saat login pertama.`
      : "Karyawan berhasil ditambahkan. Sampaikan password awal kepada karyawan dan minta menggantinya saat login pertama.";

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
