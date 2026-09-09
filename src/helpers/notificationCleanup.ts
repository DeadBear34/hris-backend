import { logger } from "../config/logger.js";
import { deleteReadOlderThan } from "../models/notification.js";

// Notifikasi yang sudah dibaca tidak punya nilai setelah beberapa waktu,
// sementara tabelnya tumbuh terus kalau tidak pernah dibersihkan
const RETENTION_DAYS = 30;
const INTERVAL_MS = 24 * 60 * 60 * 1000;

export async function runCleanup(): Promise<number> {
  try {
    const removed = await deleteReadOlderThan(RETENTION_DAYS);

    if (removed > 0) {
      logger.info({ removed }, "Notifikasi lama dibersihkan");
    }

    return removed;
  } catch (err) {
    logger.error({ err }, "Gagal membersihkan notifikasi lama");
    return 0;
  }
}

// Dijalankan sekali saat start lalu sehari sekali. Aman kalau beberapa
// instance menjalankannya bersamaan, karena hanya menghapus
export function startCleanup(): NodeJS.Timeout {
  void runCleanup();

  const timer = setInterval(() => void runCleanup(), INTERVAL_MS);

  // tidak boleh menahan proses tetap hidup saat server dimatikan
  timer.unref();

  return timer;
}

export const NOTIFICATION_RETENTION_DAYS = RETENTION_DAYS;
