import { getRedis } from "../config/redis.js";
import { logger } from "../config/logger.js";
import * as userModel from "../models/user.js";
import type { SessionInfo } from "../models/user.js";
import type { TokenPayload } from "./jwt.js";

// Data sesi dibaca di setiap request yang butuh login. Database ada di
// Supabase, terpisah dari VM, sehingga satu query memakan puluhan milidetik.
// Redis berjalan di VM yang sama, jadi hasilnya disimpan sebentar di sana.
// Cukup singkat supaya perubahan yang lupa membatalkan cache tetap terkejar
export const SESSION_CACHE_SECONDS = 60;

const sessionKey = (user_id: string) => `session:${user_id}`;
const revokedKey = (jti: string) => `revoked:${jti}`;

interface CachedSession {
  id: string;
  password_changed_at: string | null;
  is_active: boolean;
}

function toCache(session: SessionInfo | null): string {
  if (!session) return "null";

  const cached: CachedSession = {
    id: session.id,
    password_changed_at: session.password_changed_at
      ? new Date(session.password_changed_at).toISOString()
      : null,
    is_active: session.is_active,
  };

  return JSON.stringify(cached);
}

function fromCache(raw: string): SessionInfo | null {
  const cached = JSON.parse(raw) as CachedSession | null;
  if (!cached) return null;

  return {
    id: cached.id,
    password_changed_at: cached.password_changed_at
      ? new Date(cached.password_changed_at)
      : null,
    is_active: cached.is_active,
  };
}

// Redis bersifat opsional. Setiap kegagalannya hanya dicatat, lalu jalur
// cadangan dipakai, supaya pengguna tidak ikut gagal login karena Redis mati
function redisFailed(err: unknown, operation: string): void {
  logger.warn(
    { reason: err instanceof Error ? err.message : String(err), operation },
    "Redis session operation failed, falling back",
  );
}

// Data sesi pengguna, dari Redis bila ada, selain itu dari database lalu
// disimpan. Akun yang sudah dihapus juga disimpan (sebagai null), supaya
// token milik akun terhapus tidak terus memicu query
export async function loadSession(
  user_id: string,
): Promise<SessionInfo | null> {
  const redis = getRedis();

  if (redis) {
    try {
      const raw = await redis.get(sessionKey(user_id));
      if (raw !== null) return fromCache(raw);
    } catch (err) {
      redisFailed(err, "get session");
    }
  }

  const session = await userModel.findSessionInfo(user_id);

  if (redis) {
    try {
      await redis.set(
        sessionKey(user_id),
        toCache(session),
        "EX",
        SESSION_CACHE_SECONDS,
      );
    } catch (err) {
      redisFailed(err, "set session");
    }
  }

  return session;
}

// Dipanggil setiap kali password, status aktif, persetujuan, atau keberadaan
// akun berubah, setelah perubahannya tersimpan. Pembacaan berikutnya
// langsung mengambil keadaan terbaru dari database
export async function forgetSession(user_id: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.del(sessionKey(user_id));
  } catch (err) {
    redisFailed(err, "delete session");
  }
}

// Cadangan di memori proses, dipakai bersamaan dengan Redis. Bila Redis
// sedang mati saat logout, token tetap ditolak oleh proses ini sampai
// kedaluwarsa. Isinya hilang bila server dinyalakan ulang, karena itu Redis
// tetap penyimpanan utamanya
const revokedInMemory = new Map<string, number>();
let lastSweep = 0;

function sweepExpired(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;

  for (const [jti, expiresAt] of revokedInMemory) {
    if (expiresAt <= now) revokedInMemory.delete(jti);
  }
}

// Mencabut satu token sampai waktu kedaluwarsanya. Setelah itu token memang
// sudah tidak berlaku, jadi catatannya tidak perlu disimpan lebih lama
export async function revokeToken(payload: TokenPayload): Promise<boolean> {
  if (!payload.jti || payload.exp === undefined) return false;

  const now = Date.now();
  const expiresAt = payload.exp * 1000;
  const ttlSeconds = Math.ceil((expiresAt - now) / 1000);

  if (ttlSeconds <= 0) return true;

  sweepExpired(now);
  revokedInMemory.set(payload.jti, expiresAt);

  const redis = getRedis();

  if (redis) {
    try {
      await redis.set(revokedKey(payload.jti), "1", "EX", ttlSeconds);
    } catch (err) {
      redisFailed(err, "revoke token");
    }
  }

  return true;
}

export async function isTokenRevoked(payload: TokenPayload): Promise<boolean> {
  if (!payload.jti) return false;

  const inMemory = revokedInMemory.get(payload.jti);
  if (inMemory !== undefined && inMemory > Date.now()) return true;

  const redis = getRedis();
  if (!redis) return false;

  try {
    return (await redis.exists(revokedKey(payload.jti))) === 1;
  } catch (err) {
    redisFailed(err, "check revoked token");
    return false;
  }
}

// Satu aturan untuk HTTP dan WebSocket. null berarti sesi masih sah,
// selain itu berisi alasan penolakannya
export async function sessionRejection(
  payload: TokenPayload,
): Promise<string | null> {
  if (await isTokenRevoked(payload)) {
    return "You have logged out from this session, please log in again";
  }

  const session = await loadSession(payload.id);

  if (!session) {
    return "Your account no longer exists, please contact an admin";
  }

  if (!session.is_active) {
    return "Your account has been deactivated, please contact an admin";
  }

  if (session.password_changed_at && payload.iat !== undefined) {
    const changedAt = Math.floor(session.password_changed_at.getTime() / 1000);

    if (payload.iat < changedAt) {
      return "Your session is no longer valid because the password was changed, please log in again";
    }
  }

  return null;
}

// hanya untuk pengujian
export function resetRevokedTokens(): void {
  revokedInMemory.clear();
  lastSweep = 0;
}
