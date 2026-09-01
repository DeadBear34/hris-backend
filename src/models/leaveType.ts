import { pool } from "../config/databaseConnection.js";
import type { EmployeeGender } from "./employee.js";

export interface LeaveType {
  id: string;
  code: string;
  name: string;
  default_quota: number | null;
  deducts_balance: boolean;
  is_paid: boolean;
  requires_attachment: boolean;
  attachment_required_after: number | null;
  max_days_per_request: number | null;
  min_notice_days: number;
  gender_restriction: EmployeeGender | null;
  is_active: boolean;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface LeaveTypeInput {
  code: string;
  name: string;
  default_quota?: number | null;
  deducts_balance?: boolean;
  is_paid?: boolean;
  requires_attachment?: boolean;
  attachment_required_after?: number | null;
  max_days_per_request?: number | null;
  min_notice_days?: number;
  gender_restriction?: EmployeeGender | null;
  is_active?: boolean;
}

const UPDATABLE_COLUMNS = [
  "code",
  "name",
  "default_quota",
  "deducts_balance",
  "is_paid",
  "requires_attachment",
  "attachment_required_after",
  "max_days_per_request",
  "min_notice_days",
  "gender_restriction",
  "is_active",
] as const;

const COLUMN_CAST: Record<string, string> = {
  default_quota: "::numeric",
  attachment_required_after: "::int",
  max_days_per_request: "::int",
  min_notice_days: "::int",
  gender_restriction: "::employee_gender",
};

const COLUMNS = `id, code, name, default_quota::float8 AS default_quota,
  deducts_balance, is_paid, requires_attachment, attachment_required_after,
  max_days_per_request, min_notice_days, gender_restriction, is_active,
  deleted_at, created_at, updated_at`;

export async function findAll(hanyaAktif = false): Promise<LeaveType[]> {
  const where = hanyaAktif
    ? "WHERE deleted_at IS NULL AND is_active = true"
    : "WHERE deleted_at IS NULL";

  const result = await pool.query<LeaveType>(
    `SELECT ${COLUMNS} FROM leave_types ${where} ORDER BY name ASC`,
  );

  return result.rows;
}

export async function findById(id: string): Promise<LeaveType | null> {
  const result = await pool.query<LeaveType>(
    `SELECT ${COLUMNS} FROM leave_types WHERE id = $1::uuid AND deleted_at IS NULL`,
    [id],
  );

  return result.rows[0] ?? null;
}

export async function findByCode(code: string): Promise<LeaveType | null> {
  const result = await pool.query<LeaveType>(
    `SELECT ${COLUMNS} FROM leave_types WHERE code = $1 AND deleted_at IS NULL`,
    [code],
  );

  return result.rows[0] ?? null;
}

export async function createLeaveType(
  data: LeaveTypeInput,
): Promise<LeaveType> {
  const result = await pool.query<LeaveType>(
    `INSERT INTO leave_types
       (code, name, default_quota, deducts_balance, is_paid,
        requires_attachment, attachment_required_after, max_days_per_request,
        min_notice_days, gender_restriction)
     VALUES ($1, $2, $3::numeric,
             COALESCE($4::boolean, true), COALESCE($5::boolean, true),
             COALESCE($6::boolean, false), $7::int, $8::int,
             COALESCE($9::int, 0), $10::employee_gender)
     RETURNING ${COLUMNS}`,
    [
      data.code,
      data.name,
      data.default_quota ?? null,
      data.deducts_balance ?? null,
      data.is_paid ?? null,
      data.requires_attachment ?? null,
      data.attachment_required_after ?? null,
      data.max_days_per_request ?? null,
      data.min_notice_days ?? null,
      data.gender_restriction ?? null,
    ],
  );

  const leaveType = result.rows[0];
  if (!leaveType) {
    throw new Error("Gagal menyimpan jenis cuti");
  }

  return leaveType;
}

export async function updateLeaveType(
  id: string,
  data: Partial<LeaveTypeInput>,
): Promise<LeaveType | null> {
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

  const result = await pool.query<LeaveType>(
    `UPDATE leave_types SET ${fields.join(", ")}
     WHERE id = $${values.length}::uuid AND deleted_at IS NULL
     RETURNING ${COLUMNS}`,
    values,
  );

  return result.rows[0] ?? null;
}

export async function softDeleteLeaveType(
  id: string,
): Promise<LeaveType | null> {
  const result = await pool.query<LeaveType>(
    `UPDATE leave_types
     SET deleted_at = now(), is_active = false, updated_at = now()
     WHERE id = $1::uuid AND deleted_at IS NULL
     RETURNING ${COLUMNS}`,
    [id],
  );

  return result.rows[0] ?? null;
}

export async function countLeaveRequests(id: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    "SELECT COUNT(*) FROM leave_requests WHERE leave_type_id = $1::uuid",
    [id],
  );

  return Number(result.rows[0]?.count ?? 0);
}
