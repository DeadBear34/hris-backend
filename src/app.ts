import express from "express";
import cors from "cors";
import helmet from "helmet";
import { allowedOrigins } from "./config/allowedOrigins.js";
import { env } from "./config/env.js";
import { parseTrustProxy } from "./config/trustProxy.js";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler.js";
import router from "./route/route.js";

export const app = express();

// Menentukan dari mana req.ip dibaca, dan rate limit menghitung per IP itu
app.set("trust proxy", parseTrustProxy(env.TRUST_PROXY));

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

app.get("/health", (_req, res) => {
  res.json({ success: true, message: "Server running" });
});

app.use("/api/v1", router);

app.use(notFoundHandler);
app.use(errorHandler);
