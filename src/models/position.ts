import { pool } from "../config/databaseConnection.js";
import type { Executor } from "./user.js";
import { sameVersion } from "../helpers/concurrency.js";

export interface Position {
  id: string;
  code: string;
  name: string;
  level: number;
  is_active: boolean;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface PositionInput {
  code: string;
  name: string;
  level?: number;
  is_active?: boolean;
}

const UPDATABLE_COLUMNS = ["code", "name", "level", "is_active"] as const;

export async function findAll(): Promise<Position[]> {
  const result = await pool.query<Position>(
    "SELECT * FROM positions WHERE deleted_at IS NULL ORDER BY level ASC, name ASC",
  );
  return result.rows;
}

export async function findById(id: string): Promise<Position | null> {
  const result = await pool.query<Position>(
    "SELECT * FROM positions WHERE id = $1::uuid AND deleted_at IS NULL",
    [id],
  );
  return result.rows[0] ?? null;
}

export async function findByCode(code: string): Promise<Position | null> {
  const result = await pool.query<Position>(
    "SELECT * FROM positions WHERE code = $1 AND deleted_at IS NULL",
    [code],
  );
  return result.rows[0] ?? null;
}

export async function createPosition(data: PositionInput): Promise<Position> {
  const result = await pool.query<Position>(
    `INSERT INTO positions (code, name, level)
     VALUES ($1, $2, COALESCE($3::int, 1))
     RETURNING *`,
    [data.code, data.name, data.level ?? null],
  );

  const position = result.rows[0];
  if (!position) {
    throw new Error("Failed to save position");
  }

  return position;
}

export async function updatePosition(
  id: string,
  data: Partial<PositionInput>,
  expectedUpdatedAt?: string,
): Promise<Position | null> {
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
  const idParam = values.length;
  values.push(expectedUpdatedAt ?? null);

  const result = await pool.query<Position>(
    `UPDATE positions
     SET ${fields.join(", ")}
     WHERE id = $${idParam}::uuid AND deleted_at IS NULL
       AND ${sameVersion("updated_at", values.length)}
     RETURNING *`,
    values,
  );

  return result.rows[0] ?? null;
}

export async function softDeletePosition(id: string): Promise<Position | null> {
  const result = await pool.query<Position>(
    `UPDATE positions
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
     WHERE position_id = $1::uuid AND deleted_at IS NULL`,
    [id],
  );
  return Number(result.rows[0]?.count ?? 0);
}

// Menandai jabatan berubah saat daftar fiturnya diganti, sekaligus menjadi
// pemeriksaan versi halaman pengaturan fitur
export async function touchPosition(
  db: Executor,
  id: string,
  expectedUpdatedAt?: string,
): Promise<Position | null> {
  const result = await db.query<Position>(
    `UPDATE positions SET updated_at = now()
     WHERE id = $1::uuid AND deleted_at IS NULL
       AND ${sameVersion("updated_at", 2)}
     RETURNING *`,
    [id, expectedUpdatedAt ?? null],
  );

  return result.rows[0] ?? null;
}
