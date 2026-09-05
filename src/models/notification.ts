import { pool } from "../config/databaseConnection.js";
import type { Executor } from "./user.js";

// Sama persis dengan enum notification_type di database
export type NotificationType =
  "leave_approval_needed" | "leave_status_changed" | "account_approval_needed";

export interface Notification {
  id: string;
  recipient_user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string;
  entity: string;
  entity_id: string | null;
  is_read: boolean;
  read_at: Date | null;
  created_at: Date;
}

export interface NewNotification {
  recipient_user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string;
  entity: string;
  entity_id?: string | null;
}

export interface ListParams {
  recipient_user_id: string;
  only_unread?: boolean;
  page: number;
  limit: number;
}

const COLUMNS = [
  "id",
  "recipient_user_id",
  "type",
  "title",
  "message",
  "link",
  "entity",
  "entity_id",
  "is_read",
  "read_at",
  "created_at",
].join(", ");

// Satu query untuk banyak penerima sekaligus. Notifikasi "perlu ditindak"
// punya indeks unik, jadi kiriman ulang diabaikan lewat ON CONFLICT
export async function insertMany(
  rows: NewNotification[],
  db: Executor = pool,
): Promise<Notification[]> {
  if (rows.length === 0) return [];

  const result = await db.query<Notification>(
    `INSERT INTO notifications
       (recipient_user_id, type, title, message, link, entity, entity_id)
     SELECT * FROM unnest(
       $1::uuid[], $2::notification_type[], $3::varchar[],
       $4::text[], $5::varchar[], $6::varchar[], $7::uuid[]
     )
     ON CONFLICT DO NOTHING
     RETURNING ${COLUMNS}`,
    [
      rows.map((row) => row.recipient_user_id),
      rows.map((row) => row.type),
      rows.map((row) => row.title),
      rows.map((row) => row.message),
      rows.map((row) => row.link),
      rows.map((row) => row.entity),
      rows.map((row) => row.entity_id ?? null),
    ],
  );

  return result.rows;
}

export async function listFor(
  params: ListParams,
): Promise<{ rows: Notification[]; total: number; unread: number }> {
  const offset = (params.page - 1) * params.limit;

  const where = params.only_unread
    ? "recipient_user_id = $1::uuid AND is_read = false"
    : "recipient_user_id = $1::uuid";

  const [rows, counts] = await Promise.all([
    pool.query<Notification>(
      `SELECT ${COLUMNS} FROM notifications
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT $2::int OFFSET $3::int`,
      [params.recipient_user_id, params.limit, offset],
    ),
    // dua hitungan sekaligus supaya lencana dan pagination tidak perlu
    // dua perjalanan terpisah ke database
    pool.query<{ total: string; unread: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE ${params.only_unread ? "is_read = false" : "true"}) AS total,
         COUNT(*) FILTER (WHERE is_read = false) AS unread
       FROM notifications
       WHERE recipient_user_id = $1::uuid`,
      [params.recipient_user_id],
    ),
  ]);

  return {
    rows: rows.rows,
    total: Number(counts.rows[0]?.total ?? 0),
    unread: Number(counts.rows[0]?.unread ?? 0),
  };
}

// Hanya milik penerima sendiri yang boleh ditandai
export async function markRead(
  id: string,
  recipient_user_id: string,
): Promise<Notification | null> {
  const result = await pool.query<Notification>(
    `UPDATE notifications
     SET is_read = true, read_at = now()
     WHERE id = $1::uuid AND recipient_user_id = $2::uuid AND is_read = false
     RETURNING ${COLUMNS}`,
    [id, recipient_user_id],
  );

  return result.rows[0] ?? null;
}

export async function markAllRead(recipient_user_id: string): Promise<number> {
  const result = await pool.query(
    `UPDATE notifications
     SET is_read = true, read_at = now()
     WHERE recipient_user_id = $1::uuid AND is_read = false`,
    [recipient_user_id],
  );

  return result.rowCount ?? 0;
}

export async function countUnread(recipient_user_id: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) FROM notifications
     WHERE recipient_user_id = $1::uuid AND is_read = false`,
    [recipient_user_id],
  );

  return Number(result.rows[0]?.count ?? 0);
}

// Dipakai saat pengajuan cuti diputuskan: notifikasi "perlu disetujui"
// tidak relevan lagi begitu keputusannya keluar
export async function deletePending(
  type: NotificationType,
  entity_id: string,
  db: Executor = pool,
): Promise<{ id: string; recipient_user_id: string }[]> {
  const result = await db.query<{ id: string; recipient_user_id: string }>(
    `DELETE FROM notifications
     WHERE type = $1::notification_type AND entity_id = $2::uuid
     RETURNING id, recipient_user_id`,
    [type, entity_id],
  );

  return result.rows;
}
