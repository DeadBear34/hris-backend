import { pool } from "../config/databaseConnection.js";

export interface Department {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface DepartmentInput {
  code: string;
  name: string;
  is_active?: boolean;
}

const UPDATABLE_COLUMNS = ["code", "name", "is_active"] as const;

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

export async function createDepartment(
  data: DepartmentInput,
): Promise<Department> {
  const result = await pool.query<Department>(
    `INSERT INTO departments (code, name)
     VALUES ($1, $2)
     RETURNING *`,
    [data.code, data.name],
  );

  const department = result.rows[0];
  if (!department) {
    throw new Error("Gagal menyimpan departemen");
  }

  return department;
}

export async function updateDepartment(
  id: string,
  data: Partial<DepartmentInput>,
): Promise<Department | null> {
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (!UPDATABLE_COLUMNS.includes(key as never)) continue;

    values.push(value);
    fields.push(`${key} = $${values.length}`);
  }

  if (fields.length === 0) {
    return findById(id);
  }

  fields.push("updated_at = now()");
  values.push(id);

  const result = await pool.query<Department>(
    `UPDATE departments
     SET ${fields.join(", ")}
     WHERE id = $${values.length}::uuid AND deleted_at IS NULL
     RETURNING *`,
    values,
  );

  return result.rows[0] ?? null;
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

export async function countEmployees(id: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) FROM employees
     WHERE department_id = $1::uuid AND deleted_at IS NULL`,
    [id],
  );
  return Number(result.rows[0]?.count ?? 0);
}
