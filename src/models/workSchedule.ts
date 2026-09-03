import { pool } from "../config/databaseConnection.js";
import {
  dayNameOf,
  dateRange,
  type IsoDate,
  type DayName,
} from "../helpers/timezone.js";

export interface WorkSchedule {
  id: string;
  name: string;
  department_id: string | null;
  start_time: string;
  end_time: string;
  late_tolerance_minutes: number;
  absent_cutoff_time: string;
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
  department_id?: string | null;
  start_time?: string;
  end_time?: string;
  late_tolerance_minutes?: number;
  absent_cutoff_time?: string;
  works_monday?: boolean;
  works_tuesday?: boolean;
  works_wednesday?: boolean;
  works_thursday?: boolean;
  works_friday?: boolean;
  works_saturday?: boolean;
  works_sunday?: boolean;
  is_active?: boolean;
}

export interface EmployeeSchedule {
  employee_id: string;
  schedule: WorkSchedule | null;
}

const UPDATABLE_COLUMNS = [
  "name",
  "department_id",
  "start_time",
  "end_time",
  "late_tolerance_minutes",
  "absent_cutoff_time",
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
  department_id: "::uuid",
  start_time: "::time",
  end_time: "::time",
  absent_cutoff_time: "::time",
  late_tolerance_minutes: "::int",
};

const TIME_COLUMNS = new Set(["start_time", "end_time", "absent_cutoff_time"]);

const COLUMN_NAMES = [
  "id",
  "name",
  "department_id",
  "start_time",
  "end_time",
  "late_tolerance_minutes",
  "absent_cutoff_time",
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

function columnList(prefix = ""): string {
  const dot = prefix ? `${prefix}.` : "";

  return COLUMN_NAMES.map((column) =>
    TIME_COLUMNS.has(column)
      ? `${dot}${column}::text AS ${column}`
      : `${dot}${column}`,
  ).join(", ");
}

const COLUMNS = columnList();
const SCHEDULE_COLUMNS = columnList("j");

export async function findAll(): Promise<WorkSchedule[]> {
  const result = await pool.query<WorkSchedule>(
    `SELECT ${COLUMNS} FROM work_schedules
     WHERE deleted_at IS NULL
     ORDER BY department_id NULLS FIRST, name ASC`,
  );

  return result.rows;
}

export async function findById(id: string): Promise<WorkSchedule | null> {
  const result = await pool.query<WorkSchedule>(
    `SELECT ${COLUMNS} FROM work_schedules
     WHERE id = $1::uuid AND deleted_at IS NULL`,
    [id],
  );

  return result.rows[0] ?? null;
}

export async function findDefault(): Promise<WorkSchedule | null> {
  const result = await pool.query<WorkSchedule>(
    `SELECT ${COLUMNS} FROM work_schedules
     WHERE department_id IS NULL AND deleted_at IS NULL`,
  );

  return result.rows[0] ?? null;
}

export async function findByDepartment(
  department_id: string,
): Promise<WorkSchedule | null> {
  const result = await pool.query<WorkSchedule>(
    `SELECT ${COLUMNS} FROM work_schedules
     WHERE department_id = $1::uuid AND deleted_at IS NULL`,
    [department_id],
  );

  return result.rows[0] ?? null;
}

export async function resolveForEmployee(
  employee_id: string,
): Promise<WorkSchedule | null> {
  const result = await pool.query<WorkSchedule>(
    `SELECT ${SCHEDULE_COLUMNS}
     FROM employees e
     JOIN LATERAL (
       SELECT ws.*,
              CASE
                WHEN ws.id = e.work_schedule_id THEN 1
                WHEN ws.department_id = e.department_id THEN 2
                ELSE 3
              END AS prioritas
       FROM work_schedules ws
       WHERE ws.deleted_at IS NULL AND ws.is_active = true
         AND (ws.id = e.work_schedule_id
              OR ws.department_id = e.department_id
              OR ws.department_id IS NULL)
       ORDER BY prioritas ASC
       LIMIT 1
     ) j ON true
     WHERE e.id = $1::uuid AND e.deleted_at IS NULL`,
    [employee_id],
  );

  return result.rows[0] ?? null;
}

export async function resolveForAllActive(): Promise<
  { employee_id: string; schedule: WorkSchedule }[]
> {
  const result = await pool.query<WorkSchedule & { employee_id: string }>(
    `SELECT e.id AS employee_id, ${SCHEDULE_COLUMNS}
     FROM employees e
     JOIN LATERAL (
       SELECT ws.*,
              CASE
                WHEN ws.id = e.work_schedule_id THEN 1
                WHEN ws.department_id = e.department_id THEN 2
                ELSE 3
              END AS prioritas
       FROM work_schedules ws
       WHERE ws.deleted_at IS NULL AND ws.is_active = true
         AND (ws.id = e.work_schedule_id
              OR ws.department_id = e.department_id
              OR ws.department_id IS NULL)
       ORDER BY prioritas ASC
       LIMIT 1
     ) j ON true
     WHERE e.deleted_at IS NULL AND e.is_active = true
       AND e.employment_status <> 'resigned'::employment_status
     ORDER BY e.employee_number ASC`,
  );

  return result.rows.map(({ employee_id, ...schedule }) => ({
    employee_id,
    schedule: schedule as WorkSchedule,
  }));
}

export async function createSchedule(
  data: WorkScheduleInput,
): Promise<WorkSchedule> {
  const result = await pool.query<WorkSchedule>(
    `INSERT INTO work_schedules
       (name, department_id, start_time, end_time, late_tolerance_minutes,
        absent_cutoff_time, works_monday, works_tuesday, works_wednesday,
        works_thursday, works_friday, works_saturday, works_sunday)
     VALUES ($1, $2::uuid,
             COALESCE($3::time, '08:00'), COALESCE($4::time, '18:00'),
             COALESCE($5::int, 5), COALESCE($6::time, '18:00'),
             COALESCE($7::boolean, true), COALESCE($8::boolean, true),
             COALESCE($9::boolean, true), COALESCE($10::boolean, true),
             COALESCE($11::boolean, true), COALESCE($12::boolean, false),
             COALESCE($13::boolean, false))
     RETURNING ${COLUMNS}`,
    [
      data.name,
      data.department_id ?? null,
      data.start_time ?? null,
      data.end_time ?? null,
      data.late_tolerance_minutes ?? null,
      data.absent_cutoff_time ?? null,
      data.works_monday ?? null,
      data.works_tuesday ?? null,
      data.works_wednesday ?? null,
      data.works_thursday ?? null,
      data.works_friday ?? null,
      data.works_saturday ?? null,
      data.works_sunday ?? null,
    ],
  );

  const schedule = result.rows[0];
  if (!schedule) {
    throw new Error("Gagal menyimpan jadwal kerja");
  }

  return schedule;
}

export async function updateSchedule(
  id: string,
  data: Partial<WorkScheduleInput>,
): Promise<WorkSchedule | null> {
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

  const result = await pool.query<WorkSchedule>(
    `UPDATE work_schedules SET ${fields.join(", ")}
     WHERE id = $${values.length}::uuid AND deleted_at IS NULL
     RETURNING ${COLUMNS}`,
    values,
  );

  return result.rows[0] ?? null;
}

export async function softDeleteSchedule(
  id: string,
): Promise<WorkSchedule | null> {
  const result = await pool.query<WorkSchedule>(
    `UPDATE work_schedules
     SET deleted_at = now(), is_active = false, updated_at = now()
     WHERE id = $1::uuid AND deleted_at IS NULL
     RETURNING ${COLUMNS}`,
    [id],
  );

  return result.rows[0] ?? null;
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
