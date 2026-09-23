import type { Notification } from "../models/notification.js";

// Satu-satunya bentuk peristiwa notifikasi. Semua jalur pengiriman memakai
// tipe ini, jadi bentuknya tidak bisa berbeda-beda antar jalur
export type NotificationEvent =
  | { event: "notification.created"; data: NotificationView }
  | { event: "notification.cleared"; ids: string[] };

// Kolom yang boleh dilihat penerima. recipient_user_id dan entity tidak ikut
export interface NotificationView {
  id: string;
  type: Notification["type"];
  title: string;
  message: string;
  link: string;
  is_read: boolean;
  read_at: Date | null;
  created_at: Date;
}

export function toView(row: Notification): NotificationView {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    link: row.link,
    is_read: row.is_read,
    read_at: row.read_at,
    created_at: row.created_at,
  };
}

// Menyaring pesan yang datang dari luar proses, misalnya lewat pengumuman
// antar-instance. Bentuk yang tidak dikenali dibuang, bukan diteruskan
export function parseEvent(value: unknown): NotificationEvent | null {
  if (typeof value !== "object" || value === null) return null;

  const candidate = value as Partial<NotificationEvent>;

  if (candidate.event === "notification.created") {
    const data = (candidate as { data?: unknown }).data;

    return typeof data === "object" && data !== null
      ? { event: "notification.created", data: data as NotificationView }
      : null;
  }

  if (candidate.event === "notification.cleared") {
    const ids = (candidate as { ids?: unknown }).ids;

    return Array.isArray(ids) && ids.every((id) => typeof id === "string")
      ? { event: "notification.cleared", ids }
      : null;
  }

  return null;
}
