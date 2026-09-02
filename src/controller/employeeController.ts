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
import {
  createEmployeeSchema,
  MAX_EMPLOYEES_PER_REQUEST,
} from "../schema/employeeSchema.js";
import {
  recordActivity,
  requestContext,
  summarizeList,
  type RequestContext,
  startActivity,
} from "../helpers/activityLog.js";
import { photoUrlFor } from "../helpers/storage.js";
import {
  AppError,
  BadRequest,
  NotFound,
  Conflict,
  Unauthorized,
} from "../helpers/appError.js";

// Satu masalah pada satu kolom
interface FieldError {
  field: string;
  message: string;
}

// Memeriksa departemen, jabatan, dan manajer. Mengembalikan daftar masalah
// beserta kolomnya, bukan melempar, agar bisa dilaporkan per baris
async function checkRelations(
  data: Partial<CreateEmployeeInput>,
  currentId?: string,
): Promise<FieldError[]> {
  const errors: FieldError[] = [];

  if (data.department_id) {
    const dept = await departmentModel.findById(data.department_id);
    if (!dept) {
      errors.push({
        field: "department_id",
        message: "Departemen tidak ditemukan",
      });
    }
  }

  if (data.position_id) {
    const pos = await positionModel.findById(data.position_id);
    if (!pos) {
      errors.push({ field: "position_id", message: "Jabatan tidak ditemukan" });
    }
  }

  if (data.manager_id) {
    if (currentId && data.manager_id === currentId) {
      errors.push({
        field: "manager_id",
        message: "Karyawan tidak bisa menjadi manajer dirinya sendiri",
      });
    } else {
      const manager = await employeeModel.findById(data.manager_id);

      if (!manager) {
        errors.push({
          field: "manager_id",
          message: "Manajer tidak ditemukan",
        });
      } else if (currentId) {
        const isCycle = await employeeModel.isDescendantOf(
          data.manager_id,
          currentId,
        );

        if (isCycle) {
          errors.push({
            field: "manager_id",
            message:
              "Manajer yang dipilih merupakan bawahan dari karyawan ini, sehingga akan membentuk struktur melingkar",
          });
        }
      }
    }
  }

  return errors;
}

// Pembungkus untuk jalur yang cukup berhenti di masalah pertama
async function assertRelationsExist(
  data: Partial<CreateEmployeeInput>,
  currentId?: string,
) {
  const errors = await checkRelations(data, currentId);

  if (errors[0]) throw BadRequest(errors[0].message);
}

function withPhotoUrl<T extends { photo_path: string | null }>(row: T) {
  return { ...row, photo_url: photoUrlFor(row.photo_path) };
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
      data: rows.map(withPhotoUrl),
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

    res.json({ success: true, data: withPhotoUrl(employee) });
  } catch (err) {
    next(err);
  }
}

// Data satu karyawan beserta akunnya
type NewEmployee = CreateEmployeeInput & {
  email: string;
  password: string;
  role?: UserRole;
};

// Satu baris yang gagal, lengkap dengan kolom mana saja yang bermasalah
interface FailedRow {
  index: number;
  email: string;
  message: string;
  errors: FieldError[];
  // dipakai untuk menjawab 409 kalau kirimannya satu karyawan
  isDuplicate: boolean;
}

function toFailedRow(
  index: number,
  email: string,
  errors: FieldError[],
  isDuplicate = false,
): FailedRow {
  return {
    index,
    email,
    message: errors.map((e) => e.message).join("; "),
    errors,
    isDuplicate,
  };
}

// Mengubah galat zod jadi daftar kolom bermasalah
function fieldErrorsFromZod(error: ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  }));
}

// Ambil email buat penanda baris, walau barisnya sendiri belum tentu valid
function readEmail(row: unknown): string {
  const value = (row as { email?: unknown } | null)?.email;

  return typeof value === "string" ? value : "";
}

// Memeriksa isi satu baris terhadap data yang sudah ada di database
async function checkRowAgainstDatabase(
  row: NewEmployee,
  index: number,
  seenEmails: Map<string, number>,
  takenEmails: Set<string>,
  relationCache: Map<string, Promise<FieldError[]>>,
): Promise<FieldError[]> {
  const twinIndex = seenEmails.get(row.email);
  if (twinIndex !== undefined) {
    return [
      {
        field: "email",
        message: `Email sama dengan baris ke-${twinIndex + 1} pada permintaan ini`,
      },
    ];
  }
  seenEmails.set(row.email, index);

  if (takenEmails.has(row.email)) {
    return [{ field: "email", message: "Email sudah terdaftar" }];
  }

  // Satu CSV biasanya menunjuk departemen dan jabatan yang itu-itu saja,
  // jadi hasil pemeriksaannya dipakai ulang antar baris
  const key = [row.department_id, row.position_id, row.manager_id].join("|");

  const cached = relationCache.get(key);
  if (cached) return cached;

  const pending = checkRelations(row);
  relationCache.set(key, pending);

  return pending;
}

// Kiriman berbentuk objek berkunci nomor, misalnya { "0": {...}, "1": {...} }.
// Dibedakan dari satu karyawan karena seluruh kuncinya berupa angka
function isIndexedObject(payload: unknown): payload is Record<string, unknown> {
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    return false;
  }

  const keys = Object.keys(payload);

  return keys.length > 0 && keys.every((key) => /^\d+$/.test(key));
}

// Diurutkan sendiri karena JavaScript hanya mengurutkan kunci bilangan bulat.
// Kunci wajib 0 sampai n-1: lubang berarti ada baris hilang saat JSON diurai
function indexedObjectToRows(payload: Record<string, unknown>): unknown[] {
  const entries = Object.entries(payload)
    .map(([key, value]) => ({ key: Number(key), value }))
    .sort((a, b) => a.key - b.key);

  const missing: number[] = [];
  const seen = new Set<number>();

  for (const [position, entry] of entries.entries()) {
    if (seen.has(entry.key)) {
      throw BadRequest(
        `Kunci ${entry.key} muncul lebih dari sekali pada kiriman`,
      );
    }
    seen.add(entry.key);

    if (entry.key !== position) missing.push(position);
  }

  if (missing.length > 0) {
    const diterima = entries.map((entry) => entry.key);

    throw BadRequest(
      `Kunci karyawan harus berurutan dari 0 sampai ${entries.length - 1} tanpa ada yang terlewat. Yang hilang: ${missing.join(", ")}. Yang diterima: ${diterima.join(", ")}`,
      { expected: entries.length, missing, received: diterima },
    );
  }

  return entries.map((entry) => entry.value);
}

// Menambah karyawan satu objek, array, atau objek berkunci nomor
export async function CreateEmployeeController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const client = await pool.connect();

  // Disimpan di luar try supaya blok catch bisa memakainya juga
  let logOccurredAt: Date | null = null;
  let logContext: RequestContext | null = null;

  try {
    if (!req.user)
      throw Unauthorized("Kamu belum login, silakan masuk terlebih dahulu");

    // Diambil di sini, bukan saat log ditulis, supaya yang tercatat adalah
    // kapan permintaannya mulai diproses
    const occurredAt = new Date();
    const context = requestContext(req);

    logOccurredAt = occurredAt;
    logContext = context;

    // Cek bentuk kiriman array atau objek kalo berkunci nomor berarti banyak,
    // objek biasa itu berarti satu karyawan
    const payload = req.body as unknown;
    const indexed = isIndexedObject(payload);
    const isMany = Array.isArray(payload) || indexed;

    const rawRows: unknown[] = indexed
      ? indexedObjectToRows(payload)
      : Array.isArray(payload)
        ? payload
        : [payload];

    if (rawRows.length > MAX_EMPLOYEES_PER_REQUEST) {
      throw BadRequest(
        `Maksimal ${MAX_EMPLOYEES_PER_REQUEST} karyawan dalam satu permintaan`,
      );
    }

    const failed: FailedRow[] = [];
    const rows: NewEmployee[] = [];

    // Tahap 1: cek bentuk tiap baris, yaitu kolom kosong dan data tidak sesuai
    for (const [index, row] of rawRows.entries()) {
      const parsed = createEmployeeSchema.safeParse(row);

      if (parsed.success) {
        rows.push(parsed.data as NewEmployee);
        continue;
      }

      // Kiriman satu objek dilempar apa adanya biar jawabannya tetap
      // VALIDATION_ERROR seperti sebelumnya
      if (!isMany) throw parsed.error;

      failed.push(
        toFailedRow(index, readEmail(row), fieldErrorsFromZod(parsed.error)),
      );
    }

    // Tahap 2: cek isinya ke database, cuma untuk baris yang bentuknya benar.
    // Semua email dicek sekali jalan, bukan satu query per baris
    const takenEmails = new Set(
      await userModel.findExistingEmails(rows.map((row) => row.email)),
    );
    const relationCache = new Map<string, Promise<FieldError[]>>();
    const seenEmails = new Map<string, number>();
    let validIndex = 0;

    for (const [index, row] of rawRows.entries()) {
      if (failed.some((g) => g.index === index)) continue;

      const data = rows[validIndex]!;
      validIndex += 1;

      const errors = await checkRowAgainstDatabase(
        data,
        index,
        seenEmails,
        takenEmails,
        relationCache,
      );

      if (errors.length > 0) {
        const isDuplicate = errors.some((g) => g.field === "email");
        failed.push(toFailedRow(index, data.email, errors, isDuplicate));
      }
    }

    if (failed.length > 0) {
      failed.sort((a, b) => a.index - b.index);

      const first = failed[0]!;

      // Kiriman satu objek tidak punya daftar baris untuk dilaporkan,
      if (!isMany) {
        // catat penolakan pada kiriman satu objek
        recordActivity({
          action: "employee.create",
          status: "failed",
          context,
          entity: "employee",
          summary: `Penambahan karyawan ditolak: ${first.message}`,
          occurred_at: occurredAt,
          metadata: {
            email: first.email,
            fields: first.errors.map((e) => e.field),
          },
        });

        throw first.isDuplicate
          ? Conflict(first.message)
          : BadRequest(first.message);
      }

      // catat penolakan validasi pada kiriman banyak
      recordActivity({
        action: isMany ? "employee.create_bulk" : "employee.create",
        status: "failed",
        context,
        entity: "employee",
        summary: `Penambahan karyawan ditolak, ${failed.length} dari ${rawRows.length} baris bermasalah`,
        occurred_at: occurredAt,
        metadata: {
          total: rawRows.length,
          valid: rawRows.length - failed.length,
          invalid: failed.length,
          // password tidak pernah ikut dicatat
          failed_rows: summarizeList(
            failed.map((row) => ({
              index: row.index,
              email: row.email,
              fields: row.errors.map((e) => e.field),
            })),
          ),
        },
      });

      // Semua baris gagal di laporkan sekaligus dan tidak ada yang disimpan
      throw BadRequest(
        `${failed.length} dari ${rawRows.length} baris tidak dapat diproses, tidak ada karyawan yang ditambahkan`,
        {
          total: rawRows.length,
          valid: rawRows.length - failed.length,
          invalid: failed.length,
          failed_rows: failed.map(
            ({ isDuplicate: _isDuplicate, ...row }) => row,
          ),
        },
      );
    }

    // Sebelum transaksi dibuka karena argon2 lambat. Password yang sama cukup
    // dihitung sekali, dan impor massal biasanya memakai satu password awal
    const hashCache = new Map<string, Promise<string>>();
    const hashed = await Promise.all(
      rows.map((row) => {
        const cached = hashCache.get(row.password);
        if (cached) return cached;

        const pending = hashPassword(row.password);
        hashCache.set(row.password, pending);

        return pending;
      }),
    );

    await client.query("BEGIN");

    // Satu query untuk semua akun, satu lagi untuk semua karyawan. Kalau
    // ditulis satu per satu, 250 baris jadi 500 perjalanan ke database
    const accounts = await userModel.insertUsersByAdmin(
      client,
      rows.map((row, index) => ({
        email: row.email,
        password: hashed[index]!,
        role: row.role ?? "employee",
      })),
      req.user.id,
    );

    // Jumlah akun wajib sama dengan jumlah baris, kalau tidak ada karyawan yang
    // akan tersimpan tanpa akun
    if (accounts.length !== rows.length) {
      throw new Error(
        `Jumlah akun yang dibuat (${accounts.length}) tidak cocok dengan jumlah karyawan (${rows.length})`,
      );
    }

    const employees = await employeeModel.createEmployees(
      client,
      rows.map((row, index) => {
        const {
          email: _email,
          password: _password,
          role: _role,
          ...data
        } = row;

        return { user_id: accounts[index]!.id, data };
      }),
    );

    await client.query("COMMIT");

    const created = employees.map((employee, index) => ({
      // index disertakan supaya frontend dapat mencocokkan tiap hasil kembali
      // ke nomor kiriman tanpa mengandalkan urutan
      index,
      employee,
      account: {
        id: accounts[index]!.id,
        email: accounts[index]!.email,
        role: accounts[index]!.role,
        must_change_password: accounts[index]!.must_change_password,
      },
    }));

    const message = isMany
      ? `${created.length} karyawan berhasil ditambahkan. Sampaikan password awal kepada masing-masing karyawan dan minta menggantinya saat login pertama.`
      : "Karyawan berhasil ditambahkan. Sampaikan password awal kepada karyawan dan minta menggantinya saat login pertama.";

    // dicatat setelah COMMIT, jadi tidak pernah menyatakan berhasil lebih awal
    recordActivity({
      action: isMany ? "employee.create_bulk" : "employee.create",
      status: "success",
      context,
      entity: "employee",
      entity_id: isMany ? null : (created[0]?.employee.id ?? null),
      summary: isMany
        ? `${created.length} karyawan ditambahkan`
        : `Karyawan ${created[0]?.employee.full_name ?? ""} ditambahkan`,
      occurred_at: occurredAt,
      metadata: {
        created: created.length,
        // password dan hash-nya tidak pernah ikut dicatat
        employees: summarizeList(
          created.map((entry) => ({
            id: entry.employee.id,
            employee_number: entry.employee.employee_number,
            full_name: entry.employee.full_name,
            email: entry.account.email,
            role: entry.account.role,
          })),
        ),
      },
    });

    // Bentuk respons mengikuti bentuk kiriman
    res.status(201).json({
      success: true,
      message: message,
      data: isMany ? created : created[0],
      ...(isMany ? { meta: { created: created.length } } : {}),
    });
  } catch (err) {
    await client.query("ROLLBACK");

    // AppError sudah punya catatannya sendiri di atas. Yang ditangkap di sini
    // kegagalan tak terduga, dan justru itu yang paling perlu tercatat
    if (!(err instanceof AppError)) {
      recordActivity({
        action: "employee.create",
        status: "failed",
        context: logContext ?? requestContext(req),
        entity: "employee",
        summary: "Penambahan karyawan gagal karena galat tak terduga",
        occurred_at: logOccurredAt ?? new Date(),
        metadata: {
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }

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
    const activity = startActivity(req);
    const { id } = res.locals.params as { id: string };
    const data = req.body as UpdateEmployeeInput;

    const existing = await employeeModel.findById(id);
    if (!existing) throw NotFound("Karyawan tidak ditemukan");

    await assertRelationsExist(data, id);

    const employee = await employeeModel.updateEmployee(id, data);

    activity.success({
      action: "employee.update",
      entity: "employee",
      entity_id: id,
      summary: `Data karyawan ${existing.full_name} diubah`,
      metadata: { fields: Object.keys(data) },
    });

    res.json({ success: true, data: employee });
  } catch (err) {
    next(err);
  }
}

export async function DeleteEmployeeController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const client = await pool.connect();

  try {
    const activity = startActivity(req);
    const { id } = res.locals.params as { id: string };

    const existing = await employeeModel.findById(id);
    if (!existing) throw NotFound("Karyawan tidak ditemukan");

    const subordinates = await employeeModel.findSubordinates(id);

    if (subordinates.length > 0) {
      throw BadRequest(
        `Karyawan tidak dapat dihapus karena masih menjadi manajer dari ${subordinates.length} karyawan. Pindahkan mereka ke manajer lain terlebih dahulu.`,
        { subordinates: subordinates },
      );
    }

    await client.query("BEGIN");

    await employeeModel.softDeleteEmployee(client, id);

    if (existing.user_id) {
      await userModel.softDeleteUser(client, existing.user_id);
    }

    await client.query("COMMIT");

    activity.success({
      action: "employee.delete",
      entity: "employee",
      entity_id: id,
      summary: `Karyawan ${existing.full_name} dihapus`,
      metadata: { employee_number: existing.employee_number },
    });

    res.json({ success: true, message: "Karyawan berhasil dihapus" });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
}
