import type { Request, Response, NextFunction, RequestHandler } from "express";
import { env } from "../config/env.js";
import { RateLimitExceeded } from "../helpers/appError.js";
import { verifyToken } from "../helpers/jwt.js";

const MINUTE = 60 * 1000;

interface RateWindow {
  count: number;
  resetAt: number;
}

// Fixed window: setiap klien punya satu hitungan per jendela waktu, dan
// hitungan itu kembali ke nol saat jendelanya berakhir.
export class MemoryRateLimitStore {
  private windows = new Map<string, RateWindow>();
  private lastSweep = 0;

  hit(key: string, windowMs: number, now = Date.now()): RateWindow {
    this.sweep(now, windowMs);
    // Hitungan disimpan di memori proses. Pada penyebaran multi-instance setiap
    // instance menghitung sendiri, sehingga batas efektifnya dikali jumlah
    // instance. Untuk berbagi hitungan, ganti kelas ini dengan penyimpanan
    // bersama seperti Redis tanpa mengubah middleware-nya  
    const current = this.windows.get(key);

    if (current && current.resetAt > now) {
      current.count += 1;
      return current;
    }

    const fresh = { count: 1, resetAt: now + windowMs };
    this.windows.set(key, fresh);

    return fresh;
  }

  get size(): number {
    return this.windows.size;
  }

  // Jendela yang sudah lewat dibuang sesekali, bukan di setiap permintaan,
  // supaya Map tidak terus membesar oleh klien yang hanya datang sekali
  private sweep(now: number, windowMs: number) {
    if (now - this.lastSweep < windowMs) return;

    this.lastSweep = now;

    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
  }
}

function clientIp(req: Request): string {
  return req.ip ?? req.socket?.remoteAddress ?? "unknown";
}

// Pembatas dipasang sebelum authenticate supaya permintaan yang ditolak
// tidak sempat menyentuh database. Karena itu token diperiksa sendiri di
// sini, cukup tanda tangannya saja tanpa query sesi. Token yang rusak atau
// kedaluwarsa dihitung per IP
export function clientKey(req: Request): string {
  if (req.user) return `user:${req.user.id}`;

  const header = req.headers.authorization;

  if (header?.startsWith("Bearer ")) {
    try {
      return `user:${verifyToken(header.slice("Bearer ".length)).id}`;
    } catch {
      // jatuh ke hitungan per IP
    }
  }

  return `ip:${clientIp(req)}`;
}

// Login dihitung per pasangan IP dan email. Per IP saja akan mengunci
// seluruh kantor yang keluar lewat satu IP publik saat jam masuk. Per email
// saja memungkinkan orang lain mengunci akun seseorang dari mana pun
export function loginKey(req: Request): string {
  const email =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";

  return `ip:${clientIp(req)}:email:${email}`;
}

// Satu permintaan bisa melewati dua pembatas: batas umum lalu batas khusus
// endpoint. Header yang dikirim milik pembatas yang sisanya paling sedikit,
// karena pembatas itulah yang akan lebih dulu menolak
function setLimitHeaders(res: Response, limit: number, remaining: number) {
  const shown = res.locals.rateLimitRemaining;

  if (typeof shown === "number" && shown < remaining) return;

  res.locals.rateLimitRemaining = remaining;
  res.setHeader("X-RateLimit-Limit", limit);
  res.setHeader("X-RateLimit-Remaining", remaining);
}

export interface RateLimitOptions {
  // Pembeda hitungan antar pembatas, jadi batas login tidak memakan jatah
  // batas daftar karyawan
  name: string;
  limit: number;
  windowMs: number;
  key?: (req: Request) => string;
  store?: MemoryRateLimitStore;
  enabled?: boolean;
}

const sharedStore = new MemoryRateLimitStore();

const enabledByDefault =
  env.RATE_LIMIT_ENABLED === undefined
    ? env.NODE_ENV !== "test"
    : env.RATE_LIMIT_ENABLED === "true";

export function rateLimit({
  name,
  limit,
  windowMs,
  key = clientKey,
  store = sharedStore,
  enabled = enabledByDefault,
}: RateLimitOptions): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!enabled) return next();

    const now = Date.now();
    const window = store.hit(`${name}:${key(req)}`, windowMs, now);

    setLimitHeaders(res, limit, Math.max(0, limit - window.count));

    if (window.count > limit) {
      const secondsLeft = Math.ceil((window.resetAt - now) / 1000);

      res.setHeader("Retry-After", Math.max(1, secondsLeft));

      return next(RateLimitExceeded());
    }

    next();
  };
}

// Batas umum untuk seluruh /api/v1. Sengaja longgar: tujuannya menahan
// skrip dan loop yang tak berujung, bukan membatasi pemakaian wajar
export const apiRateLimit = rateLimit({
  name: "api",
  limit: 300,
  windowMs: MINUTE,
});

export const loginRateLimit = rateLimit({
  name: "login",
  limit: 5,
  windowMs: MINUTE,
  key: loginKey,
});

export const employeeListRateLimit = rateLimit({
  name: "employee-list",
  limit: 100,
  windowMs: MINUTE,
});

export const employeeCreateRateLimit = rateLimit({
  name: "employee-create",
  limit: 20,
  windowMs: MINUTE,
});
