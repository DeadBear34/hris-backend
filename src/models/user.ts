import { pool } from "../config/databaseConnection.js";
import pg from "pg";

export type UserRole = "employee" | "hr" | "admin";
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
    created_at: Date;
    updated_at: Date;
}

export async function insertUser(db: Executor, email: string, password: string, role: UserRole, terms_accepted_at: Date): Promise<User> {
    const result = await db.query<User>(
        `INSERT INTO users (email, password, role, terms_accepted_at)
        VALUES ($1, $2, $3, $4)
        RETURNING id, email, role, is_active, terms_accepted_at,approved_at, approved_by, last_login_at, created_at, updated_at`,
        [email, password, role, terms_accepted_at]
    );

    const user = result.rows[0];
    if (!user) {
        throw new Error("Gagal menyimpan user");
    }
    return user;
}

export async function findById(id: string): Promise<User | null> {
    const result = await pool.query<User>(
        `SELECT id, email, role, is_active, terms_accepted_at, approved_at, approved_by, last_login_at, created_at, updated_at FROM users WHERE id = $1`, [id],
    );
    return result.rows[0] ?? null;
}

export async function findByEmail(email: string): Promise<User | null> {
    const result = await pool.query<User>(
        "SELECT * FROM users WHERE email = $1",
        [email]
    );
    return result.rows[0] ?? null;
}

export async function updateLastLogin(id: string): Promise<void> {
    await pool.query("UPDATE users SET last_login_at = now() WHERE id = $1", [id]);
}

export async function approveUser(id: string, approved_by: string): Promise<User | null> {
    const result = await pool.query<User>(
        `UPDATE users
        SET is_active = true, approved_at = now(), approved_by = $2, updated_at = now()
        WHERE id = $1
        RETURNING id, email, role, is_active, terms_accepted_at, approved_at, approved_by, last_login_at, created_at, updated_at`, [id, approved_by]
    );
    return result.rows[0] ?? null;
}

export async function setUserActive(id: string, is_active: boolean): Promise<User | null> {
    const result = await pool.query<User>(
        `UPDATE users
        SET is_active = $2, updated_at = now()
        WHERE id = $1
        RETURNING id, email, role, is_active, terms_accepted_at, approved_at, approved_by, last_login_at, created_at, updated_at`, [id, is_active]
    );
    return result.rows[0] ?? null;
}