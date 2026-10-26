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

const BODY_ERRORS: Record<
  string,
  { status: number; message: string; code: string }
> = {
  "encoding.unsupported": {
    status: 415,
    message: "Compressed request bodies are not supported",
    code: "UNSUPPORTED_ENCODING",
  },
  "entity.too.large": {
    status: 413,
    message: "Request body is too large",
    code: "PAYLOAD_TOO_LARGE",
  },
  "charset.unsupported": {
    status: 415,
    message: "Unsupported request charset",
    code: "UNSUPPORTED_CHARSET",
  },
};

function bodyParserError(err: unknown) {
  if (typeof err !== "object" || err === null) return null;
  const type = (err as { type?: unknown }).type;

  return typeof type === "string" ? (BODY_ERRORS[type] ?? null) : null;
}

// constraint EXCLUDE, misalnya dua cuti aktif yang tanggalnya bertumpuk
const EXCLUSION_VIOLATION = "23P01";

// Pelanggaran UNIQUE atau EXCLUDE dari database biasanya muncul saat
// permintaan yang sama datang bersamaan dan sama-sama lolos pemeriksaan di
// aplikasi. Itu konflik data, bukan kesalahan server
function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;

  return code === UNIQUE_VIOLATION || code === EXCLUSION_VIOLATION;
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

  // Penolakan dari body-parser (body terkompresi, terlalu besar, charset
  // asing) adalah kesalahan klien, bukan kesalahan server
  const bodyError = bodyParserError(err);
  if (bodyError) {
    return res.status(bodyError.status).json({
      success: false,
      message: bodyError.message,
      code: bodyError.code,
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
