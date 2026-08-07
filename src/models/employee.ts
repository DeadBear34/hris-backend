import { pool } from "../config/databaseConnection.js";
import type { Executor } from "./user.js";

export type EmployeeGender = "male" | "female";

export type EmploymentStatus =
  "probation" | "contract" | "permanent" | "intern" | "resigned";

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
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
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

export interface CreateEmployeeInput {
  full_name: string;
  phone: string;
  gender: EmployeeGender;
  birth_date?: string;
  address?: string;
  department_id?: string;
  position_id?: string;
  manager_id?: string;
  employment_status?: EmploymentStatus;
  join_date?: string;
}

export type UpdateEmployeeInput = Partial<CreateEmployeeInput> & {
  is_active?: boolean;
  resign_date?: string;
};

export async function insertEmployee(
  db: Executor,
  user_id: string,
  full_name: string,
  phone: string,
  gender: EmployeeGender,
): Promise<Employee> {
  const result = await db.query<Employee>(
    `INSERT INTO employees (user_id, full_name, phone, gender)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [user_id, full_name, phone, gender],
  );

  const employee = result.rows[0];
  if (!employee) {
    throw new Error("Gagal menyimpan data karyawan");
  }

  return employee;
}

export async function createEmployee(
  data: CreateEmployeeInput,
): Promise<Employee> {
  const result = await pool.query<Employee>(
    `INSERT INTO employees
       (full_name, phone, gender, birth_date, address,
        department_id, position_id, manager_id, employment_status, join_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
             COALESCE($9, 'probation'), COALESCE($10, current_date))
     RETURNING *`,
    [
      data.full_name,
      data.phone,
      data.gender,
      data.birth_date ?? null,
      data.address ?? null,
      data.department_id ?? null,
      data.position_id ?? null,
      data.manager_id ?? null,
      data.employment_status ?? null,
      data.join_date ?? null,
    ],
  );

  const employee = result.rows[0];
  if (!employee) {
    throw new Error("Gagal menyimpan data karyawan");
  }

  return employee;
}

export async function updateEmployee(
  id: string,
  data: UpdateEmployeeInput,
): Promise<Employee | null> {
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    values.push(value);
    fields.push(`${key} = $${values.length}`);
  }

  if (fields.length === 0) {
    return findById(id);
  }

  fields.push("updated_at = now()");
  values.push(id);

  const result = await pool.query<Employee>(
    `UPDATE employees
     SET ${fields.join(", ")}
     WHERE id = $${values.length} AND deleted_at IS NULL
     RETURNING *`,
    values,
  );

  return result.rows[0] ?? null;
}

export async function softDeleteEmployee(id: string): Promise<Employee | null> {
  const result = await pool.query<Employee>(
    `UPDATE employees
     SET deleted_at = now(), is_active = false, updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id],
  );

  return result.rows[0] ?? null;
}

export async function findById(id: string): Promise<Employee | null> {
  const result = await pool.query<Employee>(
    "SELECT * FROM employees WHERE id = $1 AND deleted_at IS NULL",
    [id],
  );
  return result.rows[0] ?? null;
}

export async function findByUserId(user_id: string): Promise<Employee | null> {
  const result = await pool.query<Employee>(
    "SELECT * FROM employees WHERE user_id = $1 AND deleted_at IS NULL",
    [user_id],
  );
  return result.rows[0] ?? null;
}

export async function findDetailById(
  id: string,
): Promise<EmployeeListItem | null> {
  const result = await pool.query<EmployeeListItem>(
    `SELECT
       e.id, e.employee_number, e.full_name, u.email,
       p.name AS position_name, d.name AS department_name,
       m.full_name AS manager_name, e.is_active
     FROM employees e
     LEFT JOIN users u       ON u.id = e.user_id
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN positions p   ON p.id = e.position_id
     LEFT JOIN employees m   ON m.id = e.manager_id
     WHERE e.id = $1 AND e.deleted_at IS NULL`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function listEmployees(
  params: ListParams,
): Promise<{ rows: EmployeeListItem[]; total: number }> {
  const conditions: string[] = ["e.deleted_at IS NULL"];
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

  const where = `WHERE ${conditions.join(" AND ")}`;

  const baseFrom = `
    FROM employees e
    LEFT JOIN users u       ON u.id = e.user_id
    LEFT JOIN departments d ON d.id = e.department_id
    LEFT JOIN positions p   ON p.id = e.position_id
    LEFT JOIN employees m   ON m.id = e.manager_id
    ${where}
  `;

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) ${baseFrom}`,
    values,
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  const offset = (params.page - 1) * params.limit;
  values.push(params.limit, offset);

  const dataResult = await pool.query<EmployeeListItem>(
    `SELECT
       e.id, e.employee_number, e.full_name, u.email,
       p.name AS position_name, d.name AS department_name,
       m.full_name AS manager_name, e.is_active
     ${baseFrom}
     ORDER BY e.employee_number ASC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );

  return { rows: dataResult.rows, total };
}
