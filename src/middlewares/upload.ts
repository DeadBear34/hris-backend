import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import { MAX_FILE_SIZE } from "../helpers/fileType.js";
import { BadRequest } from "../helpers/appError.js";

const uploader = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
});

export function uploadSingleImage(field: string) {
  const middleware = uploader.single(field);

  return (req: Request, res: Response, next: NextFunction) => {
    middleware(req, res, (err: unknown) => {
      if (!err) return next();

      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return next(BadRequest("Ukuran berkas maksimal 5 MB"));
        }

        if (err.code === "LIMIT_UNEXPECTED_FILE") {
          return next(BadRequest(`Berkas harus dikirim pada field '${field}'`));
        }

        return next(BadRequest("Berkas yang diunggah tidak dapat diproses"));
      }

      next(err);
    });
  };
}
