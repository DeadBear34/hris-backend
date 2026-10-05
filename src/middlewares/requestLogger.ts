import type { NextFunction, Request, Response } from "express";
import { logger } from "../config/logger.js";

export type RequestLogLevel = "debug" | "info" | "warn";

export const SLOW_REQUEST_MS = 1000;

const IGNORED_PATHS = new Set(["/health"]);

export function requestLogLevel(
  statusCode: number,
  durationMs: number,
  isProduction: boolean,
): RequestLogLevel {
  if (statusCode >= 500) return "warn";
  if (statusCode >= 400) return "info";
  if (durationMs >= SLOW_REQUEST_MS) return "info";

  return isProduction ? "info" : "debug";
}

export function createRequestLogger(isProduction: boolean) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (IGNORED_PATHS.has(req.path)) return next();

    const startedAt = process.hrtime.bigint();

    res.on("finish", () => {
      const durationMs = Math.round(
        Number(process.hrtime.bigint() - startedAt) / 1_000_000,
      );
      const level = requestLogLevel(res.statusCode, durationMs, isProduction);

      // Query string tidak ikut dicatat karena bisa membawa token, misalnya
      // tautan reset password dan verifikasi email
      const path = req.originalUrl.split("?")[0];

      logger[level](
        {
          method: req.method,
          path,
          status: res.statusCode,
          duration_ms: durationMs,
          user_id: req.user?.id ?? null,
        },
        `${req.method} ${path} ${res.statusCode} ${durationMs}ms`,
      );
    });

    next();
  };
}
