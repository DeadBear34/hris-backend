import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError, Conflict } from "../helpers/appError.js";
import { logger } from "../config/logger.js";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
}

const UNIQUE_VIOLATION = "23505";

// Pelanggaran UNIQUE dari database biasanya muncul saat permintaan yang sama
// datang bersamaan. Itu konflik data, bukan kesalahan server
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      code: "VALIDATION_ERROR",
      errors: err.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON format",
      code: "INVALID_JSON",
    });
  }

  const appError = isUniqueViolation(err)
    ? Conflict("Data already exists")
    : err;

  if (appError instanceof AppError) {
    return res.status(appError.statusCode).json({
      success: false,
      message: appError.message,
      code: appError.code,
      ...(appError.details ? { details: appError.details } : {}),
    });
  }

  logger.error(err);
  return res.status(500).json({
    success: false,
    message: "An error occurred on the server",
  });
}
