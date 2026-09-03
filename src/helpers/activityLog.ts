import type { Request } from "express";
import { logger } from "../config/logger.js";
import { insertLog } from "../models/activityLog.js";

// Ditulis <entitas>.<kegiatan> agar mudah disaring
export type ActivityAction =
  | "employee.create"
  | "employee.create_bulk"
  | "employee.update"
  | "employee.delete"
  | "employee.photo_upload"
  | "employee.photo_delete"
  | "user.approve"
  | "user.set_active"
  | "department.create"
  | "department.update"
  | "department.delete"
  | "position.create"
  | "position.update"
  | "position.delete"
  | "position.features_replace"
  | "holiday.create"
  | "holiday.update"
  | "holiday.delete"
  | "leave_type.create"
  | "leave_type.update"
  | "leave_type.delete"
  | "leave.approve"
  | "leave.reject"
  | "leave.balance_adjust"
  | "schedule.create"
  | "schedule.update"
  | "schedule.delete"
  | "attendance.correct"
  | "attendance.close_day"
  | "auth.login"
  | "auth.register";

export type ActivityStatus = "success" | "failed";

// Bentuknya mengikuti kolom tabel activity_logs
export interface ActivityLogEntry {
  action: ActivityAction;
  status: ActivityStatus;

  // email dan nama disalin agar tetap terbaca kalau akunnya dihapus
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

// Rincian dipotong agar satu catatan tidak membengkak. Sekarang sama dengan
// batas per permintaan, jadi hanya jaring pengaman kalau batas itu dinaikkan
export const MAX_DETAIL_ITEMS = 20;

export function summarizeList<T>(
  items: T[],
  limit = MAX_DETAIL_ITEMS,
): { total: number; sample: T[]; truncated: boolean } {
  return {
    total: items.length,
    sample: items.slice(0, limit),
    truncated: items.length > limit,
  };
}

export function buildActivityLog(input: RecordActivityInput): ActivityLogEntry {
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
    // jaga-jaga kalau jam sistem mundur; durasi negatif ditolak tabel
    duration_ms: Math.max(0, createdAt.getTime() - input.occurred_at.getTime()),
  };
}

// Disimpan tanpa ditunggu, supaya gagal mencatat tidak ikut menggagalkan
// permintaan yang sudah berhasil
function persistActivity(entry: ActivityLogEntry): void {
  void insertLog(entry).catch((err) => {
    logger.error(
      { err, action: entry.action },
      "Gagal menyimpan log aktivitas",
    );
  });
}

export function recordActivity(input: RecordActivityInput): ActivityLogEntry {
  const entry = buildActivityLog(input);

  const write = entry.status === "failed" ? logger.warn : logger.info;

  write.call(logger, { activity: entry }, entry.summary);

  persistActivity(entry);

  return entry;
}

export interface ActivityRecorder {
  success(input: ActionInput): void;
  failed(input: ActionInput): void;
}

export interface ActionInput {
  action: ActivityAction;
  entity: string;
  entity_id?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
  actor_name?: string | null;

  // Login dan register belum melewati authenticate, jadi req.user masih kosong.
  // Pelakunya baru diketahui di tengah proses dan disebut lewat dua kolom ini
  actor_user_id?: string | null;
  actor_email?: string | null;
}

// Merekam waktu dan pelaku sekali di awal permintaan, supaya tiap titik
// pencatatan cukup menyebut aksi dan sasarannya
export function startActivity(req: Request): ActivityRecorder {
  const occurred_at = new Date();
  const context = requestContext(req);

  const write = (status: ActivityStatus, input: ActionInput) =>
    recordActivity({
      ...input,
      status,
      occurred_at,
      // ip dan user_agent tetap dari permintaan, pelakunya boleh ditimpa
      context: {
        ...context,
        actor_user_id: input.actor_user_id ?? context.actor_user_id,
        actor_email: input.actor_email ?? context.actor_email,
      },
    });

  return {
    success: (input) => write("success", input),
    failed: (input) => write("failed", input),
  };
}
