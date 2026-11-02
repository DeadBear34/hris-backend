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

const COLUMNS = `id, employee_id, leave_type_id, period_year,
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
     RETURNING ${COLUMNS}`,
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

  const transaction = result.rows[0];
  if (!transaction) {
    throw new Error("Failed to save leave balance transaction");
  }

  return transaction;
}

// Pasangan karyawan dan jenis cuti yang berhak atas jatah tahunan pada
// periode $2 tetapi belum menerimanya. Jenis cuti harus aktif, memotong
// saldo, dan punya default_quota. Karyawan yang baru bergabung setelah tahun
// tersebut belum berhak. Transaksi adjustment tidak dihitung sebagai jatah,
// karena itu koreksi admin yang berdiri sendiri
const MISSING_ACCRUALS = `
  FROM employees e
  JOIN leave_types lt
    ON lt.deleted_at IS NULL
   AND lt.is_active = true
   AND lt.deducts_balance = true
   AND COALESCE(lt.default_quota, 0) > 0
  WHERE e.id = ANY($1::uuid[])
    AND e.deleted_at IS NULL
    AND (e.join_date IS NULL OR EXTRACT(YEAR FROM e.join_date)::int <= $2::int)
    AND NOT EXISTS (
      SELECT 1 FROM leave_balance_transactions t
      WHERE t.employee_id = e.id
        AND t.leave_type_id = lt.id
        AND t.period_year = $2::int
        AND t.type = 'accrual'::leave_transaction_type
    )`;

export async function hasMissingAccruals(
  employee_id: string,
  period_year: number,
  db: Executor = pool,
): Promise<boolean> {
  const result = await db.query<{ missing: boolean }>(
    `SELECT EXISTS (SELECT 1 ${MISSING_ACCRUALS}) AS missing`,
    [[employee_id], period_year],
  );

  return result.rows[0]?.missing === true;
}

// Pemanggil wajib mengunci baris karyawan lebih dulu (lockEmployeeBalance)
// atau memanggilnya untuk karyawan yang baru dibuat di transaksi yang sama.
// NOT EXISTS saja tidak mencegah dua transaksi bersamaan sama-sama menulis
export async function grantAccruals(
  db: Executor,
  employee_ids: string[],
  period_year: number,
): Promise<number> {
  if (employee_ids.length === 0) return 0;

  const result = await db.query(
    `INSERT INTO leave_balance_transactions
       (employee_id, leave_type_id, period_year, amount, type, note)
     SELECT e.id, lt.id, $2::int, lt.default_quota,
            'accrual'::leave_transaction_type,
            'Annual leave allocation for ' || $2::int
     ${MISSING_ACCRUALS}`,
    [employee_ids, period_year],
  );

  return result.rowCount ?? 0;
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
  db: Executor = pool,
): Promise<number> {
  const result = await db.query<{ balance: string }>(
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
     RETURNING ${COLUMNS}`,
    [leave_request_id],
  );

  return result.rows;
}

// Mengembalikan saldo yang masih tertahan oleh sebuah pengajuan, dihitung
// dari transaksinya sendiri (hold, deduction, dan refund sebelumnya), bukan
// dari pengaturan jenis cuti saat ini. Pengaturan deducts_balance bisa diubah
// HR setelah pengajuan dibuat; yang menentukan adalah apa yang benar-benar
// dipotong. Aman dipanggil ulang: refund yang sudah ada ikut dijumlahkan,
// jadi tidak ada pengembalian ganda
export async function refundRequestBalance(
  db: Executor,
  leave_request_id: string,
  created_by: string,
  note: string,
): Promise<number> {
  const result = await db.query(
    `INSERT INTO leave_balance_transactions
       (employee_id, leave_type_id, period_year, amount, type,
        leave_request_id, note, created_by)
     SELECT employee_id, leave_type_id, period_year, -SUM(amount),
            'refund'::leave_transaction_type, $1::uuid, $3, $2::uuid
     FROM leave_balance_transactions
     WHERE leave_request_id = $1::uuid
       AND type IN ('hold'::leave_transaction_type,
                    'deduction'::leave_transaction_type,
                    'refund'::leave_transaction_type)
     GROUP BY employee_id, leave_type_id, period_year
     HAVING SUM(amount) < 0`,
    [leave_request_id, created_by, note],
  );

  return result.rowCount ?? 0;
}

// Mengunci baris karyawan sampai transaksi selesai. Dua pengajuan cuti
// dari orang yang sama jadi berurutan, bukan saling mendahului
export async function lockEmployeeBalance(
  db: Executor,
  employee_id: string,
): Promise<void> {
  await db.query(`SELECT id FROM employees WHERE id = $1::uuid FOR UPDATE`, [
    employee_id,
  ]);
}

export interface AllocationShortfall {
  employee_id: string;
  employee_name: string;
  allocated: number;
  balance: number;
  balance_after: number;
}

export interface AllocationChange {
  period_year: number;
  employees: number;
  shortfalls: AllocationShortfall[];
}

// Jatah sebuah jenis cuti dihitung dari transaksi accrual, jadi mengubah
// default_quota saja tidak menyentuh karyawan yang sudah menerima jatah.
// Fungsi ini menyamakan jatah semua penerima pada satu periode dengan kuota
// baru lewat transaksi accrual selisih. Karyawan yang saldonya akan menjadi
// minus (sudah memakai atau sedang menahan lebih dari kuota baru) dikembalikan
// sebagai shortfalls dan tidak ada yang ditulis. Pemanggil wajib berada di
// dalam transaksi
export async function rebaseAllocations(
  db: Executor,
  leave_type_id: string,
  period_year: number,
  new_quota: number,
  note: string,
): Promise<AllocationChange> {
  // Dikunci dengan urutan id yang sama dengan lockEmployeeBalance per orang,
  // supaya pengajuan cuti yang sedang berjalan menunggu, bukan saling kunci
  const locked = await db.query<{ id: string }>(
    `SELECT e.id FROM employees e
     WHERE EXISTS (
       SELECT 1 FROM leave_balance_transactions t
       WHERE t.employee_id = e.id AND t.leave_type_id = $1::uuid
         AND t.period_year = $2::int
         AND t.type = 'accrual'::leave_transaction_type
     )
     ORDER BY e.id
     FOR UPDATE`,
    [leave_type_id, period_year],
  );

  if (locked.rows.length === 0) {
    return { period_year, employees: 0, shortfalls: [] };
  }

  const shortfalls = await db.query<AllocationShortfall>(
    `SELECT t.employee_id, e.full_name AS employee_name,
            SUM(t.amount) FILTER (WHERE t.type = 'accrual'::leave_transaction_type)::float8 AS allocated,
            SUM(t.amount)::float8 AS balance,
            (SUM(t.amount) + $3::numeric
              - SUM(t.amount) FILTER (WHERE t.type = 'accrual'::leave_transaction_type))::float8 AS balance_after
     FROM leave_balance_transactions t
     JOIN employees e ON e.id = t.employee_id
     WHERE t.leave_type_id = $1::uuid AND t.period_year = $2::int
     GROUP BY t.employee_id, e.full_name
     HAVING SUM(t.amount) FILTER (WHERE t.type = 'accrual'::leave_transaction_type) IS NOT NULL
        AND SUM(t.amount) + $3::numeric
            - SUM(t.amount) FILTER (WHERE t.type = 'accrual'::leave_transaction_type) < 0
     ORDER BY balance_after ASC, e.full_name ASC`,
    [leave_type_id, period_year, new_quota],
  );

  if (shortfalls.rows.length > 0) {
    return {
      period_year,
      employees: locked.rows.length,
      shortfalls: shortfalls.rows,
    };
  }

  await db.query(
    `INSERT INTO leave_balance_transactions
       (employee_id, leave_type_id, period_year, amount, type, note)
     SELECT employee_id, leave_type_id, period_year,
            $3::numeric - SUM(amount), 'accrual'::leave_transaction_type, $4
     FROM leave_balance_transactions
     WHERE leave_type_id = $1::uuid AND period_year = $2::int
       AND type = 'accrual'::leave_transaction_type
     GROUP BY employee_id, leave_type_id, period_year
     HAVING SUM(amount) <> $3::numeric`,
    [leave_type_id, period_year, new_quota, note],
  );

  return { period_year, employees: locked.rows.length, shortfalls: [] };
}
