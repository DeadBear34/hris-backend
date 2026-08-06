import { pool } from "../config/databaseConnection.js";

export interface Position {
    id: string;
    code: string;
    name: string;
    level: number;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
}

export async function findAll(): Promise<Position[]> {
    const result = await pool.query<Position>(
        "SELECT * FROM positions WHERE is_active = true ORDER BY level ASC, name ASC",
    );
    return result.rows;
}