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
          return next(BadRequest("File must be 5 MB or smaller"));
        }

        if (err.code === "LIMIT_UNEXPECTED_FILE") {
          return next(BadRequest(`File must be sent in the '${field}' field`));
        }

        return next(
          BadRequest(
            "The uploaded file could not be read, please upload it again",
          ),
        );
      }

      next(err);
    });
  };
}
