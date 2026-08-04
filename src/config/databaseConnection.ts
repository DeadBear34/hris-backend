import pg from "pg";
import { env } from "./env.js";

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function testConnection() {
  const result = await pool.query("SELECT NOW()");
  return result.rows[0];
}