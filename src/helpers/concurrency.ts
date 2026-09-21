import { AppError, NotFound } from "./appError.js";
import { findLatestChange } from "../models/activityLog.js";

export const STALE_DATA_CODE = "STALE_DATA";

// Syarat versi untuk UPDATE. Klien mengirim balik updated_at yang ia terima
// saat membuka data, dan baris hanya berubah kalau nilainya masih sama.
// Keduanya dipotong ke milidetik karena database menyimpan mikrodetik,
// sedangkan JSON hanya membawa milidetik. Parameter null berarti klien tidak
// memakai pemeriksaan ini
export function sameVersion(column: string, param: number): string {
  return `($${param}::timestamptz IS NULL OR date_trunc('milliseconds', ${column}) = date_trunc('milliseconds', $${param}::timestamptz))`;
}

// UPDATE itu bersyarat dalam artian yang tidak mengenai baris punya dua kemungkinan: datanya
// sudah dihapus, atau sudah diubah orang lain sejak dibuka. Keduanya dibedakan
// supaya pengguna tahu harus memuat ulang atau datanya memang sudah tidak ada
export async function rejectStaleUpdate(
  entity: string,
  loadCurrent: () => Promise<{ id: string } | null>,
  notFoundMessage: string,
): Promise<AppError> {
  const current = await loadCurrent();

  if (!current) return NotFound(notFoundMessage);

  // penulisan log tidak ditunggu, jadi catatan terakhir bisa saja belum ada
  const lastChange = await findLatestChange(entity, current.id).catch(
    () => null,
  );

  return new AppError(
    409,
    "This data was changed by someone else after you opened it. Review the latest data, then save again.",
    STALE_DATA_CODE,
    {
      current,
      last_changed_by: lastChange
        ? {
            name: lastChange.actor_name,
            email: lastChange.actor_email,
            action: lastChange.action,
            at: lastChange.occurred_at,
          }
        : null,
    },
  );
}
