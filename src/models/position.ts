import { pool } from "../config/databaseConnection.js";

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

export async function findAll(): Promise<Position[]> {
  const result = await pool.query<Position>(
    "SELECT * FROM positions WHERE deleted_at IS NULL ORDER BY level ASC, name ASC",
  );
  return result.rows;
}

export async function findById(id: string): Promise<Position | null> {
  const result = await pool.query<Position>(
    "SELECT * FROM positions WHERE id = $1 AND deleted_at IS NULL",
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
     VALUES ($1, $2, COALESCE($3, 1))
     RETURNING *`,
    [data.code, data.name, data.level ?? null],
  );

  const position = result.rows[0];
  if (!position) {
    throw new Error("Gagal menyimpan jabatan");
  }

  return position;
}

export async function updatePosition(
  id: string,
  data: Partial<PositionInput>,
): Promise<Position | null> {
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    values.push(value);
    fields.push(`${key} = $${values.length}`);
  }

  if (fields.length === 0) {
    return findById(id);
  }

  fields.push("updated_at = now()");
  values.push(id);

  const result = await pool.query<Position>(
    `UPDATE positions
     SET ${fields.join(", ")}
     WHERE id = $${values.length} AND deleted_at IS NULL
     RETURNING *`,
    values,
  );

  return result.rows[0] ?? null;
}

export async function softDeletePosition(id: string): Promise<Position | null> {
  const result = await pool.query<Position>(
    `UPDATE positions
     SET deleted_at = now(), is_active = false, updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id],
  );

  return result.rows[0] ?? null;
}

export async function countEmployees(id: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    "SELECT COUNT(*) FROM employees WHERE position_id = $1 AND deleted_at IS NULL",
    [id],
  );
  return Number(result.rows[0]?.count ?? 0);
}
