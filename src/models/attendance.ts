import { pool } from "../config/databaseConnection.js";
import type { Executor } from "./user.js";
import type { IsoDate } from "../helpers/timezone.js";

export type AttendanceStatus =
  "present" | "late" | "absent" | "leave" | "holiday";

export interface Attendance {
  id: string;
  employee_id: string;
  attendance_date: IsoDate;
  check_in_at: Date | null;
  check_out_at: Date | null;
  status: AttendanceStatus;
  late_minutes: number;
  work_minutes: number | null;
  leave_request_id: string | null;
  note: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface AttendanceDetail extends Attendance {
  employee_name: string;
  employee_number: string;
  department_name: string | null;
  position_name: string | null;
}

export interface CheckInInput {
  employee_id: string;
  attendance_date: IsoDate;
  check_in_at: Date;
  status: Extract<AttendanceStatus, "present" | "late">;
  late_minutes: number;
  note?: string | null;
}

export interface OfflineLogParams {
  employee_id?: string;
  department_id?: string;
  start_date?: IsoDate;
  end_date?: IsoDate;
  min_delay_minutes: number;
  page: number;
  limit: number;
}

export interface OfflineLogRow extends AttendanceDetail {
  sync_delay_minutes: number;
}

export interface ListAttendanceParams {
  employee_id?: string;
  manager_id?: string;
  department_id?: string;
  status?: AttendanceStatus;
  search?: string;
  start_date?: IsoDate;
  end_date?: IsoDate;
  page: number;
  limit: number;
}

export interface AttendanceSummary {
  present: number;
  late: number;
  absent: number;
  leave: number;
  holiday: number;
  total_late_minutes: number;
  total_work_minutes: number;
}

export interface MonthlyReportRow {
  employee_id: string;
  employee_number: string;
  employee_name: string;
  department_name: string | null;
  position_name: string | null;
  present: number;
  late: number;
  absent: number;
  leave: number;
  holiday: number;
  total_late_minutes: number;
  total_work_minutes: number;
}

const KOLOM_NAMA = [
  "id",
  "employee_id",
  "attendance_date",
  "check_in_at",
  "check_out_at",
  "status",
  "late_minutes",
  "work_minutes",
  "leave_request_id",
  "note",
  "created_at",
  "updated_at",
] as const;

function daftarKolom(prefiks = ""): string {
  const awalan = prefiks ? `${prefiks}.` : "";

  return KOLOM_NAMA.map((kolom) =>
    kolom === "attendance_date"
      ? `${awalan}attendance_date::text AS attendance_date`
      : `${awalan}${kolom}`,
  ).join(", ");
}

const KOLOM = daftarKolom();
const KOLOM_ABSENSI = daftarKolom("a");

export async function findByEmployeeAndDate(
  employee_id: string,
  attendance_date: IsoDate,
  db: Executor = pool,
): Promise<Attendance | null> {
  const result = await db.query<Attendance>(
    `SELECT ${KOLOM} FROM attendances
     WHERE employee_id = $1::uuid AND attendance_date = $2::date`,
    [employee_id, attendance_date],
  );

  return result.rows[0] ?? null;
}

export async function findById(id: string): Promise<Attendance | null> {
  const result = await pool.query<Attendance>(
    `SELECT ${KOLOM} FROM attendances WHERE id = $1::uuid`,
    [id],
  );

  return result.rows[0] ?? null;
}

export async function createCheckIn(
  data: CheckInInput,
  db: Executor = pool,
): Promise<Attendance> {
  const result = await db.query<Attendance>(
    `INSERT INTO attendances
       (employee_id, attendance_date, check_in_at, status, late_minutes, note)
     VALUES ($1::uuid, $2::date, $3::timestamptz, $4::attendance_status,
             $5::int, $6)
     RETURNING ${KOLOM}`,
    [
      data.employee_id,
      data.attendance_date,
      data.check_in_at,
      data.status,
      data.late_minutes,
      data.note ?? null,
    ],
  );

  const attendance = result.rows[0];
  if (!attendance) {
    throw new Error("Gagal menyimpan absensi masuk");
  }

  return attendance;
}

export async function setCheckOut(
  id: string,
  check_out_at: Date,
  work_minutes: number,
  db: Executor = pool,
): Promise<Attendance | null> {
  const result = await db.query<Attendance>(
    `UPDATE attendances
     SET check_out_at = $2::timestamptz, work_minutes = $3::int,
         updated_at = now()
     WHERE id = $1::uuid AND check_out_at IS NULL AND check_in_at IS NOT NULL
     RETURNING ${KOLOM}`,
    [id, check_out_at, work_minutes],
  );

  return result.rows[0] ?? null;
}

function susunFilter(params: ListAttendanceParams, values: unknown[]): string {
  const conditions: string[] = ["e.deleted_at IS NULL"];

  if (params.employee_id) {
    values.push(params.employee_id);
    conditions.push(`a.employee_id = $${values.length}::uuid`);
  }

  if (params.manager_id) {
    values.push(params.manager_id);
    conditions.push(`e.manager_id = $${values.length}::uuid`);
  }

  if (params.department_id) {
    values.push(params.department_id);
    conditions.push(`e.department_id = $${values.length}::uuid`);
  }

  if (params.status) {
    values.push(params.status);
    conditions.push(`a.status = $${values.length}::attendance_status`);
  }

  if (params.search) {
    values.push(`%${params.search}%`);
    conditions.push(
      `(e.full_name ILIKE $${values.length} OR e.employee_number ILIKE $${values.length})`,
    );
  }

  if (params.start_date) {
    values.push(params.start_date);
    conditions.push(`a.attendance_date >= $${values.length}::date`);
  }

  if (params.end_date) {
    values.push(params.end_date);
    conditions.push(`a.attendance_date <= $${values.length}::date`);
  }

  return `WHERE ${conditions.join(" AND ")}`;
}

export async function listAttendances(
  params: ListAttendanceParams,
): Promise<{ rows: AttendanceDetail[]; total: number }> {
  const values: unknown[] = [];
  const where = susunFilter(params, values);

  const from = `FROM attendances a
     JOIN employees e ON e.id = a.employee_id
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN positions p ON p.id = e.position_id`;

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) ${from} ${where}`,
    values,
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  const offset = (params.page - 1) * params.limit;
  values.push(params.limit, offset);

  const dataResult = await pool.query<AttendanceDetail>(
    `SELECT ${KOLOM_ABSENSI},
            e.full_name AS employee_name, e.employee_number,
            d.name AS department_name, p.name AS position_name
     ${from} ${where}
     ORDER BY a.attendance_date DESC, e.employee_number ASC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );

  return { rows: dataResult.rows, total };
}

export async function summaryFor(
  employee_id: string,
  start_date: IsoDate,
  end_date: IsoDate,
): Promise<AttendanceSummary> {
  const result = await pool.query<Record<string, string>>(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'present'::attendance_status) AS present,
       COUNT(*) FILTER (WHERE status = 'late'::attendance_status)    AS late,
       COUNT(*) FILTER (WHERE status = 'absent'::attendance_status)  AS absent,
       COUNT(*) FILTER (WHERE status = 'leave'::attendance_status)   AS leave,
       COUNT(*) FILTER (WHERE status = 'holiday'::attendance_status) AS holiday,
       COALESCE(SUM(late_minutes), 0) AS total_late_minutes,
       COALESCE(SUM(work_minutes), 0) AS total_work_minutes
     FROM attendances
     WHERE employee_id = $1::uuid
       AND attendance_date BETWEEN $2::date AND $3::date`,
    [employee_id, start_date, end_date],
  );

  const baris = result.rows[0] ?? {};

  return {
    present: Number(baris.present ?? 0),
    late: Number(baris.late ?? 0),
    absent: Number(baris.absent ?? 0),
    leave: Number(baris.leave ?? 0),
    holiday: Number(baris.holiday ?? 0),
    total_late_minutes: Number(baris.total_late_minutes ?? 0),
    total_work_minutes: Number(baris.total_work_minutes ?? 0),
  };
}

export async function monthlyReport(
  start_date: IsoDate,
  end_date: IsoDate,
  department_id?: string,
): Promise<MonthlyReportRow[]> {
  const values: unknown[] = [start_date, end_date];
  let filterDepartemen = "";

  if (department_id) {
    values.push(department_id);
    filterDepartemen = `AND e.department_id = $${values.length}::uuid`;
  }

  const result = await pool.query<MonthlyReportRow>(
    `SELECT e.id AS employee_id, e.employee_number,
            e.full_name AS employee_name,
            d.name AS department_name, p.name AS position_name,
            COUNT(a.id) FILTER (WHERE a.status = 'present'::attendance_status) AS present,
            COUNT(a.id) FILTER (WHERE a.status = 'late'::attendance_status)    AS late,
            COUNT(a.id) FILTER (WHERE a.status = 'absent'::attendance_status)  AS absent,
            COUNT(a.id) FILTER (WHERE a.status = 'leave'::attendance_status)   AS leave,
            COUNT(a.id) FILTER (WHERE a.status = 'holiday'::attendance_status) AS holiday,
            COALESCE(SUM(a.late_minutes), 0) AS total_late_minutes,
            COALESCE(SUM(a.work_minutes), 0) AS total_work_minutes
     FROM employees e
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN positions p ON p.id = e.position_id
     LEFT JOIN attendances a ON a.employee_id = e.id
          AND a.attendance_date BETWEEN $1::date AND $2::date
     WHERE e.deleted_at IS NULL AND e.is_active = true ${filterDepartemen}
     GROUP BY e.id, e.employee_number, e.full_name, d.name, p.name
     ORDER BY e.employee_number ASC`,
    values,
  );

  return result.rows.map((row) => ({
    ...row,
    present: Number(row.present),
    late: Number(row.late),
    absent: Number(row.absent),
    leave: Number(row.leave),
    holiday: Number(row.holiday),
    total_late_minutes: Number(row.total_late_minutes),
    total_work_minutes: Number(row.total_work_minutes),
  }));
}

export interface CorrectionInput {
  status: AttendanceStatus;
  check_in_at?: Date | null;
  check_out_at?: Date | null;
  late_minutes: number;
  work_minutes?: number | null;
  note: string;
}

export async function correctAttendance(
  id: string,
  data: CorrectionInput,
  db: Executor = pool,
): Promise<Attendance | null> {
  const result = await db.query<Attendance>(
    `UPDATE attendances
     SET status = $2::attendance_status,
         check_in_at = $3::timestamptz,
         check_out_at = $4::timestamptz,
         late_minutes = $5::int,
         work_minutes = $6::int,
         note = $7,
         updated_at = now()
     WHERE id = $1::uuid
     RETURNING ${KOLOM}`,
    [
      id,
      data.status,
      data.check_in_at ?? null,
      data.check_out_at ?? null,
      data.late_minutes,
      data.work_minutes ?? null,
      data.note,
    ],
  );

  return result.rows[0] ?? null;
}

export async function upsertLeaveDays(
  db: Executor,
  employee_id: string,
  dates: IsoDate[],
  leave_request_id: string,
): Promise<number> {
  if (dates.length === 0) return 0;

  const result = await db.query(
    `INSERT INTO attendances
       (employee_id, attendance_date, status, late_minutes, leave_request_id)
     SELECT $1::uuid, tanggal::date, 'leave'::attendance_status, 0, $3::uuid
     FROM unnest($2::date[]) AS tanggal
     ON CONFLICT (employee_id, attendance_date) DO UPDATE
     SET status = 'leave'::attendance_status,
         check_in_at = NULL,
         check_out_at = NULL,
         late_minutes = 0,
         work_minutes = NULL,
         leave_request_id = EXCLUDED.leave_request_id,
         updated_at = now()`,
    [employee_id, dates, leave_request_id],
  );

  return result.rowCount ?? 0;
}

export async function deleteLeaveDays(
  db: Executor,
  leave_request_id: string,
): Promise<number> {
  const result = await db.query(
    `DELETE FROM attendances
     WHERE leave_request_id = $1::uuid
       AND status = 'leave'::attendance_status`,
    [leave_request_id],
  );

  return result.rowCount ?? 0;
}

export async function findEmployeeIdsOnDate(
  attendance_date: IsoDate,
  db: Executor = pool,
): Promise<string[]> {
  const result = await db.query<{ employee_id: string }>(
    `SELECT employee_id FROM attendances WHERE attendance_date = $1::date`,
    [attendance_date],
  );

  return result.rows.map((row) => row.employee_id);
}

export async function findApprovedLeaveOn(
  attendance_date: IsoDate,
  db: Executor = pool,
): Promise<{ employee_id: string; leave_request_id: string }[]> {
  const result = await db.query<{
    employee_id: string;
    leave_request_id: string;
  }>(
    `SELECT employee_id, id AS leave_request_id
     FROM leave_requests
     WHERE status = 'approved'::leave_status
       AND $1::date BETWEEN start_date AND end_date`,
    [attendance_date],
  );

  return result.rows;
}

export interface BarisPenanda {
  employee_id: string;
  status: Extract<AttendanceStatus, "absent" | "leave" | "holiday">;
  leave_request_id?: string | null;
  note?: string | null;
}

export async function insertMarkers(
  db: Executor,
  attendance_date: IsoDate,
  rows: BarisPenanda[],
): Promise<number> {
  if (rows.length === 0) return 0;

  const result = await db.query(
    `INSERT INTO attendances
       (employee_id, attendance_date, status, late_minutes, leave_request_id, note)
     SELECT baris.employee_id::uuid, $2::date,
            baris.status::attendance_status, 0,
            baris.leave_request_id::uuid, baris.note
     FROM unnest($1::text[], $3::text[], $4::text[], $5::text[])
       AS baris(employee_id, status, leave_request_id, note)
     ON CONFLICT (employee_id, attendance_date) DO NOTHING`,
    [
      rows.map((row) => row.employee_id),
      attendance_date,
      rows.map((row) => row.status),
      rows.map((row) => row.leave_request_id ?? null),
      rows.map((row) => row.note ?? null),
    ],
  );

  return result.rowCount ?? 0;
}

export async function listOfflineSync(
  params: OfflineLogParams,
): Promise<{ rows: OfflineLogRow[]; total: number }> {
  const values: unknown[] = [params.min_delay_minutes];
  const conditions: string[] = [
    "e.deleted_at IS NULL",
    "a.check_in_at IS NOT NULL",
    "a.created_at - a.check_in_at > make_interval(mins => $1::int)",
  ];

  if (params.employee_id) {
    values.push(params.employee_id);
    conditions.push(`a.employee_id = $${values.length}::uuid`);
  }

  if (params.department_id) {
    values.push(params.department_id);
    conditions.push(`e.department_id = $${values.length}::uuid`);
  }

  if (params.start_date) {
    values.push(params.start_date);
    conditions.push(`a.attendance_date >= $${values.length}::date`);
  }

  if (params.end_date) {
    values.push(params.end_date);
    conditions.push(`a.attendance_date <= $${values.length}::date`);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  const from = `FROM attendances a
     JOIN employees e ON e.id = a.employee_id
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN positions p ON p.id = e.position_id`;

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) ${from} ${where}`,
    values,
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  const offset = (params.page - 1) * params.limit;
  values.push(params.limit, offset);

  const dataResult = await pool.query<OfflineLogRow>(
    `SELECT ${KOLOM_ABSENSI},
            e.full_name AS employee_name, e.employee_number,
            d.name AS department_name, p.name AS position_name,
            (EXTRACT(EPOCH FROM (a.created_at - a.check_in_at)) / 60)::int
              AS sync_delay_minutes
     ${from} ${where}
     ORDER BY a.created_at - a.check_in_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );

  return { rows: dataResult.rows, total };
}
