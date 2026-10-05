import express from "express";
import cors from "cors";
import helmet from "helmet";
import { allowedOrigins } from "./config/allowedOrigins.js";
import { env } from "./config/env.js";
import { parseTrustProxy } from "./config/trustProxy.js";
import { redisState } from "./config/redis.js";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler.js";
import { createRequestLogger } from "./middlewares/requestLogger.js";
import router from "./route/route.js";

export const app = express();

// Menentukan dari mana req.ip dibaca, dan rate limit menghitung per IP itu
app.set("trust proxy", parseTrustProxy(env.TRUST_PROXY));

// Satu baris per request. Dimatikan saat pengujian karena sebagian besar tes
// meniru logger dan memeriksa panggilannya, sehingga baris request akan ikut
// terhitung. Perilakunya diuji tersendiri lewat createRequestLogger
if (env.NODE_ENV !== "test") {
  app.use(createRequestLogger(env.NODE_ENV === "production"));
}

app.use(helmet());
app.use(
  cors({
    origin: allowedOrigins,
    // Browser menyembunyikan header non-standar dari JavaScript frontend
    // kecuali disebutkan di sini
    exposedHeaders: [
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "Retry-After",
    ],
  }),
);
app.use(express.json());

// Status Redis ikut ditampilkan supaya mudah memeriksa koneksinya, tetapi
// tidak memengaruhi status HTTP. Redis bersifat opsional, jadi server yang
// Redis-nya mati tetap dianggap sehat oleh pemeriksa kesehatan Railway
app.get("/health", (_req, res) => {
  res.json({ success: true, message: "Server running", redis: redisState() });
});

app.use("/api/v1", router);

app.use(notFoundHandler);
app.use(errorHandler);
