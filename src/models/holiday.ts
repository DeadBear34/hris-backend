import { pool } from "../config/databaseConnection.js";
import type { Executor } from "./user.js";

export interface Holiday {
  id: string;
  holiday_date: string;
  name: string;
  is_collective_leave: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface HolidayInput {
  holiday_date: string;
  name: string;
  is_collective_leave?: boolean;
}

export interface ListHolidayParams {
  year?: number;
  page: number;
  limit: number;
}

const UPDATABLE_COLUMNS = [
  "holiday_date",
  "name",
  "is_collective_leave",
] as const;

const COLUMN_CAST: Record<string, string> = {
  holiday_date: "::date",
};

const KOLOM = `id, holiday_date::text AS holiday_date, name,
  is_collective_leave, created_at, updated_at`;

export async function listHolidays(
  params: ListHolidayParams,
): Promise<{ rows: Holiday[]; total: number }> {
  const conditions: string[] = ["TRUE"];
  const values: unknown[] = [];

  if (params.year !== undefined) {
    values.push(params.year);
    conditions.push(
      `EXTRACT(YEAR FROM holiday_date) = $${values.length}::numeric`,
    );
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) FROM holidays ${where}`,
    values,
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  const offset = (params.page - 1) * params.limit;
  values.push(params.limit, offset);

  const dataResult = await pool.query<Holiday>(
    `SELECT ${KOLOM} FROM holidays ${where}
     ORDER BY holiday_date ASC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );

  return { rows: dataResult.rows, total };
}

export async function findDatesBetween(
  start: string,
  end: string,
): Promise<string[]> {
  const result = await pool.query<{ holiday_date: string }>(
    `SELECT holiday_date::text AS holiday_date FROM holidays
     WHERE holiday_date BETWEEN $1::date AND $2::date
     ORDER BY holiday_date ASC`,
    [start, end],
  );

  return result.rows.map((row) => row.holiday_date);
}

export async function findById(id: string): Promise<Holiday | null> {
  const result = await pool.query<Holiday>(
    `SELECT ${KOLOM} FROM holidays WHERE id = $1::uuid`,
    [id],
  );

  return result.rows[0] ?? null;
}

export async function findByDate(tanggal: string): Promise<Holiday | null> {
  const result = await pool.query<Holiday>(
    `SELECT ${KOLOM} FROM holidays WHERE holiday_date = $1::date`,
    [tanggal],
  );

  return result.rows[0] ?? null;
}

export async function createHoliday(
  data: HolidayInput,
  db: Executor = pool,
): Promise<Holiday> {
  const result = await db.query<Holiday>(
    `INSERT INTO holidays (holiday_date, name, is_collective_leave)
     VALUES ($1::date, $2, COALESCE($3::boolean, false))
     RETURNING ${KOLOM}`,
    [data.holiday_date, data.name, data.is_collective_leave ?? null],
  );

  const holiday = result.rows[0];
  if (!holiday) {
    throw new Error("Gagal menyimpan hari libur");
  }

  return holiday;
}

export async function updateHoliday(
  id: string,
  data: Partial<HolidayInput>,
): Promise<Holiday | null> {
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (!UPDATABLE_COLUMNS.includes(key as never)) continue;

    values.push(value);
    const cast = COLUMN_CAST[key] ?? "";
    fields.push(`${key} = $${values.length}${cast}`);
  }

  if (fields.length === 0) {
    return findById(id);
  }

  fields.push("updated_at = now()");
  values.push(id);

  const result = await pool.query<Holiday>(
    `UPDATE holidays SET ${fields.join(", ")}
     WHERE id = $${values.length}::uuid
     RETURNING ${KOLOM}`,
    values,
  );

  return result.rows[0] ?? null;
}

export async function deleteHoliday(id: string): Promise<Holiday | null> {
  const result = await pool.query<Holiday>(
    `DELETE FROM holidays WHERE id = $1::uuid RETURNING ${KOLOM}`,
    [id],
  );

  return result.rows[0] ?? null;
}
