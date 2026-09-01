import { pool } from "../config/databaseConnection.js";
import type { Executor } from "./user.js";
import type { AttendanceSource } from "./attendance.js";
import type { IsoDate } from "../helpers/timezone.js";

export type AttendanceEventKind = "check_in" | "check_out";

export interface AttendanceEvent {
  id: string;
  employee_id: string;
  kind: AttendanceEventKind;
  occurred_at: Date;
  received_at: Date;
  source: AttendanceSource;
  attendance_id: string | null;
  rejection_reason: string | null;
  note: string | null;
  created_at: Date;
}

export interface AttendanceEventDetail extends AttendanceEvent {
  employee_name: string;
  employee_number: string;
  delay_seconds: number;
}

export interface RecordEventInput {
  employee_id: string;
  kind: AttendanceEventKind;
  occurred_at: Date;
  received_at: Date;
  source: AttendanceSource;
  note?: string | null;
}

export interface ListEventParams {
  employee_id?: string;
  kind?: AttendanceEventKind;
  source?: AttendanceSource;
  only_rejected?: boolean;
  start_date?: IsoDate;
  end_date?: IsoDate;
  page: number;
  limit: number;
}

const COLUMN_NAMES = [
  "id",
  "employee_id",
  "kind",
  "occurred_at",
  "received_at",
  "source",
  "attendance_id",
  "rejection_reason",
  "note",
  "created_at",
] as const;

function columnList(prefix = ""): string {
  const dot = prefix ? `${prefix}.` : "";

  return COLUMN_NAMES.map((column) => `${dot}${column}`).join(", ");
}

const COLUMNS = columnList();
const EVENT_COLUMNS = columnList("ev");

export async function recordEvent(
  data: RecordEventInput,
  db: Executor = pool,
): Promise<AttendanceEvent> {
  const result = await db.query<AttendanceEvent>(
    `INSERT INTO attendance_events
       (employee_id, kind, occurred_at, received_at, source, note)
     VALUES ($1::uuid, $2::attendance_event_kind, $3::timestamptz,
             $4::timestamptz, $5::attendance_source, $6)
     RETURNING ${COLUMNS}`,
    [
      data.employee_id,
      data.kind,
      data.occurred_at,
      data.received_at,
      data.source,
      data.note ?? null,
    ],
  );

  const event = result.rows[0];
  if (!event) {
    throw new Error("Gagal mencatat kejadian absensi");
  }

  return event;
}

export async function linkToAttendance(
  id: string,
  attendance_id: string,
  db: Executor = pool,
): Promise<void> {
  await db.query(
    `UPDATE attendance_events SET attendance_id = $2::uuid
     WHERE id = $1::uuid`,
    [id, attendance_id],
  );
}

export async function markRejected(
  id: string,
  rejection_reason: string,
  db: Executor = pool,
): Promise<void> {
  await db.query(
    `UPDATE attendance_events SET rejection_reason = $2
     WHERE id = $1::uuid`,
    [id, rejection_reason],
  );
}

export async function listEvents(
  params: ListEventParams,
): Promise<{ rows: AttendanceEventDetail[]; total: number }> {
  const conditions: string[] = ["e.deleted_at IS NULL"];
  const values: unknown[] = [];

  if (params.employee_id) {
    values.push(params.employee_id);
    conditions.push(`ev.employee_id = $${values.length}::uuid`);
  }

  if (params.kind) {
    values.push(params.kind);
    conditions.push(`ev.kind = $${values.length}::attendance_event_kind`);
  }

  if (params.source) {
    values.push(params.source);
    conditions.push(`ev.source = $${values.length}::attendance_source`);
  }

  if (params.only_rejected) {
    conditions.push("ev.rejection_reason IS NOT NULL");
  }

  if (params.start_date) {
    values.push(params.start_date);
    conditions.push(`ev.occurred_at >= $${values.length}::date`);
  }

  if (params.end_date) {
    values.push(params.end_date);
    conditions.push(`ev.occurred_at < $${values.length}::date + 1`);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  const from = `FROM attendance_events ev
     JOIN employees e ON e.id = ev.employee_id`;

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) ${from} ${where}`,
    values,
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  const offset = (params.page - 1) * params.limit;
  values.push(params.limit, offset);

  const dataResult = await pool.query<AttendanceEventDetail>(
    `SELECT ${EVENT_COLUMNS},
            e.full_name AS employee_name, e.employee_number,
            EXTRACT(EPOCH FROM (ev.received_at - ev.occurred_at))::int
              AS delay_seconds
     ${from} ${where}
     ORDER BY ev.occurred_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );

  return { rows: dataResult.rows, total };
}
