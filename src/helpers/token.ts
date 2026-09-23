import crypto from "node:crypto";

export function generateVerificationCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

export function generateResetToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function expiresInMinutes(minute: number): Date {
  return new Date(Date.now() + minute * 60_000);
}
