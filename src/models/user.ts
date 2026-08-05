import { pool } from "../config/databaseConnection.js";

export type UserRole = "employee" | "hr" | "admin";
export type UserGender = "male" | "female";

export interface User {
  id: string;
  email: string;
  password: string;
  full_name: string;
  phone: string;
  gender: UserGender;
  role: UserRole;
  is_active: boolean;
  terms_accepted_at: Date;
  created_at: Date;
  update_at: Date;
}

export async function insertUser(
  email: string,
  password: string,
  full_name: string,
  phone: string,
  gender: string,
  role: string,
  terms_accepted_at: Date,
): Promise<User> {
  const result = await pool.query<User>(
    `INSERT INTO users (email, password, full_name, phone, gender, role, terms_accepted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, email, full_name, phone, gender, role, is_active, terms_accepted_at, created_at, updated_at`,
    [email, password, full_name, phone, gender, role, terms_accepted_at],
  );

  const user = result.rows[0];
  if (!user) {
    throw new Error("Gagal menyimpan user");
  }

  return user;
}

export async function findById(id: string): Promise<User | null> {
  const result = await pool.query<User>(
    "SELECT id, email, full_name, phone, gender, role, is_active, terms_accepted_at, created_at, updated_at FROM users WHERE id = $1",
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