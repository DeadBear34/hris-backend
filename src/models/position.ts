import { pool } from "../config/databaseConnection.js";
import { sameVersion } from "../helpers/concurrency.js";
import { updateVersioned } from "./versionedUpdate.js";
import type { Executor } from "./user.js";
import { MAX_TREE_DEPTH } from "../helpers/orgConstants.js";

export interface Position {
  id: string;
  code: string;
  name: string;
  level: number;
  // unit pemilik jabatan. Null hanya untuk data lama sebelum struktur disusun
  department_id: string | null;
  // atasan jabatan. Null berarti jabatan puncak (misalnya CEO)
  reports_to_position_id: string | null;
  is_unit_head: boolean;
  // kuota kursi. Null berarti tanpa batas
  max_holders: number | null;
  is_active: boolean;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface PositionInput {
  code: string;
  name: string;
  level?: number;
  department_id?: string | null;
  reports_to_position_id?: string | null;
  is_unit_head?: boolean;
  max_holders?: number | null;
  is_active?: boolean;
}

const UPDATABLE_COLUMNS = [
  "code",
  "name",
  "level",
  "department_id",
  "reports_to_position_id",
  "is_unit_head",
  "max_holders",
  "is_active",
] as const;

const COLUMN_CAST: Record<string, string> = {
  level: "::int",
  department_id: "::uuid",
  reports_to_position_id: "::uuid",
  is_unit_head: "::boolean",
  max_holders: "::int",
};

export interface PositionListItem extends Position {
  department_code: string | null;
  department_name: string | null;
  reports_to_position_name: string | null;
}

// Nama unit dan nama atasan jabatan ikut disertakan, karena nama jabatan
// hanya unik per unit: "Staff" di Finance dan di Operations harus bisa
// dibedakan di dropdown dan matriks fitur. Diurutkan per unit, kepala unit
// lebih dulu; jabatan lama tanpa unit di akhir
export async function findAll(): Promise<PositionListItem[]> {
  const result = await pool.query<PositionListItem>(
    `SELECT p.*, d.code AS department_code, d.name AS department_name,
            s.name AS reports_to_position_name
     FROM positions p
     LEFT JOIN departments d ON d.id = p.department_id
     LEFT JOIN positions s ON s.id = p.reports_to_position_id
     WHERE p.deleted_at IS NULL
     ORDER BY d.name ASC NULLS LAST, p.is_unit_head DESC, p.name ASC`,
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

// Kode jabatan unik per unit, jadi pencariannya selalu di dalam satu unit
export async function findByCode(
  code: string,
  department_id: string | null,
  exceptId?: string,
): Promise<Position | null> {
  const result = await pool.query<Position>(
    `SELECT * FROM positions
     WHERE code = $1 AND deleted_at IS NULL
       AND department_id IS NOT DISTINCT FROM $2::uuid
       AND ($3::uuid IS NULL OR id <> $3::uuid)`,
    [code, department_id, exceptId ?? null],
  );
  return result.rows[0] ?? null;
}

// Nama jabatan unik per unit: "Staff" boleh ada di Finance dan di Operations.
// Dibandingkan tanpa membedakan huruf besar-kecil dan spasi di tepi, supaya
// "Staff", "staff", dan " Staff " dianggap nama yang sama. exceptId dipakai
// saat mengubah, agar namanya sendiri tidak dianggap bentrok
export async function findByName(
  name: string,
  department_id: string | null,
  exceptId?: string,
): Promise<Position | null> {
  const result = await pool.query<Position>(
    `SELECT * FROM positions
     WHERE lower(btrim(name)) = lower(btrim($1))
       AND deleted_at IS NULL
       AND department_id IS NOT DISTINCT FROM $2::uuid
       AND ($3::uuid IS NULL OR id <> $3::uuid)`,
    [name, department_id, exceptId ?? null],
  );

  return result.rows[0] ?? null;
}

export async function createPosition(data: PositionInput): Promise<Position> {
  const result = await pool.query<Position>(
    `INSERT INTO positions
       (code, name, level, department_id, reports_to_position_id,
        is_unit_head, max_holders)
     VALUES ($1, $2, COALESCE($3::int, 1), $4::uuid, $5::uuid,
             COALESCE($6::boolean, false), $7::int)
     RETURNING *`,
    [
      data.code,
      data.name,
      data.level ?? null,
      data.department_id ?? null,
      data.reports_to_position_id ?? null,
      data.is_unit_head ?? null,
      data.max_holders ?? null,
    ],
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
  db?: Executor,
): Promise<Position | null> {
  return updateVersioned<Position>({
    db,
    table: "positions",
    id,
    data,
    columns: UPDATABLE_COLUMNS,
    casts: COLUMN_CAST,
    returning: "*",
    expectedUpdatedAt,
    current: () => findById(id),
  });
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

// true bila candidate adalah jabatan itu sendiri atau salah satu bawahannya
// (langsung maupun tidak langsung). Jabatan tidak boleh melapor ke cabangnya
// sendiri, karena atasan akan berputar tanpa ujung
export async function isPositionInSubtree(
  positionId: string,
  candidateId: string,
): Promise<boolean> {
  const result = await pool.query<{ found: boolean }>(
    `WITH RECURSIVE cabang AS (
       SELECT id, 0 AS kedalaman FROM positions
       WHERE id = $1::uuid AND deleted_at IS NULL

       UNION ALL

       SELECT p.id, c.kedalaman + 1
       FROM positions p
       JOIN cabang c ON p.reports_to_position_id = c.id
       WHERE p.deleted_at IS NULL AND c.kedalaman < $3::int
     )
     SELECT EXISTS (SELECT 1 FROM cabang WHERE id = $2::uuid) AS found`,
    [positionId, candidateId, MAX_TREE_DEPTH],
  );

  return result.rows[0]?.found === true;
}

// Jumlah tingkat dari jabatan ini sampai puncak. Jabatan puncak bernilai 0
export async function depthOf(positionId: string): Promise<number> {
  const result = await pool.query<{ depth: number }>(
    `WITH RECURSIVE atasan AS (
       SELECT id, reports_to_position_id, 0 AS kedalaman FROM positions
       WHERE id = $1::uuid AND deleted_at IS NULL

       UNION ALL

       SELECT p.id, p.reports_to_position_id, a.kedalaman + 1
       FROM positions p
       JOIN atasan a ON p.id = a.reports_to_position_id
       WHERE p.deleted_at IS NULL AND a.kedalaman < $2::int
     )
     SELECT COALESCE(MAX(kedalaman), 0)::int AS depth FROM atasan`,
    [positionId, MAX_TREE_DEPTH + 1],
  );

  return result.rows[0]?.depth ?? 0;
}

// Jabatan puncak, yaitu yang tidak punya atasan jabatan. Jabatan lama tanpa
// unit tidak dihitung, karena belum masuk struktur
export async function findRoots(exceptId?: string): Promise<Position[]> {
  const result = await pool.query<Position>(
    `SELECT * FROM positions
     WHERE reports_to_position_id IS NULL AND department_id IS NOT NULL
       AND deleted_at IS NULL
       AND ($1::uuid IS NULL OR id <> $1::uuid)`,
    [exceptId ?? null],
  );
  return result.rows;
}

export async function findUnitHead(
  department_id: string,
  exceptId?: string,
): Promise<Position | null> {
  const result = await pool.query<Position>(
    `SELECT * FROM positions
     WHERE department_id = $1::uuid AND is_unit_head AND deleted_at IS NULL
       AND ($2::uuid IS NULL OR id <> $2::uuid)`,
    [department_id, exceptId ?? null],
  );
  return result.rows[0] ?? null;
}

export async function countDirectReports(id: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) FROM positions
     WHERE reports_to_position_id = $1::uuid AND deleted_at IS NULL`,
    [id],
  );
  return Number(result.rows[0]?.count ?? 0);
}

// Jabatan berpindah unit: departemen para pemegangnya ikut disesuaikan,
// karena departemen karyawan selalu diturunkan dari jabatannya
export async function syncHolderDepartments(
  db: Executor,
  positionId: string,
  department_id: string | null,
): Promise<number> {
  const result = await db.query(
    `UPDATE employees SET department_id = $2::uuid, updated_at = now()
     WHERE position_id = $1::uuid AND deleted_at IS NULL
       AND department_id IS DISTINCT FROM $2::uuid`,
    [positionId, department_id],
  );
  return result.rowCount ?? 0;
}
