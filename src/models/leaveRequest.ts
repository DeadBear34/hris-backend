import { pool } from "../config/databaseConnection.js";
import { Conflict } from "../helpers/appError.js";
import type { LeaveStatus } from "../helpers/leaveStatus.js";
import type { Executor } from "./user.js";

const KODE_EXCLUSION_VIOLATION = "23P01";

export interface LeaveRequest {
  id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string | null;
  status: LeaveStatus;
  approver_id: string | null;
  decided_by: string | null;
  decided_at: Date | null;
  decision_note: string | null;
  cancelled_at: Date | null;
  cancelled_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface LeaveRequestDetail extends LeaveRequest {
  employee_name: string;
  employee_number: string;
  leave_type_code: string;
  leave_type_name: string;
  approver_name: string | null;
  decided_by_name: string | null;
}

export interface CreateLeaveRequestInput {
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  total_days: number;
  reason?: string | null;
  approver_id: string | null;
}

export interface ListLeaveRequestParams {
  employee_id?: string;
  approver_id?: string;
  include_unassigned?: boolean;
  leave_type_id?: string;
  status?: LeaveStatus;
  start_date?: string;
  end_date?: string;
  page: number;
  limit: number;
}

const KOLOM = `lr.id, lr.employee_id, lr.leave_type_id,
  lr.start_date::text AS start_date, lr.end_date::text AS end_date,
  lr.total_days::float8 AS total_days, lr.reason, lr.status,
  lr.approver_id, lr.decided_by, lr.decided_at, lr.decision_note,
  lr.cancelled_at, lr.cancelled_by, lr.created_at, lr.updated_at`;

const KOLOM_DETAIL = `${KOLOM},
  e.full_name AS employee_name, e.employee_number,
  lt.code AS leave_type_code, lt.name AS leave_type_name,
  a.full_name AS approver_name, d.full_name AS decided_by_name`;

const JOIN_DETAIL = `
  FROM leave_requests lr
  JOIN employees e        ON e.id = lr.employee_id
  JOIN leave_types lt     ON lt.id = lr.leave_type_id
  LEFT JOIN employees a   ON a.id = lr.approver_id
  LEFT JOIN employees d   ON d.id = lr.decided_by`;

export async function listRequests(
  params: ListLeaveRequestParams,
): Promise<{ rows: LeaveRequestDetail[]; total: number }> {
  const conditions: string[] = ["TRUE"];
  const values: unknown[] = [];

  if (params.employee_id) {
    values.push(params.employee_id);
    conditions.push(`lr.employee_id = $${values.length}::uuid`);
  }

  if (params.approver_id) {
    values.push(params.approver_id);

    conditions.push(
      params.include_unassigned
        ? `(lr.approver_id = $${values.length}::uuid OR lr.approver_id IS NULL)`
        : `lr.approver_id = $${values.length}::uuid`,
    );
  }

  if (params.leave_type_id) {
    values.push(params.leave_type_id);
    conditions.push(`lr.leave_type_id = $${values.length}::uuid`);
  }

  if (params.status) {
    values.push(params.status);
    conditions.push(`lr.status = $${values.length}::leave_status`);
  }

  if (params.start_date) {
    values.push(params.start_date);
    conditions.push(`lr.end_date >= $${values.length}::date`);
  }

  if (params.end_date) {
    values.push(params.end_date);
    conditions.push(`lr.start_date <= $${values.length}::date`);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) ${JOIN_DETAIL} ${where}`,
    values,
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  const offset = (params.page - 1) * params.limit;
  values.push(params.limit, offset);

  const dataResult = await pool.query<LeaveRequestDetail>(
    `SELECT ${KOLOM_DETAIL} ${JOIN_DETAIL} ${where}
     ORDER BY lr.created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );

  return { rows: dataResult.rows, total };
}

export async function findById(id: string): Promise<LeaveRequest | null> {
  const result = await pool.query<LeaveRequest>(
    `SELECT ${KOLOM} FROM leave_requests lr WHERE lr.id = $1::uuid`,
    [id],
  );

  return result.rows[0] ?? null;
}

export async function findDetailById(
  id: string,
): Promise<LeaveRequestDetail | null> {
  const result = await pool.query<LeaveRequestDetail>(
    `SELECT ${KOLOM_DETAIL} ${JOIN_DETAIL} WHERE lr.id = $1::uuid`,
    [id],
  );

  return result.rows[0] ?? null;
}

export async function findOverlapping(
  employee_id: string,
  start_date: string,
  end_date: string,
): Promise<LeaveRequest | null> {
  const result = await pool.query<LeaveRequest>(
    `SELECT ${KOLOM} FROM leave_requests lr
     WHERE lr.employee_id = $1::uuid
       AND lr.status IN ('pending', 'approved')
       AND lr.start_date <= $3::date
       AND lr.end_date >= $2::date
     ORDER BY lr.start_date ASC
     LIMIT 1`,
    [employee_id, start_date, end_date],
  );

  return result.rows[0] ?? null;
}

export async function createRequest(
  db: Executor,
  data: CreateLeaveRequestInput,
): Promise<LeaveRequest> {
  try {
    const result = await db.query<LeaveRequest>(
      `INSERT INTO leave_requests
         (employee_id, leave_type_id, start_date, end_date, total_days,
          reason, approver_id)
       VALUES ($1::uuid, $2::uuid, $3::date, $4::date, $5::numeric,
               $6, $7::uuid)
       RETURNING ${KOLOM.replaceAll("lr.", "")}`,
      [
        data.employee_id,
        data.leave_type_id,
        data.start_date,
        data.end_date,
        data.total_days,
        data.reason ?? null,
        data.approver_id,
      ],
    );

    const request = result.rows[0];
    if (!request) {
      throw new Error("Gagal menyimpan pengajuan cuti");
    }

    return request;
  } catch (err) {
    if ((err as { code?: string }).code === KODE_EXCLUSION_VIOLATION) {
      throw Conflict(
        "Kamu sudah punya pengajuan cuti pada rentang tanggal tersebut",
      );
    }

    throw err;
  }
}

export async function approveRequest(
  db: Executor,
  id: string,
  decided_by: string,
  decision_note: string | null,
): Promise<LeaveRequest | null> {
  const result = await db.query<LeaveRequest>(
    `UPDATE leave_requests
     SET status = 'approved'::leave_status, decided_by = $2::uuid,
         decided_at = now(), decision_note = $3, updated_at = now()
     WHERE id = $1::uuid AND status = 'pending'::leave_status
     RETURNING ${KOLOM.replaceAll("lr.", "")}`,
    [id, decided_by, decision_note],
  );

  return result.rows[0] ?? null;
}

export async function rejectRequest(
  db: Executor,
  id: string,
  decided_by: string,
  decision_note: string | null,
): Promise<LeaveRequest | null> {
  const result = await db.query<LeaveRequest>(
    `UPDATE leave_requests
     SET status = 'rejected'::leave_status, decided_by = $2::uuid,
         decided_at = now(), decision_note = $3, updated_at = now()
     WHERE id = $1::uuid AND status = 'pending'::leave_status
     RETURNING ${KOLOM.replaceAll("lr.", "")}`,
    [id, decided_by, decision_note],
  );

  return result.rows[0] ?? null;
}

export async function cancelRequest(
  db: Executor,
  id: string,
  cancelled_by: string,
): Promise<LeaveRequest | null> {
  const result = await db.query<LeaveRequest>(
    `UPDATE leave_requests
     SET status = 'cancelled'::leave_status, cancelled_by = $2::uuid,
         cancelled_at = now(), updated_at = now()
     WHERE id = $1::uuid
       AND status IN ('pending'::leave_status, 'approved'::leave_status)
     RETURNING ${KOLOM.replaceAll("lr.", "")}`,
    [id, cancelled_by],
  );

  return result.rows[0] ?? null;
}
