import { pool } from "../config/databaseConnection.js";

export interface Department {
    id: string;
    code: string;
    name: string;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
}

export async function findAll(): Promise<Department[]> {
  const result = await pool.query<Department>(
    "SELECT * FROM departments WHERE is_active = true ORDER BY name ASC",
  );
  return result.rows;
}