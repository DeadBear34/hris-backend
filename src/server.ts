import { app } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { testConnection } from "./config/databaseConnection.js";
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
    logger.info("Database terhubung");
  } catch (err) {
    logger.error(err, "Gagal terhubung ke database");
    process.exit(1);
  }

  const server = app.listen(env.PORT, () => {
    logger.info(`Server berjalan di http://localhost:${env.PORT}`);
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

  process.on("SIGINT", () => {
    logger.info("Server dimatikan");

    void stopCrossInstance();

    // soket ditutup lebih dulu, kalau tidak server.close menunggu selamanya
    // karena koneksi WebSocket tidak pernah selesai dengan sendirinya
    for (const socket of wss.clients) socket.terminate();
    wss.close();

    server.close(() => process.exit(0));
  });
}

start();
