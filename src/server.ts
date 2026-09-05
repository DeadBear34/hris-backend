import { app } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { testConnection } from "./config/databaseConnection.js";
import { attachSocketServer } from "./realtime/socketServer.js";

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

  process.on("SIGINT", () => {
    logger.info("Server dimatikan");

    // soket ditutup lebih dulu, kalau tidak server.close menunggu selamanya
    // karena koneksi WebSocket tidak pernah selesai dengan sendirinya
    for (const socket of wss.clients) socket.terminate();
    wss.close();

    server.close(() => process.exit(0));
  });
}

start();
