import { pool } from "../config/databaseConnection.js";
import type { Executor } from "./user.js";

export type LeaveTransactionType =
  "accrual" | "hold" | "deduction" | "refund" | "adjustment";

export interface LeaveBalanceTransaction {
  id: string;
  employee_id: string;
  leave_type_id: string;
  period_year: number;
  amount: number;
  type: LeaveTransactionType;
  leave_request_id: string | null;
  note: string | null;
  created_by: string | null;
  created_at: Date;
}

export interface LedgerEntry extends LeaveBalanceTransaction {
  leave_type_code: string;
  leave_type_name: string;
}

export interface CreateTransactionInput {
  employee_id: string;
  leave_type_id: string;
  period_year: number;
  amount: number;
  type: LeaveTransactionType;
  leave_request_id?: string | null;
  note?: string | null;
  created_by?: string | null;
}

export interface BalanceSummary {
  leave_type_id: string;
  leave_type_code: string;
  leave_type_name: string;
  period_year: number;
  balance: number;
}

export interface ListLedgerParams {
  employee_id: string;
  period_year?: number;
  leave_type_id?: string;
  page: number;
  limit: number;
}

const KOLOM = `id, employee_id, leave_type_id, period_year,
  amount::float8 AS amount, type, leave_request_id, note,
  created_by, created_at`;

export async function createTransaction(
  db: Executor,
  data: CreateTransactionInput,
): Promise<LeaveBalanceTransaction> {
  const result = await db.query<LeaveBalanceTransaction>(
    `INSERT INTO leave_balance_transactions
       (employee_id, leave_type_id, period_year, amount, type,
        leave_request_id, note, created_by)
     VALUES ($1::uuid, $2::uuid, $3::int, $4::numeric,
             $5::leave_transaction_type, $6::uuid, $7, $8::uuid)
     RETURNING ${KOLOM}`,
    [
      data.employee_id,
      data.leave_type_id,
      data.period_year,
      data.amount,
      data.type,
      data.leave_request_id ?? null,
      data.note ?? null,
      data.created_by ?? null,
    ],
  );

  const transaksi = result.rows[0];
  if (!transaksi) {
    throw new Error("Gagal menyimpan transaksi saldo cuti");
  }

  return transaksi;
}

export async function summaryFor(
  employee_id: string,
  period_year: number,
): Promise<BalanceSummary[]> {
  const result = await pool.query<BalanceSummary>(
    `SELECT lt.id AS leave_type_id, lt.code AS leave_type_code,
            lt.name AS leave_type_name, $2::int AS period_year,
            COALESCE(SUM(t.amount), 0)::float8 AS balance
     FROM leave_types lt
     LEFT JOIN leave_balance_transactions t
       ON t.leave_type_id = lt.id
      AND t.employee_id = $1::uuid
      AND t.period_year = $2::int
     WHERE lt.deleted_at IS NULL AND lt.is_active = true
       AND lt.deducts_balance = true
     GROUP BY lt.id, lt.code, lt.name
     ORDER BY lt.name ASC`,
    [employee_id, period_year],
  );

  return result.rows;
}

export async function balanceFor(
  employee_id: string,
  leave_type_id: string,
  period_year: number,
): Promise<number> {
  const result = await pool.query<{ balance: string }>(
    `SELECT COALESCE(SUM(amount), 0)::float8 AS balance
     FROM leave_balance_transactions
     WHERE employee_id = $1::uuid AND leave_type_id = $2::uuid
       AND period_year = $3::int`,
    [employee_id, leave_type_id, period_year],
  );

  return Number(result.rows[0]?.balance ?? 0);
}

export async function listLedger(
  params: ListLedgerParams,
): Promise<{ rows: LedgerEntry[]; total: number }> {
  const conditions: string[] = ["t.employee_id = $1::uuid"];
  const values: unknown[] = [params.employee_id];

  if (params.period_year !== undefined) {
    values.push(params.period_year);
    conditions.push(`t.period_year = $${values.length}::int`);
  }

  if (params.leave_type_id) {
    values.push(params.leave_type_id);
    conditions.push(`t.leave_type_id = $${values.length}::uuid`);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  const from = `FROM leave_balance_transactions t
    JOIN leave_types lt ON lt.id = t.leave_type_id ${where}`;

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) ${from}`,
    values,
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  const offset = (params.page - 1) * params.limit;
  values.push(params.limit, offset);

  const dataResult = await pool.query<LedgerEntry>(
    `SELECT t.id, t.employee_id, t.leave_type_id, t.period_year,
            t.amount::float8 AS amount, t.type, t.leave_request_id, t.note,
            t.created_by, t.created_at,
            lt.code AS leave_type_code, lt.name AS leave_type_name
     ${from}
     ORDER BY t.created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );

  return { rows: dataResult.rows, total };
}

export async function convertHoldToDeduction(
  db: Executor,
  leave_request_id: string,
): Promise<LeaveBalanceTransaction[]> {
  const result = await db.query<LeaveBalanceTransaction>(
    `UPDATE leave_balance_transactions
     SET type = 'deduction'::leave_transaction_type
     WHERE leave_request_id = $1::uuid
       AND type = 'hold'::leave_transaction_type
     RETURNING ${KOLOM}`,
    [leave_request_id],
  );

  return result.rows;
}

export async function findByRequest(
  leave_request_id: string,
): Promise<LeaveBalanceTransaction[]> {
  const result = await pool.query<LeaveBalanceTransaction>(
    `SELECT ${KOLOM} FROM leave_balance_transactions
     WHERE leave_request_id = $1::uuid
     ORDER BY created_at ASC`,
    [leave_request_id],
  );

  return result.rows;
}
