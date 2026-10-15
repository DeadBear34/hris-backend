import { pool } from "../config/databaseConnection.js";
import { updateVersioned } from "./versionedUpdate.js";
import type { Executor } from "./user.js";

export interface Department {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  // Paling banyak berapa karyawan departemen ini yang boleh cuti pada hari
  // yang sama. Null berarti tanpa batas
  max_concurrent_leave: number | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface DepartmentInput {
  code: string;
  name: string;
  is_active?: boolean;
  max_concurrent_leave?: number | null;
}

const UPDATABLE_COLUMNS = [
  "code",
  "name",
  "is_active",
  "max_concurrent_leave",
] as const;

const COLUMN_CAST: Record<string, string> = {
  max_concurrent_leave: "::int",
};

export async function findAll(): Promise<Department[]> {
  const result = await pool.query<Department>(
    "SELECT * FROM departments WHERE deleted_at IS NULL ORDER BY name ASC",
  );
  return result.rows;
}

export async function findById(id: string): Promise<Department | null> {
  const result = await pool.query<Department>(
    "SELECT * FROM departments WHERE id = $1::uuid AND deleted_at IS NULL",
    [id],
  );
  return result.rows[0] ?? null;
}

export async function findByCode(code: string): Promise<Department | null> {
  const result = await pool.query<Department>(
    "SELECT * FROM departments WHERE code = $1 AND deleted_at IS NULL",
    [code],
  );
  return result.rows[0] ?? null;
}

// Dibandingkan tanpa membedakan huruf besar-kecil dan spasi di tepi, supaya
// "Engineering", "engineering", dan " Engineering " dianggap nama yang sama.
// exceptId dipakai saat mengubah, agar namanya sendiri tidak dianggap bentrok
export async function findByName(
  name: string,
  exceptId?: string,
): Promise<Department | null> {
  const result = await pool.query<Department>(
    `SELECT * FROM departments
     WHERE lower(btrim(name)) = lower(btrim($1))
       AND deleted_at IS NULL
       AND ($2::uuid IS NULL OR id <> $2::uuid)`,
    [name, exceptId ?? null],
  );

  return result.rows[0] ?? null;
}

export async function createDepartment(
  data: DepartmentInput,
): Promise<Department> {
  const result = await pool.query<Department>(
    `INSERT INTO departments (code, name, max_concurrent_leave)
     VALUES ($1, $2, $3::int)
     RETURNING *`,
    [data.code, data.name, data.max_concurrent_leave ?? null],
  );

  const department = result.rows[0];
  if (!department) {
    throw new Error("Failed to save department");
  }

  return department;
}

export async function updateDepartment(
  id: string,
  data: Partial<DepartmentInput>,
  expectedUpdatedAt?: string,
): Promise<Department | null> {
  return updateVersioned<Department>({
    table: "departments",
    id,
    data,
    columns: UPDATABLE_COLUMNS,
    casts: COLUMN_CAST,
    returning: "*",
    expectedUpdatedAt,
    current: () => findById(id),
  });
}

export async function softDeleteDepartment(
  id: string,
): Promise<Department | null> {
  const result = await pool.query<Department>(
    `UPDATE departments
     SET deleted_at = now(), is_active = false, updated_at = now()
     WHERE id = $1::uuid AND deleted_at IS NULL
     RETURNING *`,
    [id],
  );

  return result.rows[0] ?? null;
}

// Menyetujui cuti di departemen yang sama dilakukan bergiliran. Tanpa kunci
// ini dua penyetujuan bersamaan sama-sama membaca jumlah lama dan batasnya
// penanda untuk penguncian approval
export async function lockForLeaveApproval(
  db: Executor,
  id: string,
): Promise<void> {
  await db.query(`SELECT id FROM departments WHERE id = $1::uuid FOR UPDATE`, [
    id,
  ]);
}

export async function countEmployees(id: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) FROM employees
     WHERE department_id = $1::uuid AND deleted_at IS NULL`,
    [id],
  );
  return Number(result.rows[0]?.count ?? 0);
}
