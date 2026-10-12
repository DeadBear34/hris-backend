import type { NextFunction, Request, Response } from "express";
import { Forbidden } from "../helpers/appError.js";
import { TRY_IT_OUT_HEADER } from "../docs/openapi.js";

const READ_ONLY = new Set(["GET", "HEAD", "OPTIONS"]);

// Lapisan pengaman kedua untuk tombol "Try it out" di halaman dokumentasi.
// Halaman dokumentasi menandai setiap percobaan dengan header khusus, dan di
// production percobaan yang mengubah data ditolak walaupun halaman frontend
// salah diatur. Ini bukan batas keamanan utama: hak akses tetap ditentukan
// token dan fitur pengguna, yang sama persis seperti saat memakai aplikasi
export function createTryItOutGuard(isProduction: boolean) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (
      isProduction &&
      req.headers[TRY_IT_OUT_HEADER] !== undefined &&
      !READ_ONLY.has(req.method)
    ) {
      return next(
        Forbidden(
          "Only GET requests can be tried from the API documentation in production",
        ),
      );
    }

    next();
  };
}
