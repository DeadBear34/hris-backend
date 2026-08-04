import { pool } from "../config/databaseConnection.js";

export interface User {
  id: string;
  email: string;
  password: string;
  name: string;
  role: string;
  is_active: boolean;
  created_at: Date;
}

export async function insertUser(
  email: string,
  password: string,
  name: string,
  role: string,
): Promise<User> {
  const result = await pool.query<User>(
    `INSERT INTO users (email, password, name, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, name, role, is_active, created_at`,
    [email, password, name, role],
  );

  const user = result.rows[0];
  if (!user) {
    throw new Error("Gagal menyimpan user");
  }

  return user;
}

export async function findById(id: string): Promise<User | null> {
  const result = await pool.query<User>(
    "SELECT id, email, name, role, is_active, created_at FROM users WHERE id = $1",
    [id],
  );
  return result.rows[0] ?? null;
}

export async function findByEmail(email: string): Promise<User | null> {
  const result = await pool.query<User>(
    "SELECT * FROM users WHERE email = $1",
    [email],
  );
  return result.rows[0] ?? null;
}