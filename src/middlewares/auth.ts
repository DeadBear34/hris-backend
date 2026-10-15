import type { Request, Response, NextFunction } from "express";
import { verifyToken, type TokenPayload } from "../helpers/jwt.js";
import { sessionRejection } from "../helpers/sessionStore.js";
import { Unauthorized, Forbidden } from "../helpers/appError.js";
import { markRoles } from "../docs/routeMeta.js";

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
      throw Unauthorized("Token not found");
    }

    const token = header.split(" ")[1];

    if (!token) {
      throw Unauthorized("Invalid token");
    }

    payload = verifyToken(token);
  } catch (err) {
    return next(Unauthorized("Token is invalid or has expired"));
  }

  try {
    // Token yang tanda tangannya sah belum tentu masih boleh dipakai: bisa
    // sudah logout, akunnya dihapus atau dinonaktifkan, atau passwordnya
    // diganti setelah token terbit
    const rejection = await sessionRejection(payload);
    if (rejection) return next(Unauthorized(rejection));

    req.user = payload;
    next();
  } catch (err) {
    next(err);
  }
}

export function authorize(...roles: string[]) {
  return markRoles((req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(Unauthorized("You are not logged in, please log in first"));
    }

    if (!roles.includes(req.user.role)) {
      return next(Forbidden("You don't have access to this feature"));
    }
    next();
  }, roles);
}
