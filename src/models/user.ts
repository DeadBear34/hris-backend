import pg from "pg";
import { pool } from "../config/databaseConnection.js";

export type UserRole = "employee" | "admin";
export type Executor = pg.Pool | pg.PoolClient;

export interface User {
  id: string;
  email: string;
  password: string;
  role: UserRole;
  is_active: boolean;
  terms_accepted_at: Date;
  approved_at: Date | null;
  approved_by: string | null;
  last_login_at: Date | null;
  must_change_password: boolean;
  email_verified_at: Date | null;
  password_changed_at: Date | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface SessionInfo {
  id: string;
  password_changed_at: Date | null;
}

export interface PendingUser {
  id: string;
  email: string;
  role: UserRole;
  full_name: string | null;
  phone: string | null;
  created_at: Date;
}

const SAFE_COLUMNS = `id, email, role, is_active, terms_accepted_at,
  approved_at, approved_by, last_login_at, must_change_password,
  email_verified_at, password_changed_at,
  deleted_at, created_at, updated_at`;

export async function insertUser(
  db: Executor,
  email: string,
  password: string,
  role: UserRole,
  terms_accepted_at: Date,
): Promise<User> {
  const result = await db.query<User>(
    `INSERT INTO users (email, password, role, terms_accepted_at)
     VALUES ($1, $2, $3::user_role, $4::timestamptz)
     RETURNING ${SAFE_COLUMNS}`,
    [email, password, role, terms_accepted_at],
  );

  const user = result.rows[0];
  if (!user) {
    throw new Error("Gagal menyimpan user");
  }

  return user;
}

export async function insertUserByAdmin(
  db: Executor,
  email: string,
  password: string,
  role: UserRole,
  approved_by: string,
): Promise<User> {
  const result = await db.query<User>(
    `INSERT INTO users
       (email, password, role, is_active, terms_accepted_at,
        password_changed_at, approved_by, must_change_password)
     VALUES ($1, $2, $3::user_role, true, now(), now(), $4::uuid, true)
     RETURNING ${SAFE_COLUMNS}`,
    [email, password, role, approved_by],
  );

  const user = result.rows[0];
  if (!user) {
    throw new Error("Gagal menyimpan akun");
  }

  return user;
}

export async function findById(id: string): Promise<User | null> {
  const result = await pool.query<User>(
    `SELECT ${SAFE_COLUMNS} FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function findByEmail(email: string): Promise<User | null> {
  const result = await pool.query<User>(
    "SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL",
    [email],
  );
  return result.rows[0] ?? null;
}

export async function updateLastLogin(id: string): Promise<void> {
  await pool.query("UPDATE users SET last_login_at = now() WHERE id = $1", [
    id,
  ]);
}

export async function updatePassword(
  id: string,
  password: string,
): Promise<void> {
  await pool.query(
    `UPDATE users
     SET password = $2, must_change_password = false,
         password_changed_at = now(), updated_at = now()
     WHERE id = $1`,
    [id, password],
  );
}

export async function setEmailVerified(id: string): Promise<User | null> {
  const result = await pool.query<User>(
    `UPDATE users
     SET email_verified_at = now(), updated_at = now()
     WHERE id = $1::uuid AND deleted_at IS NULL AND email_verified_at IS NULL
     RETURNING ${SAFE_COLUMNS}`,
    [id],
  );

  return result.rows[0] ?? null;
}

export async function findSessionInfo(id: string): Promise<SessionInfo | null> {
  const result = await pool.query<SessionInfo>(
    `SELECT id, password_changed_at FROM users
     WHERE id = $1::uuid AND deleted_at IS NULL`,
    [id],
  );

  return result.rows[0] ?? null;
}

export async function approveUser(
  id: string,
  approved_by: string,
): Promise<User | null> {
  const result = await pool.query<User>(
    `UPDATE users
     SET is_active = true, approved_at = now(),
         approved_by = $2::uuid, updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING ${SAFE_COLUMNS}`,
    [id, approved_by],
  );
  return result.rows[0] ?? null;
}

export async function setUserActive(
  id: string,
  is_active: boolean,
): Promise<User | null> {
  const result = await pool.query<User>(
    `UPDATE users
     SET is_active = $2, updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING ${SAFE_COLUMNS}`,
    [id, is_active],
  );
  return result.rows[0] ?? null;
}

export async function softDeleteUser(db: Executor, id: string): Promise<void> {
  await db.query(
    `UPDATE users
     SET deleted_at = now(), is_active = false, updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
}

export async function findPending(): Promise<PendingUser[]> {
  const result = await pool.query<PendingUser>(
    `SELECT u.id, u.email, u.role, e.full_name, e.phone, u.created_at
     FROM users u
     LEFT JOIN employees e ON e.user_id = u.id AND e.deleted_at IS NULL
     WHERE u.approved_at IS NULL AND u.deleted_at IS NULL
       AND u.email_verified_at IS NOT NULL
     ORDER BY u.created_at ASC`,
  );
  return result.rows;
}
