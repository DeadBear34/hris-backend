import type { NextFunction, Request, Response } from "express";
import { success, ZodError } from "zod";
import { AppError } from "../helpers/appError.js";
import { logger } from "../config/logger.js";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} tidak ditemukan`,
  });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
    //error dari validasi si zod
    if (err instanceof ZodError) {
    return res.status(400).json({
        success: false,
        message: "Validasi gagal",
        code: "VALIDATION_ERROR",
        errors: err.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
        })),
    });
    }

    //penanganan kalo json format tidak valid
    if (err instanceof SyntaxError && "body" in err) {
        return res.status(400).json({
            success: false,
            message: "Format JSON tidak valid",
            code: "INVALID_JSON"
        });
    }

    //error yang di sengaja dilempar sendiri
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
        success: false,
        message: err.message,
        code: err.code,
        });
    }

    //error yang ngga terduga
    logger.error(err);
    return res.status(500).json({
        success: false,
        message: "Terjadi kesalahan pada server",
    });
    }