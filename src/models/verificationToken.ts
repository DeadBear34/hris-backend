import { pool } from "../config/databaseConnection.js";

export type TokenPurpose = "email_verification" | "password_reset";

export interface VerificationToken {
  id: string;
  email: string;
  purpose: TokenPurpose;
  token_hash: string;
  expires_at: Date;
  consumed_at: Date | null;
  attempts: number;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
}

export interface CreateTokenInput {
  email: string;
  purpose: TokenPurpose;
  token_hash: string;
  expires_at: Date;
  ip_address?: string | null;
  user_agent?: string | null;
}

export async function createToken(
  data: CreateTokenInput,
): Promise<VerificationToken> {
  const result = await pool.query<VerificationToken>(
    `INSERT INTO verification_tokens
       (email, purpose, token_hash, expires_at, ip_address, user_agent)
     VALUES ($1, $2::token_purpose, $3, $4::timestamptz, $5, $6)
     RETURNING *`,
    [
      data.email,
      data.purpose,
      data.token_hash,
      data.expires_at,
      data.ip_address ?? null,
      data.user_agent ?? null,
    ],
  );

  const token = result.rows[0];
  if (!token) {
    throw new Error("Gagal menyimpan token verifikasi");
  }

  return token;
}

export async function findLatest(
  email: string,
  purpose: TokenPurpose,
): Promise<VerificationToken | null> {
  const result = await pool.query<VerificationToken>(
    `SELECT * FROM verification_tokens
     WHERE email = $1 AND purpose = $2::token_purpose
     ORDER BY created_at DESC
     LIMIT 1`,
    [email, purpose],
  );

  return result.rows[0] ?? null;
}

export async function findLatestActive(
  email: string,
  purpose: TokenPurpose,
): Promise<VerificationToken | null> {
  const result = await pool.query<VerificationToken>(
    `SELECT * FROM verification_tokens
     WHERE email = $1 AND purpose = $2::token_purpose
       AND consumed_at IS NULL AND expires_at > now()
     ORDER BY created_at DESC
     LIMIT 1`,
    [email, purpose],
  );

  return result.rows[0] ?? null;
}

export async function incrementAttempts(
  id: string,
): Promise<VerificationToken | null> {
  const result = await pool.query<VerificationToken>(
    `UPDATE verification_tokens
     SET attempts = attempts + 1
     WHERE id = $1::uuid
     RETURNING *`,
    [id],
  );

  return result.rows[0] ?? null;
}

export async function markConsumed(
  id: string,
): Promise<VerificationToken | null> {
  const result = await pool.query<VerificationToken>(
    `UPDATE verification_tokens
     SET consumed_at = now()
     WHERE id = $1::uuid AND consumed_at IS NULL
     RETURNING *`,
    [id],
  );

  return result.rows[0] ?? null;
}

export async function invalidateActive(
  email: string,
  purpose: TokenPurpose,
): Promise<number> {
  const result = await pool.query(
    `UPDATE verification_tokens
     SET consumed_at = now()
     WHERE email = $1 AND purpose = $2::token_purpose AND consumed_at IS NULL`,
    [email, purpose],
  );

  return result.rowCount ?? 0;
}
