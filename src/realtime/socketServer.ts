import type { Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { logger } from "../config/logger.js";
import { verifyToken } from "../helpers/jwt.js";
import * as userModel from "../models/user.js";
import * as notificationModel from "../models/notification.js";
import { register, unregister, pushTo } from "./hub.js";

// Koneksi dibuka dalam keadaan belum diautentikasi. Kalau token sah tidak
// datang dalam tenggang ini, soket ditutup
const AUTH_TIMEOUT_MS = 10_000;

// Proxy memutus koneksi yang diam, jadi server memancing balasan berkala.
// Sekaligus cara mendeteksi soket mati agar tidak menumpuk di memori
const HEARTBEAT_MS = 30_000;

const CLOSE_UNAUTHORIZED = 4001;
const CLOSE_AUTH_TIMEOUT = 4002;

// Soket yang sudah membalas ping sejak putaran terakhir
const alive = new WeakSet<WebSocket>();

interface AuthMessage {
  action?: unknown;
  token?: unknown;
}

function parseAuth(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as AuthMessage;

    if (parsed.action !== "auth") return null;
    if (typeof parsed.token !== "string" || parsed.token === "") return null;

    return parsed.token;
  } catch {
    return null;
  }
}

// Sama dengan middleware authenticate: token yang diterbitkan sebelum
// password diganti tidak boleh dipakai lagi
async function sessionStillValid(
  user_id: string,
  issuedAt: number | undefined,
): Promise<boolean> {
  const session = await userModel.findSessionInfo(user_id);

  if (!session?.password_changed_at || issuedAt === undefined) return true;

  const changedAt = Math.floor(session.password_changed_at.getTime() / 1000);

  return issuedAt >= changedAt;
}

async function authenticateSocket(
  socket: WebSocket,
  raw: string,
): Promise<string | null> {
  const token = parseAuth(raw);
  if (!token) return null;

  try {
    const payload = verifyToken(token);

    if (!(await sessionStillValid(payload.id, payload.iat))) return null;

    return payload.id;
  } catch {
    return null;
  }
}

export function attachSocketServer(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (socket: WebSocket) => {
    let user_id: string | null = null;

    alive.add(socket);
    socket.on("pong", () => alive.add(socket));

    const timeout = setTimeout(() => {
      if (!user_id) socket.close(CLOSE_AUTH_TIMEOUT, "Autentikasi kedaluwarsa");
    }, AUTH_TIMEOUT_MS);

    socket.on("message", (raw) => {
      // Setelah terautentikasi server tidak menerima perintah apa pun.
      // Menandai dibaca tetap lewat REST, supaya hanya ada satu jalur tulis
      if (user_id) return;

      void (async () => {
        const authenticated = await authenticateSocket(socket, String(raw));

        if (!authenticated) {
          socket.close(CLOSE_UNAUTHORIZED, "Token tidak valid");
          return;
        }

        user_id = authenticated;
        clearTimeout(timeout);
        register(user_id, socket);

        // Lencana langsung sinkron begitu tersambung, tanpa menunggu
        // polling berikutnya
        try {
          const unread = await notificationModel.countUnread(user_id);
          pushTo(user_id, { event: "ready", unread });
        } catch (err) {
          logger.error({ err, user_id }, "Gagal mengirim keadaan awal soket");
          pushTo(user_id, { event: "ready", unread: 0 });
        }
      })();
    });

    socket.on("close", () => {
      clearTimeout(timeout);
      unregister(socket);
    });

    socket.on("error", (err) => {
      logger.error({ err }, "Galat pada koneksi soket");
    });
  });

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      // tidak membalas ping sejak putaran lalu berarti koneksinya sudah mati
      if (!alive.has(socket)) {
        socket.terminate();
        continue;
      }

      alive.delete(socket);
      socket.ping();
    }
  }, HEARTBEAT_MS);

  // interval tidak boleh menahan proses tetap hidup saat server dimatikan
  heartbeat.unref();
  wss.on("close", () => clearInterval(heartbeat));

  logger.info("WebSocket siap di /ws");

  return wss;
}
