import type { Request, Response, NextFunction } from "express";
import { verifyToken, type TokenPayload } from "../helpers/jwt.js";
import * as userModel from "../models/user.js";
import { Unauthorized, Forbidden } from "../helpers/appError.js";

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  let payload: TokenPayload;

  try {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      throw Unauthorized("Token tidak ditemukan");
    }

    const token = header.split(" ")[1];

    if (!token) {
      throw Unauthorized("Token tidak valid");
    }

    payload = verifyToken(token);
  } catch (err) {
    return next(Unauthorized("Token tidak valid atau sudah kedaluwarsa"));
  }

  try {
    const sesi = await userModel.findSessionInfo(payload.id);

    if (sesi?.password_changed_at && payload.iat !== undefined) {
      const changedAt = Math.floor(sesi.password_changed_at.getTime() / 1000);

      if (payload.iat < changedAt) {
        return next(
          Unauthorized(
            "Sesi sudah tidak berlaku karena password telah diubah, silakan login kembali",
          ),
        );
      }
    }

    req.user = payload;
    next();
  } catch (err) {
    next(err);
  }
}

export function authorize(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(
        Unauthorized("Kamu belum login, silakan masuk terlebih dahulu"),
      );
    }

    if (!roles.includes(req.user.role)) {
      return next(Forbidden("Kamu tidak punya akses ke fitur ini"));
    }
    next();
  };
}
