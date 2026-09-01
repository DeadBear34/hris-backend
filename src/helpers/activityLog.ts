import type { Request } from "express";
import { logger } from "../config/logger.js";
import { insertLog } from "../models/activityLog.js";

// Kode aksi yang dicatat. Ditulis <entitas>.<kegiatan> supaya nanti mudah
// disaring per entitas maupun per kegiatan di tabel log
export type ActivityAction = "employee.create" | "employee.create_bulk";

export type ActivityStatus = "success" | "failed";

// Bentuk satu catatan aktivitas. Sengaja disusun seperti baris tabel supaya
// ketika tabel log dibuat, isian ini tinggal disimpan apa adanya tanpa
// mengubah pemanggilnya
export interface ActivityLogEntry {
  action: ActivityAction;
  status: ActivityStatus;

  // pelaku. Email dan nama disalin di sini supaya catatan tetap terbaca
  // walau akunnya kelak dihapus
  actor_user_id: string | null;
  actor_employee_id: string | null;
  actor_email: string | null;
  actor_name: string | null;

  // sasaran, terisi kalau aksinya menyentuh satu baris tertentu
  entity: string;
  entity_id: string | null;

  summary: string;

  // rincian bebas per aksi, calon kolom jsonb
  metadata: Record<string, unknown>;

  ip_address: string | null;
  user_agent: string | null;

  // kapan peristiwanya terjadi, diambil saat permintaan mulai diproses
  occurred_at: Date;

  // kapan catatannya dibuat, yaitu setelah peristiwanya selesai
  created_at: Date;

  // selisih keduanya, dihitung di sini supaya tidak mungkin tidak cocok
  duration_ms: number;
}

export interface RequestContext {
  actor_user_id: string | null;
  actor_email: string | null;
  ip_address: string | null;
  user_agent: string | null;
}

export function requestContext(req: Request): RequestContext {
  return {
    actor_user_id: req.user?.id ?? null,
    actor_email: req.user?.email ?? null,
    ip_address: req.ip ?? null,
    user_agent: req.headers["user-agent"] ?? null,
  };
}

export interface RecordActivityInput {
  action: ActivityAction;
  status: ActivityStatus;
  context: RequestContext;
  entity: string;
  entity_id?: string | null;
  actor_employee_id?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
  actor_name?: string | null;

  // waktu permintaan mulai diproses, bukan waktu pemanggilan fungsi ini
  occurred_at: Date;
}

// Rincian per baris dipotong supaya satu catatan tidak membengkak. Impor 500
// karyawan menghasilkan 51 KB kalau seluruhnya ikut, padahal yang berguna saat
// menelusuri hanya beberapa contoh ditambah jumlah totalnya
export const MAX_DETAIL_ITEMS = 20;

export function summarizeList<T>(
  daftar: T[],
  batas = MAX_DETAIL_ITEMS,
): { total: number; sample: T[]; truncated: boolean } {
  return {
    total: daftar.length,
    sample: daftar.slice(0, batas),
    truncated: daftar.length > batas,
  };
}

export function buildActivityLog(
  input: RecordActivityInput,
): ActivityLogEntry {
  const createdAt = new Date();

  return {
    action: input.action,
    status: input.status,
    actor_user_id: input.context.actor_user_id,
    actor_employee_id: input.actor_employee_id ?? null,
    actor_email: input.context.actor_email,
    actor_name: input.actor_name ?? null,
    entity: input.entity,
    entity_id: input.entity_id ?? null,
    summary: input.summary,
    metadata: input.metadata ?? {},
    ip_address: input.context.ip_address,
    user_agent: input.context.user_agent,
    occurred_at: input.occurred_at,
    created_at: createdAt,
    // Math.max menjaga dari jam sistem yang mundur, misalnya karena
    // penyelarasan NTP. Durasi negatif akan ditolak batasan tabel
    duration_ms: Math.max(0, createdAt.getTime() - input.occurred_at.getTime()),
  };
}

// Mencatat satu aktivitas. Untuk saat ini hanya ke log aplikasi; ketika tabel
// log sudah ada, penyimpanannya ditambahkan di sini saja
// Menyimpan catatan ke tabel activity_logs tanpa ditunggu, supaya kegagalan
// mencatat tidak pernah menggagalkan permintaan yang sudah berhasil maupun
// memperlambat responsnya
function persistActivity(entry: ActivityLogEntry): void {
  void insertLog(entry).catch((err) => {
    logger.error({ err, action: entry.action }, "Gagal menyimpan log aktivitas");
  });
}

export function recordActivity(input: RecordActivityInput): ActivityLogEntry {
  const entry = buildActivityLog(input);

  const write = entry.status === "failed" ? logger.warn : logger.info;

  write.call(logger, { activity: entry }, entry.summary);

  persistActivity(entry);

  return entry;
}
