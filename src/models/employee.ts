import { pool } from "../config/databaseConnection.js";
import type { Executor } from "./user.js";

export type EmployeeGender = "male" | "female";
export type EmploymentStatus = "probation" | "contract" | "permanent" | "intern" | "resigned";

export interface Employee {
  id: string;
  user_id: string | null;
  employee_number: string;
  full_name: string;
  phone: string;
  gender: EmployeeGender;
  birth_date: Date | null;
  address: string | null;
  department_id: string | null;
  position_id: string | null;
  manager_id: string | null;
  employment_status: EmploymentStatus;
  join_date: Date;
  resign_date: Date | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export async function insertEmployee(db: Executor, user_id: string, full_name: string, phone: string, gender: EmployeeGender): Promise<Employee> {
    const result = await db.query<Employee>(
    `INSERT INTO employees (user_id, full_name, phone, gender)
    VALUES ($1, $2, $3, $4)
    RETURNING *`, [user_id, full_name, phone, gender]
  );

  const employee = result.rows[0];
  if (!employee) {
    throw new Error("Gagal menyimpan data karyawan");
  }
  return employee;
}

export async function findByUserId(user_id: string): Promise<Employee | null> {
  const result = await pool.query<Employee>(
    "SELECT * FROM employees WHERE user_id = $1", [user_id]
  );
  return result.rows[0] ?? null;
}

export async function findById(id: string): Promise<Employee | null> {
  const result = await pool.query<Employee>(
    "SELECT * FROM employees WHERE id = $1",[id]
  );
  return result.rows[0] ?? null;
}

export interface EmployeeListItem {
  id: string;
  employee_number: string;
  full_name: string;
  email: string | null;
  position_name: string | null;
  department_name: string | null;
  manager_name: string | null;
  is_active: boolean;
}

export interface ListParams {
  search?: string;
  department_id?: string;
  is_active?: boolean;
  page: number;
  limit: number;
}

export async function listEmployees(
  params: ListParams,
): Promise<{ rows: EmployeeListItem[]; total: number }> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.search) {
    values.push(`%${params.search}%`);
    const i = values.length;
    conditions.push(
      `(e.full_name ILIKE $${i} OR e.employee_number ILIKE $${i} OR u.email ILIKE $${i})`,
    );
  }

  if (params.department_id) {
    values.push(params.department_id);
    conditions.push(`e.department_id = $${values.length}`);
  }

  if (params.is_active !== undefined) {
    values.push(params.is_active);
    conditions.push(`e.is_active = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const baseFrom = `
    FROM employees e
    LEFT JOIN users u       ON u.id = e.user_id
    LEFT JOIN departments d ON d.id = e.department_id
    LEFT JOIN positions p   ON p.id = e.position_id
    LEFT JOIN employees m   ON m.id = e.manager_id ${where}`;

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) ${baseFrom}`, values,
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  const offset = (params.page - 1) * params.limit;
  values.push(params.limit, offset);

  const dataResult = await pool.query<EmployeeListItem>(
    `SELECT e.id, e.employee_number, e.full_name, u.email, p.name AS position_name, d.name AS department_name, m.full_name AS manager_name, e.is_active ${baseFrom}
    ORDER BY e.employee_number ASC
    LIMIT $${values.length - 1} OFFSET $${values.length}`, values,
  );
  return { rows: dataResult.rows, total };
}