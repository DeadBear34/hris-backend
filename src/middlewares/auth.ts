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
    const session = await userModel.findSessionInfo(payload.id);

    if (session?.password_changed_at && payload.iat !== undefined) {
      const changedAt = Math.floor(
        session.password_changed_at.getTime() / 1000,
      );

      if (payload.iat < changedAt) {
        return next(
          Unauthorized(
            "Your session is no longer valid because the password was changed, please log in again",
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
      return next(Unauthorized("You are not logged in, please log in first"));
    }

    if (!roles.includes(req.user.role)) {
      return next(Forbidden("You don't have access to this feature"));
    }
    next();
  };
}
