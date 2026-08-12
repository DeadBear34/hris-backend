import { pool } from "../config/databaseConnection.js";
import type { Executor } from "./user.js";

export interface LeaveAttachment {
  id: string;
  leave_request_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  checksum: string | null;
  uploaded_by: string | null;
  uploaded_at: Date;
}

export interface CreateAttachmentInput {
  leave_request_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  checksum?: string | null;
  uploaded_by?: string | null;
}

export async function createAttachment(
  data: CreateAttachmentInput,
  db: Executor = pool,
): Promise<LeaveAttachment> {
  const result = await db.query<LeaveAttachment>(
    `INSERT INTO leave_attachments
       (leave_request_id, storage_path, file_name, mime_type, file_size,
        checksum, uploaded_by)
     VALUES ($1::uuid, $2, $3, $4, $5::bigint, $6, $7::uuid)
     RETURNING *`,
    [
      data.leave_request_id,
      data.storage_path,
      data.file_name,
      data.mime_type,
      data.file_size,
      data.checksum ?? null,
      data.uploaded_by ?? null,
    ],
  );

  const attachment = result.rows[0];
  if (!attachment) {
    throw new Error("Gagal menyimpan lampiran");
  }

  return attachment;
}

export async function findById(id: string): Promise<LeaveAttachment | null> {
  const result = await pool.query<LeaveAttachment>(
    "SELECT * FROM leave_attachments WHERE id = $1::uuid",
    [id],
  );

  return result.rows[0] ?? null;
}

export async function findByRequest(
  leave_request_id: string,
): Promise<LeaveAttachment[]> {
  const result = await pool.query<LeaveAttachment>(
    `SELECT * FROM leave_attachments
     WHERE leave_request_id = $1::uuid
     ORDER BY uploaded_at ASC`,
    [leave_request_id],
  );

  return result.rows;
}

export async function countByRequest(
  leave_request_id: string,
): Promise<number> {
  const result = await pool.query<{ count: string }>(
    "SELECT COUNT(*) FROM leave_attachments WHERE leave_request_id = $1::uuid",
    [leave_request_id],
  );

  return Number(result.rows[0]?.count ?? 0);
}
