import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler.js";
import router from "./route/route.js";

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ success: true, message: "Server berjalan" });
});

app.use("/api/v1", router);

app.use(notFoundHandler);
app.use(errorHandler);
