import { pool } from "../config/databaseConnection.js";
import { updateVersioned } from "./versionedUpdate.js";
import { sameVersion } from "../helpers/concurrency.js";
import type { Executor } from "./user.js";
import {
  dayNameOf,
  dateRange,
  type IsoDate,
  type DayName,
} from "../helpers/timezone.js";

export interface ScheduleDepartment {
  id: string;
  name: string;
}

export interface WorkSchedule {
  id: string;
  name: string;
  // jadwal bawaan berlaku bagi karyawan yang divisinya tidak punya jadwal
  is_default: boolean;
  department_ids: string[];
  departments: ScheduleDepartment[];
  // Lama, dipertahankan supaya klien lama tetap jalan: divisi pertama, atau
  // null untuk jadwal bawaan. Klien baru memakai department_ids
  department_id: string | null;
  start_time: string;
  end_time: string;
  late_tolerance_minutes: number;
  absent_cutoff_time: string;
  overtime_min_minutes: number;
  works_monday: boolean;
  works_tuesday: boolean;
  works_wednesday: boolean;
  works_thursday: boolean;
  works_friday: boolean;
  works_saturday: boolean;
  works_sunday: boolean;
  is_active: boolean;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface WorkScheduleInput {
  name: string;
  department_ids?: string[];
  start_time?: string;
  end_time?: string;
  late_tolerance_minutes?: number;
  absent_cutoff_time?: string;
  overtime_min_minutes?: number;
  works_monday?: boolean;
  works_tuesday?: boolean;
  works_wednesday?: boolean;
  works_thursday?: boolean;
  works_friday?: boolean;
  works_saturday?: boolean;
  works_sunday?: boolean;
  is_active?: boolean;
}

const UPDATABLE_COLUMNS = [
  "name",
  "start_time",
  "end_time",
  "late_tolerance_minutes",
  "absent_cutoff_time",
  "overtime_min_minutes",
  "works_monday",
  "works_tuesday",
  "works_wednesday",
  "works_thursday",
  "works_friday",
  "works_saturday",
  "works_sunday",
  "is_active",
] as const;

const COLUMN_CAST: Record<string, string> = {
  start_time: "::time",
  end_time: "::time",
  absent_cutoff_time: "::time",
  late_tolerance_minutes: "::int",
  overtime_min_minutes: "::int",
};

const TIME_COLUMNS = new Set(["start_time", "end_time", "absent_cutoff_time"]);

const COLUMN_NAMES = [
  "id",
  "name",
  "is_default",
  "start_time",
  "end_time",
  "late_tolerance_minutes",
  "absent_cutoff_time",
  "overtime_min_minutes",
  "works_monday",
  "works_tuesday",
  "works_wednesday",
  "works_thursday",
  "works_friday",
  "works_saturday",
  "works_sunday",
  "is_active",
  "deleted_at",
  "created_at",
  "updated_at",
] as const;

function columnList(prefix: string): string {
  return COLUMN_NAMES.map((column) =>
    TIME_COLUMNS.has(column)
      ? `${prefix}.${column}::text AS ${column}`
      : `${prefix}.${column}`,
  ).join(", ");
}

// Divisi pemakai jadwal ikut dibaca dalam query yang sama, urut nama
function departmentsOf(prefix: string): string {
  return `COALESCE((
       SELECT json_agg(json_build_object('id', d.id, 'name', d.name)
                       ORDER BY d.name)
       FROM work_schedule_departments wsd
       JOIN departments d ON d.id = wsd.department_id
       WHERE wsd.work_schedule_id = ${prefix}.id
     ), '[]'::json) AS departments`;
}

const COLUMNS = `${columnList("ws")}, ${departmentsOf("ws")}`;
const SCHEDULE_COLUMNS = `${columnList("j")}, ${departmentsOf("j")}`;

type ScheduleRow = Omit<WorkSchedule, "department_ids" | "department_id">;

function toSchedule(row: ScheduleRow): WorkSchedule {
  const departments = row.departments ?? [];
  const department_ids = departments.map((department) => department.id);

  return {
    ...row,
    departments,
    department_ids,
    department_id: department_ids[0] ?? null,
  };
}

// Jadwal yang berlaku bagi seorang karyawan, urut prioritas:
// 1. jadwal yang dipasang khusus untuk karyawan itu
// 2. jadwal yang memuat divisinya
// 3. jadwal bawaan
const RESOLVE_LATERAL = `JOIN LATERAL (
       SELECT ws.*,
              CASE
                WHEN ws.id = e.work_schedule_id THEN 1
                WHEN EXISTS (
                  SELECT 1 FROM work_schedule_departments wsd
                  WHERE wsd.work_schedule_id = ws.id
                    AND wsd.department_id = e.department_id
                ) THEN 2
                ELSE 3
              END AS prioritas
       FROM work_schedules ws
       WHERE ws.deleted_at IS NULL AND ws.is_active = true
         AND (ws.id = e.work_schedule_id
              OR ws.is_default
              OR EXISTS (
                SELECT 1 FROM work_schedule_departments wsd
                WHERE wsd.work_schedule_id = ws.id
                  AND wsd.department_id = e.department_id
              ))
       ORDER BY prioritas ASC
       LIMIT 1
     ) j ON true`;

export async function findAll(): Promise<WorkSchedule[]> {
  const result = await pool.query<ScheduleRow>(
    `SELECT ${COLUMNS} FROM work_schedules ws
     WHERE ws.deleted_at IS NULL
     ORDER BY ws.is_default DESC, ws.name ASC`,
  );

  return result.rows.map(toSchedule);
}

export async function findById(
  id: string,
  db: Executor = pool,
): Promise<WorkSchedule | null> {
  const result = await db.query<ScheduleRow>(
    `SELECT ${COLUMNS} FROM work_schedules ws
     WHERE ws.id = $1::uuid AND ws.deleted_at IS NULL`,
    [id],
  );

  const row = result.rows[0];
  return row ? toSchedule(row) : null;
}

export async function findDefault(): Promise<WorkSchedule | null> {
  const result = await pool.query<ScheduleRow>(
    `SELECT ${COLUMNS} FROM work_schedules ws
     WHERE ws.is_default AND ws.deleted_at IS NULL`,
  );

  const row = result.rows[0];
  return row ? toSchedule(row) : null;
}

export interface DepartmentScheduleOwner {
  department_id: string;
  department_name: string;
  schedule_id: string;
  schedule_name: string;
}

// Divisi yang sudah dipakai jadwal lain. exceptScheduleId diisi saat
// mengubah, supaya divisi milik jadwal itu sendiri tidak dianggap bentrok
export async function findDepartmentOwners(
  department_ids: string[],
  exceptScheduleId?: string,
): Promise<DepartmentScheduleOwner[]> {
  if (department_ids.length === 0) return [];

  const result = await pool.query<DepartmentScheduleOwner>(
    `SELECT d.id AS department_id, d.name AS department_name,
            ws.id AS schedule_id, ws.name AS schedule_name
     FROM work_schedule_departments wsd
     JOIN work_schedules ws ON ws.id = wsd.work_schedule_id
     JOIN departments d ON d.id = wsd.department_id
     WHERE wsd.department_id = ANY($1::uuid[])
       AND ws.deleted_at IS NULL
       AND ($2::uuid IS NULL OR ws.id <> $2::uuid)
     ORDER BY d.name ASC`,
    [department_ids, exceptScheduleId ?? null],
  );

  return result.rows;
}

export async function resolveForEmployee(
  employee_id: string,
): Promise<WorkSchedule | null> {
  const result = await pool.query<ScheduleRow>(
    `SELECT ${SCHEDULE_COLUMNS}
     FROM employees e
     ${RESOLVE_LATERAL}
     WHERE e.id = $1::uuid AND e.deleted_at IS NULL`,
    [employee_id],
  );

  const row = result.rows[0];
  return row ? toSchedule(row) : null;
}

// join_date ikut dibawa supaya penutupan hari tidak menandai tidak hadir
// pada tanggal sebelum karyawan bergabung
export async function resolveForAllActive(): Promise<
  { employee_id: string; join_date: IsoDate | null; schedule: WorkSchedule }[]
> {
  const result = await pool.query<
    ScheduleRow & { employee_id: string; join_date: IsoDate | null }
  >(
    `SELECT e.id AS employee_id, to_char(e.join_date, 'YYYY-MM-DD') AS join_date,
            ${SCHEDULE_COLUMNS}
     FROM employees e
     ${RESOLVE_LATERAL}
     WHERE e.deleted_at IS NULL AND e.is_active = true
       AND e.employment_status <> 'resigned'::employment_status
     ORDER BY e.employee_number ASC`,
  );

  return result.rows.map(({ employee_id, join_date, ...schedule }) => ({
    employee_id,
    join_date: join_date ?? null,
    schedule: toSchedule(schedule),
  }));
}

// Mengganti seluruh divisi pemakai jadwal. Dipanggil di dalam transaksi
// yang sama dengan penyimpanan jadwalnya
export async function replaceDepartments(
  db: Executor,
  work_schedule_id: string,
  department_ids: string[],
): Promise<void> {
  await db.query(
    `DELETE FROM work_schedule_departments
     WHERE work_schedule_id = $1::uuid
       AND NOT (department_id = ANY($2::uuid[]))`,
    [work_schedule_id, department_ids],
  );

  if (department_ids.length === 0) return;

  await db.query(
    `INSERT INTO work_schedule_departments (work_schedule_id, department_id)
     SELECT $1::uuid, unnest($2::uuid[])
     ON CONFLICT (work_schedule_id, department_id) DO NOTHING`,
    [work_schedule_id, department_ids],
  );
}

export async function createSchedule(
  db: Executor,
  data: WorkScheduleInput,
  is_default: boolean,
): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO work_schedules
       (name, is_default, start_time, end_time, late_tolerance_minutes,
        absent_cutoff_time, overtime_min_minutes, works_monday, works_tuesday,
        works_wednesday, works_thursday, works_friday, works_saturday,
        works_sunday)
     VALUES ($1, $2::boolean,
             COALESCE($3::time, '08:00'), COALESCE($4::time, '18:00'),
             COALESCE($5::int, 5), COALESCE($6::time, '18:00'),
             COALESCE($7::int, 30),
             COALESCE($8::boolean, true), COALESCE($9::boolean, true),
             COALESCE($10::boolean, true), COALESCE($11::boolean, true),
             COALESCE($12::boolean, true), COALESCE($13::boolean, false),
             COALESCE($14::boolean, false))
     RETURNING id`,
    [
      data.name,
      is_default,
      data.start_time ?? null,
      data.end_time ?? null,
      data.late_tolerance_minutes ?? null,
      data.absent_cutoff_time ?? null,
      data.overtime_min_minutes ?? null,
      data.works_monday ?? null,
      data.works_tuesday ?? null,
      data.works_wednesday ?? null,
      data.works_thursday ?? null,
      data.works_friday ?? null,
      data.works_saturday ?? null,
      data.works_sunday ?? null,
    ],
  );

  const created = result.rows[0];
  if (!created) {
    throw new Error("Failed to save work schedule");
  }

  await replaceDepartments(db, created.id, data.department_ids ?? []);

  return created.id;
}

// Dipakai bila yang berubah hanya daftar divisi: versi tetap diperiksa dan
// updated_at tetap diperbarui, supaya perubahan divisi juga terdeteksi
// oleh pengguna lain yang sedang membuka jadwal yang sama
async function touchSchedule(
  db: Executor,
  id: string,
  expectedUpdatedAt?: string,
): Promise<{ id: string } | null> {
  const result = await db.query<{ id: string }>(
    `UPDATE work_schedules SET updated_at = now()
     WHERE id = $1::uuid AND deleted_at IS NULL
       AND ${sameVersion("updated_at", 2)}
     RETURNING id`,
    [id, expectedUpdatedAt ?? null],
  );

  return result.rows[0] ?? null;
}

// false berarti versi tidak cocok atau jadwalnya sudah dihapus. Divisi
// diganti hanya bila department_ids dikirim
export async function updateSchedule(
  db: Executor,
  id: string,
  data: Partial<WorkScheduleInput>,
  expectedUpdatedAt?: string,
): Promise<boolean> {
  const updated = await updateVersioned<{ id: string }>({
    table: "work_schedules",
    id,
    data,
    columns: UPDATABLE_COLUMNS,
    casts: COLUMN_CAST,
    returning: "id",
    expectedUpdatedAt,
    current: () => touchSchedule(db, id, expectedUpdatedAt),
    db,
  });

  if (!updated) return false;

  if (data.department_ids !== undefined) {
    await replaceDepartments(db, id, data.department_ids);
  }

  return true;
}

// Divisinya dilepas saat jadwal dihapus, supaya divisi itu bisa dipasang
// ke jadwal lain dan karyawannya kembali memakai jadwal bawaan
export async function softDeleteSchedule(
  db: Executor,
  id: string,
): Promise<void> {
  await db.query(
    `UPDATE work_schedules
     SET deleted_at = now(), is_active = false, updated_at = now()
     WHERE id = $1::uuid AND deleted_at IS NULL`,
    [id],
  );
  await db.query(
    `DELETE FROM work_schedule_departments WHERE work_schedule_id = $1::uuid`,
    [id],
  );
}

export async function countEmployees(id: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) FROM employees
     WHERE work_schedule_id = $1::uuid AND deleted_at IS NULL`,
    [id],
  );

  return Number(result.rows[0]?.count ?? 0);
}

export function isWorkingDay(schedule: WorkSchedule, day: DayName): boolean {
  switch (day) {
    case "monday":
      return schedule.works_monday;
    case "tuesday":
      return schedule.works_tuesday;
    case "wednesday":
      return schedule.works_wednesday;
    case "thursday":
      return schedule.works_thursday;
    case "friday":
      return schedule.works_friday;
    case "saturday":
      return schedule.works_saturday;
    case "sunday":
      return schedule.works_sunday;
  }
}

export function workingDatesInRange(
  schedule: WorkSchedule,
  start: IsoDate,
  end: IsoDate,
  holidays: IsoDate[] = [],
): IsoDate[] {
  const holidaySet = new Set(holidays);

  return dateRange(start, end).filter(
    (date) => isWorkingDay(schedule, dayNameOf(date)) && !holidaySet.has(date),
  );
}
