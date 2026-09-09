import { logger } from "../config/logger.js";
import type { NotificationEvent } from "./event.js";

// Satu jalur pengiriman. Menambah jalur baru cukup menulis objek seperti ini
// lalu mendaftarkannya, tanpa menyentuh berkas lain
export interface Transport {
  name: string;
  send(user_ids: string[], event: NotificationEvent): void;
}

const transports: Transport[] = [];

export function registerTransport(transport: Transport): void {
  transports.push(transport);
  logger.info({ transport: transport.name }, "Jalur notifikasi didaftarkan");
}

// Mengirim ke seluruh jalur. Satu jalur gagal tidak menghentikan yang lain,
// karena notifikasinya sudah aman di database
export function dispatch(user_ids: string[], event: NotificationEvent): void {
  if (user_ids.length === 0) return;

  const unique = [...new Set(user_ids)];

  for (const transport of transports) {
    try {
      transport.send(unique, event);
    } catch (err) {
      logger.error(
        { err, transport: transport.name, event: event.event },
        "Jalur notifikasi gagal mengirim",
      );
    }
  }
}

// Hanya dipakai pengujian, supaya pendaftaran tidak bocor antar berkas tes
export function resetTransports(): void {
  transports.length = 0;
}

export function transportNames(): string[] {
  return transports.map((t) => t.name);
}
