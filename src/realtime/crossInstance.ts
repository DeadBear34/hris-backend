import pg from "pg";
import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

// Kanal LISTEN/NOTIFY milik PostgreSQL, bukan kanal WebSocket
const CHANNEL = "hris_notifications";

// Batas payload pg_notify 8000 byte, disisakan sedikit untuk aman
const MAX_PAYLOAD = 7000;

// Penanda instance, dipakai mengabaikan pengumuman dari diri sendiri
const INSTANCE_ID = randomUUID();

export interface CrossInstanceMessage {
  from: string;
  user_ids: string[];
  message: unknown;
}

type Handler = (user_ids: string[], message: unknown) => void;

let listener: pg.Client | null = null;
let handler: Handler | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;

// Membuka koneksi khusus untuk LISTEN. Tidak boleh dari pool, karena
// pool mengembalikan koneksinya setelah query selesai
async function connectListener(): Promise<void> {
  const client = new pg.Client({ connectionString: env.DATABASE_URL });

  client.on("notification", (raw) => {
    if (!raw.payload || !handler) return;

    try {
      const parsed = JSON.parse(raw.payload) as CrossInstanceMessage;

      // pengumuman dari instance ini sendiri sudah ditangani secara lokal
      if (parsed.from === INSTANCE_ID) return;

      handler(parsed.user_ids, parsed.message);
    } catch (err) {
      logger.error({ err }, "Pengumuman antar-instance tidak dapat dibaca");
    }
  });

  client.on("error", (err) => {
    logger.error({ err }, "Koneksi pendengar antar-instance terputus");
    listener = null;
    scheduleReconnect();
  });

  await client.connect();
  await client.query(`LISTEN ${CHANNEL}`);

  listener = client;
  logger.info("Pendengar notifikasi antar-instance siap");
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;

    void connectListener().catch((err) => {
      logger.error({ err }, "Gagal menyambung ulang pendengar antar-instance");
      scheduleReconnect();
    });
  }, 5000);

  reconnectTimer.unref();
}

export async function startCrossInstance(onMessage: Handler): Promise<void> {
  handler = onMessage;

  try {
    await connectListener();
  } catch (err) {
    // Kegagalan di sini tidak boleh menahan server. Notifikasi tetap sampai
    // ke soket instance ini, hanya instance lain yang tidak diberi tahu
    logger.error({ err }, "Pendengar antar-instance gagal dimulai");
    scheduleReconnect();
  }
}

export async function stopCrossInstance(): Promise<void> {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;

  const client = listener;
  listener = null;
  handler = null;

  if (client) await client.end().catch(() => undefined);
}

// Mengumumkan ke instance lain. Yang di sini sudah dikirimi langsung
export function announce(
  user_ids: string[],
  message: unknown,
  db: { query: pg.Pool["query"] },
): void {
  if (user_ids.length === 0) return;

  const payload = JSON.stringify({
    from: INSTANCE_ID,
    user_ids,
    message,
  } satisfies CrossInstanceMessage);

  if (payload.length > MAX_PAYLOAD) {
    logger.warn(
      { size: payload.length },
      "Pengumuman antar-instance terlalu besar, dilewati",
    );
    return;
  }

  void db
    .query(`SELECT pg_notify($1, $2)`, [CHANNEL, payload])
    .catch((err: unknown) => {
      logger.error({ err }, "Gagal mengumumkan ke instance lain");
    });
}

export function instanceId(): string {
  return INSTANCE_ID;
}
