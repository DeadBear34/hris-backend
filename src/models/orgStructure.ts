import { pool } from "../config/databaseConnection.js";
import { MAX_TREE_DEPTH } from "../helpers/orgConstants.js";
import type { Executor } from "./user.js";

export interface LineManager {
  employee_id: string;
  full_name: string;
  user_id: string | null;
  position_id: string | null;
  position_name: string | null;
  // override = employees.manager_id diisi manual
  // structure = dihitung dari atasan jabatan
  source: "override" | "structure";
  // jumlah tingkat jabatan yang dinaiki; 1 berarti atasan jabatan langsung,
  // lebih dari 1 berarti jabatan di antaranya kosong
  levels_up: number;
}

// Calon atasan hanya karyawan aktif yang akunnya aktif. Atasan yang tidak
// bisa login tidak bisa menyetujui apa pun, jadi dilewati ke tingkat berikutnya
const ACTIVE_HOLDER = `
  e.deleted_at IS NULL AND e.is_active = true
  AND e.employment_status <> 'resigned'::employment_status
  AND EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = e.user_id AND u.is_active = true AND u.deleted_at IS NULL
  )`;

// Pengecualian manual lewat employees.manager_id, hanya bila atasannya aktif
async function findOverrideManager(
  employee_id: string,
  db: Executor,
): Promise<LineManager | null> {
  const result = await db.query<LineManager>(
    `SELECT e.id AS employee_id, e.full_name, e.user_id,
            e.position_id, p.name AS position_name,
            'override' AS source, 1 AS levels_up
     FROM employees bawahan
     JOIN employees e ON e.id = bawahan.manager_id
     LEFT JOIN positions p ON p.id = e.position_id
     WHERE bawahan.id = $1::uuid AND ${ACTIVE_HOLDER}`,
    [employee_id],
  );

  return result.rows[0] ?? null;
}

// Naik dari jabatan karyawan ke atasan jabatannya. Jabatan yang kosong
// dilewati sampai ditemukan pemegang aktif. Bila satu jabatan dipegang
// beberapa orang, yang paling lama menjabat yang dipilih. Rekan yang
// memegang jabatan yang sama tidak pernah dianggap atasan
async function findStructuralManager(
  employee_id: string,
  db: Executor,
): Promise<LineManager | null> {
  const result = await db.query<LineManager>(
    `WITH RECURSIVE rantai AS (
       SELECT p.id, p.reports_to_position_id, 0 AS tingkat
       FROM employees asal
       JOIN positions p ON p.id = asal.position_id AND p.deleted_at IS NULL
       WHERE asal.id = $1::uuid

       UNION ALL

       SELECT p.id, p.reports_to_position_id, r.tingkat + 1
       FROM positions p
       JOIN rantai r ON p.id = r.reports_to_position_id
       WHERE p.deleted_at IS NULL AND r.tingkat < $2::int
     )
     SELECT e.id AS employee_id, e.full_name, e.user_id,
            p.id AS position_id, p.name AS position_name,
            'structure' AS source, r.tingkat AS levels_up
     FROM rantai r
     JOIN positions p ON p.id = r.id
     JOIN employees e ON e.position_id = r.id
     WHERE r.tingkat > 0
       AND e.id <> $1::uuid
       AND ${ACTIVE_HOLDER}
     ORDER BY r.tingkat ASC, e.join_date ASC, e.created_at ASC
     LIMIT 1`,
    [employee_id, MAX_TREE_DEPTH],
  );

  return result.rows[0] ?? null;
}

// Atasan langsung (line manager) seorang karyawan:
// 1. pengecualian manual (manager_id) bila diisi dan atasannya aktif
// 2. pemegang aktif atasan jabatan, naik terus melewati jabatan kosong
// 3. null bila sampai puncak tetap tidak ada; ditangani HR dan admin
export async function findLineManager(
  employee_id: string,
  db: Executor = pool,
): Promise<LineManager | null> {
  return (
    (await findOverrideManager(employee_id, db)) ??
    (await findStructuralManager(employee_id, db))
  );
}

export async function countHolders(
  position_id: string,
  exceptEmployeeId?: string,
): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) FROM employees
     WHERE position_id = $1::uuid AND deleted_at IS NULL
       AND ($2::uuid IS NULL OR id <> $2::uuid)`,
    [position_id, exceptEmployeeId ?? null],
  );
  return Number(result.rows[0]?.count ?? 0);
}

export interface UnitRow {
  id: string;
  code: string;
  name: string;
  parent_id: string | null;
  unit_type: string;
  is_active: boolean;
}

export interface PositionRow {
  id: string;
  code: string;
  name: string;
  department_id: string | null;
  reports_to_position_id: string | null;
  is_unit_head: boolean;
  max_holders: number | null;
  is_active: boolean;
}

export interface HolderRow {
  id: string;
  employee_number: string;
  full_name: string;
  position_id: string;
}

// Seluruh isi bagan organisasi dalam tiga query datar. Penyusunan pohonnya
// dilakukan di aplikasi, lihat helpers/orgTree.ts
export async function loadOrgChart(): Promise<{
  units: UnitRow[];
  positions: PositionRow[];
  holders: HolderRow[];
}> {
  const [units, positions, holders] = await Promise.all([
    pool.query<UnitRow>(
      `SELECT id, code, name, parent_id, unit_type, is_active
       FROM departments WHERE deleted_at IS NULL
       ORDER BY name ASC`,
    ),
    pool.query<PositionRow>(
      `SELECT id, code, name, department_id, reports_to_position_id,
              is_unit_head, max_holders, is_active
       FROM positions WHERE deleted_at IS NULL
       ORDER BY is_unit_head DESC, name ASC`,
    ),
    pool.query<HolderRow>(
      `SELECT id, employee_number, full_name, position_id
       FROM employees
       WHERE deleted_at IS NULL AND is_active = true AND position_id IS NOT NULL
       ORDER BY join_date ASC, full_name ASC`,
    ),
  ]);

  return {
    units: units.rows,
    positions: positions.rows,
    holders: holders.rows,
  };
}
