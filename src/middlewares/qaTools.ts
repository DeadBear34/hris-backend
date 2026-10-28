import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env.js";
import { notFoundHandler } from "./errorHandler.js";

// Kosong berarti menyala di luar production. Di production harus dinyalakan
// sengaja lewat QA_TOOLS_ENABLED=true, misalnya selama masa uji QA
export function qaToolsEnabled(): boolean {
  return env.QA_TOOLS_ENABLED === undefined
    ? env.NODE_ENV !== "production"
    : env.QA_TOOLS_ENABLED === "true";
}

// Dipasang paling depan. Saat dimatikan, rute dijawab persis seperti rute
// yang tidak ada, supaya keberadaannya tidak terbaca dari luar
export function requireQaTools(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!qaToolsEnabled()) return notFoundHandler(req, res);
  next();
}
