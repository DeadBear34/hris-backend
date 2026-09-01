import { pool } from "../config/databaseConnection.js";
import type { Executor } from "./user.js";

export type FeatureCategory =
  "employee" | "organization" | "leave" | "attendance" | "system";

export interface Feature {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: FeatureCategory;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface FeatureGrant {
  position_id: string;
  feature_id: string;
}

const COLUMNS = `id, code, name, description, category, is_active,
  created_at, updated_at`;

const FEATURE_COLUMNS = `f.id, f.code, f.name, f.description, f.category, f.is_active,
  f.created_at, f.updated_at`;

export async function findAllFeatures(): Promise<Feature[]> {
  const result = await pool.query<Feature>(
    `SELECT ${COLUMNS} FROM features
     WHERE is_active = true
     ORDER BY category ASC, code ASC`,
  );

  return result.rows;
}

export async function findByCodes(codes: string[]): Promise<Feature[]> {
  if (codes.length === 0) return [];

  const result = await pool.query<Feature>(
    `SELECT ${COLUMNS} FROM features
     WHERE code = ANY($1::text[]) AND is_active = true
     ORDER BY category ASC, code ASC`,
    [codes],
  );

  return result.rows;
}

export async function findAllCodes(): Promise<string[]> {
  const result = await pool.query<{ code: string }>(
    "SELECT code FROM features WHERE is_active = true ORDER BY code ASC",
  );

  return result.rows.map((row) => row.code);
}

export async function findCodesByPosition(
  position_id: string,
): Promise<string[]> {
  const result = await pool.query<{ code: string }>(
    `SELECT f.code
     FROM position_features pf
     JOIN features f ON f.id = pf.feature_id
     WHERE pf.position_id = $1::uuid AND f.is_active = true
     ORDER BY f.code ASC`,
    [position_id],
  );

  return result.rows.map((row) => row.code);
}

export async function findFeaturesByPosition(
  position_id: string,
): Promise<Feature[]> {
  const result = await pool.query<Feature>(
    `SELECT ${FEATURE_COLUMNS}
     FROM position_features pf
     JOIN features f ON f.id = pf.feature_id
     WHERE pf.position_id = $1::uuid AND f.is_active = true
     ORDER BY f.category ASC, f.code ASC`,
    [position_id],
  );

  return result.rows;
}

export async function findCodesByEmployee(
  employee_id: string,
): Promise<string[]> {
  const result = await pool.query<{ code: string }>(
    `SELECT f.code
     FROM employees e
     JOIN position_features pf ON pf.position_id = e.position_id
     JOIN features f ON f.id = pf.feature_id
     WHERE e.id = $1::uuid AND e.deleted_at IS NULL AND f.is_active = true
     ORDER BY f.code ASC`,
    [employee_id],
  );

  return result.rows.map((row) => row.code);
}

export async function findMatrix(): Promise<FeatureGrant[]> {
  const result = await pool.query<FeatureGrant>(
    `SELECT pf.position_id, pf.feature_id
     FROM position_features pf
     JOIN features f ON f.id = pf.feature_id
     WHERE f.is_active = true`,
  );

  return result.rows;
}

export async function replacePositionFeatures(
  db: Executor,
  position_id: string,
  feature_ids: string[],
  granted_by: string | null,
): Promise<number> {
  await db.query("DELETE FROM position_features WHERE position_id = $1::uuid", [
    position_id,
  ]);

  if (feature_ids.length === 0) return 0;

  const result = await db.query(
    `INSERT INTO position_features (position_id, feature_id, granted_by)
     SELECT $1::uuid, id, $3::uuid
     FROM unnest($2::uuid[]) AS id`,
    [position_id, feature_ids, granted_by],
  );

  return result.rowCount ?? 0;
}

export async function countGrantsByPosition(
  position_id: string,
): Promise<number> {
  const result = await pool.query<{ count: string }>(
    "SELECT COUNT(*) FROM position_features WHERE position_id = $1::uuid",
    [position_id],
  );

  return Number(result.rows[0]?.count ?? 0);
}
