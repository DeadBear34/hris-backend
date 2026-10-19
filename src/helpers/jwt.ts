import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";

export interface TokenPayload {
  id: string;
  email: string;
  role: string;
  // id unik per token, dipakai untuk mencabut satu sesi saat logout.
  // Token lama yang diterbitkan sebelum ada jti tidak memilikinya
  jti?: string;
  iat?: number;
  exp?: number;
}

export function createToken(payload: TokenPayload): string {
  // jti, iat, dan exp selalu dibuat baru di sini. jsonwebtoken menolak
  // payload yang sudah membawanya bersamaan dengan opsi jwtid atau expiresIn
  const { jti: _jti, iat: _iat, exp: _exp, ...claims } = payload;

  return jwt.sign(claims, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
    jwtid: randomUUID(),
  } as jwt.SignOptions);
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as TokenPayload;
}
