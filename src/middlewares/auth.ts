import type { Request, Response, NextFunction } from "express";
import { verifyToken, type TokenPayload } from "../helpers/jwt.js";
import { Unauthorized, Forbidden } from "../helpers/appError.js";

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      throw Unauthorized("Token tidak ditemukan");
    }

    const token = header.split(" ")[1];

    if (!token) {
      throw Unauthorized("Token tidak valid");
    }

    req.user = verifyToken(token);
    next();
  } catch (err) {
    next(Unauthorized("Token tidak valid atau sudah kedaluwarsa"));
  }
}

export function authorize(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(Unauthorized("Belum login"));
    }

    if (!roles.includes(req.user.role)) {
      return next(Forbidden("Kamu tidak punya akses ke resource ini"));
    }

    next();
  };
}