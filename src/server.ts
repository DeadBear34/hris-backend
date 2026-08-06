import { app } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { testConnection } from "./config/databaseConnection.js";

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

    process.on("SIGINT", () => {
        logger.info("Server dimatikan");
        server.close(() => process.exit(0));
    });
}

start();