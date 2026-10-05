import { app } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { testConnection } from "./config/databaseConnection.js";
import { startRedis, closeRedis } from "./config/redis.js";
import { attachSocketServer } from "./realtime/socketServer.js";
import { startCleanup } from "./helpers/notificationCleanup.js";
import { pushToMany } from "./realtime/hub.js";
import { parseEvent } from "./realtime/event.js";
import { registerTransport } from "./realtime/dispatcher.js";
import { localSocketTransport } from "./realtime/transports/localSocket.js";
import { crossInstanceTransport } from "./realtime/transports/crossInstanceSocket.js";
import {
  startCrossInstance,
  stopCrossInstance,
} from "./realtime/crossInstance.js";

async function start() {
  try {
    await testConnection();
    logger.info("Database connected");
  } catch (err) {
    logger.error(err, "Failed to connect to the database");
    process.exit(1);
    return;
  }

  // Berbeda dengan database, Redis tidak ditunggu dan kegagalannya tidak
  // menghentikan server. Koneksinya disiapkan di latar belakang
  startRedis(env.REDIS_URL);

  const server = app.listen(env.PORT, () => {
    logger.info(`Server running at http://localhost:${env.PORT}`);
  });

  // app.listen mengembalikan http.Server, dan WebSocket menempel di situ
  // supaya keduanya berbagi port yang sama
  const wss = attachSocketServer(server);

  startCleanup();

  // Soket lokal dulu karena paling cepat, lalu diteruskan ke instance lain
  registerTransport(localSocketTransport);
  registerTransport(crossInstanceTransport);

  // Pengumuman dari instance lain hanya diteruskan ke soket lokal, tidak
  // diumumkan balik. Bentuk yang tidak dikenali dibuang di parseEvent
  await startCrossInstance((user_ids, raw) => {
    const event = parseEvent(raw);
    if (event) pushToMany(user_ids, event);
  });

  let shuttingDown = false;

  function shutdown(signal: string) {
    // Sinyal kedua saat penutupan sedang berjalan diabaikan, supaya soket
    // tidak ditutup dua kali
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, "Server shut down");

    void stopCrossInstance();
    void closeRedis();

    // soket ditutup lebih dulu, kalau tidak server.close menunggu selamanya
    // karena koneksi WebSocket tidak pernah selesai dengan sendirinya
    for (const socket of wss.clients) socket.terminate();
    wss.close();

    server.close(() => process.exit(0));
  }

  // SIGINT datang dari Ctrl+C saat pengembangan, SIGTERM dari Railway, Docker,
  // dan systemd setiap kali versi lama diganti. Tanpa SIGTERM, penutupan rapi
  // tidak pernah berjalan di production dan koneksi LISTEN ditinggalkan begitu
  // saja sampai dimatikan paksa
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Keduanya menandakan keadaan proses sudah tidak dapat dipercaya, jadi
  // sengaja tidak ditahan. Yang ditambahkan hanya catatan penyebabnya sebelum
  // proses berhenti, supaya kegagalan terlihat di log dan bukan mati diam-diam.
  // Sesudahnya Railway yang menyalakan ulang
  process.on("uncaughtException", (err) => {
    logger.error({ err }, "Uncaught exception, shutting down");
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    logger.error({ err: reason }, "Unhandled promise rejection, shutting down");
    process.exit(1);
  });
}

start();
