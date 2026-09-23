import { pool } from "../config/databaseConnection.js";
import type { Executor } from "./user.js";
import type { ActivityLogEntry } from "../helpers/activityLog.js";

export interface ActivityLogRow extends ActivityLogEntry {
  id: string;
}

// Penyaring untuk halaman riwayat aktivitas
export interface ListActivityLogParams {
  action?: string;
  status?: "success" | "failed";
  entity?: string;
  entity_id?: string;
  actor_user_id?: string;
  start_date?: string;
  end_date?: string;
  page: number;
  limit: number;
}

const COLUMN_NAMES = [
  "id",
  "action",
  "status",
  "actor_user_id",
  "actor_employee_id",
  "actor_email",
  "actor_name",
  "entity",
  "entity_id",
  "summary",
  "metadata",
  "ip_address",
  "user_agent",
  "occurred_at",
  "created_at",
  "duration_ms",
] as const;

const COLUMNS = COLUMN_NAMES.join(", ");

// Menyimpan satu catatan. metadata dikirim sebagai jsonb
export async function insertLog(
  entry: ActivityLogEntry,
  db: Executor = pool,
): Promise<void> {
  await db.query(
    `INSERT INTO activity_logs
       (action, status, actor_user_id, actor_employee_id, actor_email,
        actor_name, entity, entity_id, summary, metadata, ip_address,
        user_agent, occurred_at, created_at, duration_ms)
     VALUES ($1, $2::activity_status, $3::uuid, $4::uuid, $5, $6, $7, $8::uuid,
             $9, $10::jsonb, $11, $12, $13::timestamptz, $14::timestamptz,
             $15::int)`,
    [
      entry.action,
      entry.status,
      entry.actor_user_id,
      entry.actor_employee_id,
      entry.actor_email,
      entry.actor_name,
      entry.entity,
      entry.entity_id,
      entry.summary,
      JSON.stringify(entry.metadata),
      entry.ip_address,
      entry.user_agent,
      entry.occurred_at,
      entry.created_at,
      entry.duration_ms,
    ],
  );
}

// Diurutkan dari waktu peristiwa, bukan waktu pencatatan
export async function listLogs(
  params: ListActivityLogParams,
): Promise<{ rows: ActivityLogRow[]; total: number }> {
  const conditions: string[] = ["TRUE"];
  const values: unknown[] = [];

  if (params.action) {
    values.push(params.action);
    conditions.push(`action = $${values.length}`);
  }

  if (params.status) {
    values.push(params.status);
    conditions.push(`status = $${values.length}::activity_status`);
  }

  if (params.entity) {
    values.push(params.entity);
    conditions.push(`entity = $${values.length}`);
  }

  if (params.entity_id) {
    values.push(params.entity_id);
    conditions.push(`entity_id = $${values.length}::uuid`);
  }

  if (params.actor_user_id) {
    values.push(params.actor_user_id);
    conditions.push(`actor_user_id = $${values.length}::uuid`);
  }

  if (params.start_date) {
    values.push(params.start_date);
    conditions.push(`occurred_at >= $${values.length}::date`);
  }

  if (params.end_date) {
    values.push(params.end_date);
    // + 1 supaya seluruh hari pada tanggal akhir ikut tercakup
    conditions.push(`occurred_at < $${values.length}::date + 1`);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) FROM activity_logs ${where}`,
    values,
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  const offset = (params.page - 1) * params.limit;
  values.push(params.limit, offset);

  const dataResult = await pool.query<ActivityLogRow>(
    `SELECT ${COLUMNS} FROM activity_logs ${where}
     ORDER BY occurred_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );

  return { rows: dataResult.rows, total };
}

export interface LatestChange {
  action: string;
  actor_name: string | null;
  actor_email: string | null;
  occurred_at: Date;
}

// Perubahan terakhir yang berhasil atas satu data. Dipakai memberi tahu
// pengguna siapa yang lebih dulu mengubah data yang sedang ia sunting
export async function findLatestChange(
  entity: string,
  entity_id: string,
): Promise<LatestChange | null> {
  const result = await pool.query<LatestChange>(
    // nama pelaku tidak selalu tersimpan di log, misalnya aksi admin, jadi
    // diambil dari data karyawan pemilik akunnya
    `SELECT l.action, COALESCE(l.actor_name, e.full_name) AS actor_name,
            l.actor_email, l.occurred_at
     FROM activity_logs l
     LEFT JOIN employees e
       ON e.user_id = l.actor_user_id AND e.deleted_at IS NULL
     WHERE l.entity = $1 AND l.entity_id = $2::uuid
       AND l.status = 'success'::activity_status
     ORDER BY l.occurred_at DESC
     LIMIT 1`,
    [entity, entity_id],
  );

  return result.rows[0] ?? null;
}
