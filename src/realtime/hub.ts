import type { WebSocket } from "ws";
import type { NotificationEvent } from "./event.js";
import { logger } from "../config/logger.js";

// Pesan yang dikirim server ke browser. "ready" hanya ada di soket sendiri,
// dikirim sekali setelah jabat tangan berhasil
export type ServerEvent =
  NotificationEvent | { event: "ready"; unread: number };

// Satu orang bisa membuka beberapa tab, jadi soketnya sekumpulan
const byUser = new Map<string, Set<WebSocket>>();

// Arah sebaliknya, supaya pembersihan tidak perlu menyisir seluruh peta
const userOf = new WeakMap<WebSocket, string>();

export function register(user_id: string, socket: WebSocket): void {
  let sockets = byUser.get(user_id);

  if (!sockets) {
    sockets = new Set();
    byUser.set(user_id, sockets);
  }

  sockets.add(socket);
  userOf.set(socket, user_id);
}

export function unregister(socket: WebSocket): void {
  const user_id = userOf.get(socket);
  if (!user_id) return;

  const sockets = byUser.get(user_id);
  if (!sockets) return;

  sockets.delete(socket);

  // kunci yang kosong ikut dibuang, kalau tidak peta tumbuh terus
  if (sockets.size === 0) byUser.delete(user_id);

  userOf.delete(socket);
}

// Mengirim ke soket yang menempel di instance ini saja
export function pushToLocal(user_id: string, message: ServerEvent): number {
  const sockets = byUser.get(user_id);
  if (!sockets || sockets.size === 0) return 0;

  const payload = JSON.stringify(message);
  let delivered = 0;

  for (const socket of sockets) {
    // OPEN, nilainya 1. Soket yang sedang menutup dilewati saja
    if (socket.readyState !== 1) continue;

    try {
      socket.send(payload);
      delivered += 1;
    } catch (err) {
      logger.error({ err, user_id }, "Gagal mengirim pesan ke soket");
    }
  }

  return delivered;
}

// Mengirim ke beberapa penerima sekaligus di instance ini
export function pushToMany(user_ids: string[], message: ServerEvent): number {
  let delivered = 0;

  // penerima kembar dibuang supaya satu tab tidak menerima dua kali
  for (const user_id of new Set(user_ids)) {
    delivered += pushToLocal(user_id, message);
  }

  return delivered;
}

export function connectionCount(): number {
  let total = 0;
  for (const sockets of byUser.values()) total += sockets.size;

  return total;
}

// Berapa soket yang sedang dipegang satu pengguna
export function countFor(user_id: string): number {
  return byUser.get(user_id)?.size ?? 0;
}

export function isConnected(user_id: string): boolean {
  return (byUser.get(user_id)?.size ?? 0) > 0;
}

// Hanya dipakai pengujian, supaya keadaan tidak bocor antar berkas tes
export function resetHub(): void {
  byUser.clear();
}
