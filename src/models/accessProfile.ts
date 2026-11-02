import { pool } from "../config/databaseConnection.js";
import { sameVersion } from "../helpers/concurrency.js";
import type { Executor } from "./user.js";

export interface AccessProfile {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_system: boolean;
  codes: string[];
  // jumlah jabatan dan karyawan aktif yang ikut berubah bila paket diubah
  position_count: number;
  employee_count: number;
  created_at: Date;
  updated_at: Date;
}

const SELECT_PROFILE = `
  SELECT ap.id, ap.code, ap.name, ap.description, ap.is_system,
         ap.created_at, ap.updated_at,
         COALESCE((
           SELECT array_agg(f.code ORDER BY f.code)
           FROM access_profile_features apf
           JOIN features f ON f.id = apf.feature_id
           WHERE apf.profile_id = ap.id AND f.is_active = true
         ), '{}') AS codes,
         (SELECT COUNT(*)::int FROM positions p
          WHERE p.access_profile_id = ap.id AND p.deleted_at IS NULL
         ) AS position_count,
         (SELECT COUNT(*)::int FROM employees e
          JOIN positions p ON p.id = e.position_id
          WHERE p.access_profile_id = ap.id AND p.deleted_at IS NULL
            AND e.deleted_at IS NULL AND e.is_active = true
         ) AS employee_count
  FROM access_profiles ap`;

export async function findAll(): Promise<AccessProfile[]> {
  const result = await pool.query<AccessProfile>(
    `${SELECT_PROFILE}
     ORDER BY ap.is_system DESC, ap.name ASC`,
  );

  return result.rows;
}

export async function findById(
  id: string,
  db: Executor = pool,
): Promise<AccessProfile | null> {
  const result = await db.query<AccessProfile>(
    `${SELECT_PROFILE} WHERE ap.id = $1::uuid`,
    [id],
  );

  return result.rows[0] ?? null;
}

export async function findByName(
  name: string,
  exceptId?: string,
): Promise<{ id: string } | null> {
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM access_profiles
     WHERE lower(name) = lower($1)
       AND ($2::uuid IS NULL OR id <> $2::uuid)`,
    [name, exceptId ?? null],
  );

  return result.rows[0] ?? null;
}

// Paket yang isinya sama persis dengan daftar fitur, dipakai jalur lama yang
// masih mengirim centang per jabatan supaya tidak membuat paket kembar
export async function findByExactCodes(
  codes: string[],
  db: Executor = pool,
): Promise<{ id: string; name: string } | null> {
  const result = await db.query<{ id: string; name: string }>(
    `SELECT ap.id, ap.name
     FROM access_profiles ap
     WHERE COALESCE((
       SELECT array_agg(f.code::text ORDER BY f.code::text)
       FROM access_profile_features apf
       JOIN features f ON f.id = apf.feature_id
       WHERE apf.profile_id = ap.id AND f.is_active = true
     ), '{}'::text[]) = (SELECT COALESCE(array_agg(c ORDER BY c), '{}'::text[])
                         FROM unnest($1::text[]) AS c)
     ORDER BY ap.is_system DESC, ap.created_at ASC
     LIMIT 1`,
    [codes],
  );

  return result.rows[0] ?? null;
}

export async function createProfile(
  db: Executor,
  data: { code: string; name: string; description?: string | null },
): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO access_profiles (code, name, description)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [data.code, data.name, data.description ?? null],
  );

  const created = result.rows[0];
  if (!created) throw new Error("Failed to save access profile");

  return created.id;
}

// null berarti versinya sudah berubah atau paketnya sudah tidak ada
export async function updateProfile(
  db: Executor,
  id: string,
  data: { name?: string; description?: string | null },
  expectedUpdatedAt?: string,
): Promise<{ id: string } | null> {
  const result = await db.query<{ id: string }>(
    `UPDATE access_profiles
     SET name = COALESCE($2, name),
         description = CASE WHEN $3::boolean THEN $4 ELSE description END,
         updated_at = now()
     WHERE id = $1::uuid AND ${sameVersion("updated_at", 5)}
     RETURNING id`,
    [
      id,
      data.name ?? null,
      data.description !== undefined,
      data.description ?? null,
      expectedUpdatedAt ?? null,
    ],
  );

  return result.rows[0] ?? null;
}

export async function replaceFeatures(
  db: Executor,
  profile_id: string,
  codes: string[],
): Promise<void> {
  await db.query(
    `DELETE FROM access_profile_features WHERE profile_id = $1::uuid`,
    [profile_id],
  );

  if (codes.length === 0) return;

  await db.query(
    `INSERT INTO access_profile_features (profile_id, feature_id)
     SELECT $1::uuid, f.id FROM features f
     WHERE f.code = ANY($2::text[]) AND f.is_active = true`,
    [profile_id, codes],
  );
}

// Menyalin fitur paket ke position_features semua jabatan pemakainya, dalam
// transaksi yang sama dengan perubahan paket. Mengembalikan id jabatan yang
// tersentuh supaya cache fiturnya dapat dibuang
export async function syncPositions(
  db: Executor,
  profile_id: string,
  granted_by: string | null,
): Promise<string[]> {
  const positions = await db.query<{ id: string }>(
    `SELECT id FROM positions
     WHERE access_profile_id = $1::uuid
     ORDER BY id
     FOR UPDATE`,
    [profile_id],
  );

  const ids = positions.rows.map((row) => row.id);
  if (ids.length === 0) return [];

  await db.query(
    `DELETE FROM position_features WHERE position_id = ANY($1::uuid[])`,
    [ids],
  );
  await db.query(
    `INSERT INTO position_features (position_id, feature_id, granted_by)
     SELECT p, apf.feature_id, $3::uuid
     FROM unnest($1::uuid[]) AS p
     JOIN access_profile_features apf ON apf.profile_id = $2::uuid`,
    [ids, profile_id, granted_by],
  );

  return ids;
}

// Memasang paket ke satu jabatan (null berarti tanpa paket) sekaligus
// menyalin fiturnya. Versi jabatan diperiksa, jadi dua admin yang mengubah
// jabatan yang sama saling terdeteksi. null berarti versinya tidak cocok
export async function assignToPosition(
  db: Executor,
  position_id: string,
  profile_id: string | null,
  granted_by: string | null,
  expectedUpdatedAt?: string,
): Promise<{ id: string; updated_at: Date } | null> {
  const updated = await db.query<{ id: string; updated_at: Date }>(
    `UPDATE positions
     SET access_profile_id = $2::uuid, updated_at = now()
     WHERE id = $1::uuid AND deleted_at IS NULL
       AND ${sameVersion("updated_at", 3)}
     RETURNING id, updated_at`,
    [position_id, profile_id, expectedUpdatedAt ?? null],
  );

  const row = updated.rows[0];
  if (!row) return null;

  await db.query(`DELETE FROM position_features WHERE position_id = $1::uuid`, [
    position_id,
  ]);

  if (profile_id) {
    await db.query(
      `INSERT INTO position_features (position_id, feature_id, granted_by)
       SELECT $1::uuid, apf.feature_id, $3::uuid
       FROM access_profile_features apf
       WHERE apf.profile_id = $2::uuid`,
      [position_id, profile_id, granted_by],
    );
  }

  return row;
}

export async function deleteProfile(db: Executor, id: string): Promise<void> {
  await db.query(`DELETE FROM access_profiles WHERE id = $1::uuid`, [id]);
}

export interface PositionAssignment {
  position_id: string;
  access_profile_id: string | null;
}

export async function findAssignments(): Promise<PositionAssignment[]> {
  const result = await pool.query<PositionAssignment>(
    `SELECT id AS position_id, access_profile_id
     FROM positions WHERE deleted_at IS NULL`,
  );

  return result.rows;
}
