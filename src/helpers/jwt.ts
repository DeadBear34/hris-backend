import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export interface TokenPayload {
    id: string;
    email: string;
    role: string;
}

export function createToken(payload: TokenPayload): string {
    return jwt.sign(payload, env.JWT_SECRET, {
        expiresIn: env.JWT_EXPIRES_IN,
    } as jwt.SignOptions);
}

export function verifyToken(token: string): TokenPayload {
    return jwt.verify(token, env.JWT_SECRET) as TokenPayload;
}