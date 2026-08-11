import crypto from "node:crypto";

/** Kode enam digit angka untuk verifikasi email, termasuk yang berawalan nol. */
export function generateVerificationCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Token acak 32 byte untuk tautan reset password. */
export function generateResetToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function expiresInMinutes(menit: number): Date {
  return new Date(Date.now() + menit * 60_000);
}
