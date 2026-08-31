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
  photo_path: string | null;
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
  photo_path: string | null;
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

export interface UpdateOwnProfileInput {
  full_name?: string;
  phone?: string;
  birth_date?: string;
  address?: string;
}

const OWN_PROFILE_COLUMNS = [
  "full_name",
  "phone",
  "birth_date",
  "address",
] as const;

const UPDATABLE_COLUMNS = [
  "full_name",
  "phone",
  "gender",
  "birth_date",
  "address",
  "department_id",
  "position_id",
  "manager_id",
  "employment_status",
  "join_date",
  "resign_date",
  "is_active",
] as const;

const COLUMN_CAST: Record<string, string> = {
  gender: "::employee_gender",
  employment_status: "::employment_status",
  birth_date: "::date",
  join_date: "::date",
  resign_date: "::date",
  department_id: "::uuid",
  position_id: "::uuid",
  manager_id: "::uuid",
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
     VALUES ($1::uuid, $2, $3, $4::employee_gender)
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
  db: Executor,
  user_id: string | null,
  data: CreateEmployeeInput,
): Promise<Employee> {
  const result = await db.query<Employee>(
    `INSERT INTO employees
       (user_id, full_name, phone, gender, birth_date, address,
        department_id, position_id, manager_id, employment_status, join_date)
     VALUES ($1::uuid, $2, $3, $4::employee_gender, $5::date, $6,
             $7::uuid, $8::uuid, $9::uuid,
             COALESCE($10::employment_status, 'probation'),
             COALESCE($11::date, current_date))
     RETURNING *`,
    [
      user_id,
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

async function updateKolom(
  id: string,
  data: Record<string, unknown>,
  allowed: readonly string[],
): Promise<Employee | null> {
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (!allowed.includes(key)) continue;

    values.push(value);
    const cast = COLUMN_CAST[key] ?? "";
    fields.push(`${key} = $${values.length}${cast}`);
  }

  if (fields.length === 0) {
    return findById(id);
  }

  fields.push("updated_at = now()");
  values.push(id);

  const result = await pool.query<Employee>(
    `UPDATE employees
     SET ${fields.join(", ")}
     WHERE id = $${values.length}::uuid AND deleted_at IS NULL
     RETURNING *`,
    values,
  );

  return result.rows[0] ?? null;
}

export async function updateEmployee(
  id: string,
  data: UpdateEmployeeInput,
): Promise<Employee | null> {
  return updateKolom(id, data, UPDATABLE_COLUMNS);
}

export async function updateOwnProfile(
  id: string,
  data: UpdateOwnProfileInput,
): Promise<Employee | null> {
  return updateKolom(id, { ...data }, OWN_PROFILE_COLUMNS);
}

export async function softDeleteEmployee(
  db: Executor,
  id: string,
): Promise<Employee | null> {
  const result = await db.query<Employee>(
    `UPDATE employees
     SET deleted_at = now(), is_active = false, updated_at = now()
     WHERE id = $1::uuid AND deleted_at IS NULL
     RETURNING *`,
    [id],
  );

  return result.rows[0] ?? null;
}

export async function findById(id: string): Promise<Employee | null> {
  const result = await pool.query<Employee>(
    "SELECT * FROM employees WHERE id = $1::uuid AND deleted_at IS NULL",
    [id],
  );
  return result.rows[0] ?? null;
}

export async function findByUserId(user_id: string): Promise<Employee | null> {
  const result = await pool.query<Employee>(
    "SELECT * FROM employees WHERE user_id = $1::uuid AND deleted_at IS NULL",
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
       m.full_name AS manager_name, e.photo_path, e.is_active
     FROM employees e
     LEFT JOIN users u       ON u.id = e.user_id
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN positions p   ON p.id = e.position_id
     LEFT JOIN employees m   ON m.id = e.manager_id
     WHERE e.id = $1::uuid AND e.deleted_at IS NULL`,
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
    conditions.push(`e.department_id = $${values.length}::uuid`);
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
       m.full_name AS manager_name, e.photo_path, e.is_active
     ${baseFrom}
     ORDER BY e.employee_number ASC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );

  return { rows: dataResult.rows, total };
}

export async function findSubordinates(
  id: string,
): Promise<{ id: string; employee_number: string; full_name: string }[]> {
  const result = await pool.query<{
    id: string;
    employee_number: string;
    full_name: string;
  }>(
    `SELECT id, employee_number, full_name
     FROM employees
     WHERE manager_id = $1::uuid AND deleted_at IS NULL
     ORDER BY employee_number ASC`,
    [id],
  );
  return result.rows;
}

export async function isDescendantOf(
  candidateManagerId: string,
  employeeId: string,
): Promise<boolean> {
  const result = await pool.query<{ id: string }>(
    `WITH RECURSIVE rantai AS (
       SELECT id, manager_id
       FROM employees
       WHERE id = $1::uuid AND deleted_at IS NULL

       UNION ALL

       SELECT e.id, e.manager_id
       FROM employees e
       JOIN rantai r ON e.id = r.manager_id
       WHERE e.deleted_at IS NULL
     )
     SELECT id FROM rantai WHERE id = $2::uuid`,
    [candidateManagerId, employeeId],
  );

  return result.rows.length > 0;
}

export async function updatePhotoPath(
  id: string,
  photo_path: string | null,
): Promise<Employee | null> {
  const result = await pool.query<Employee>(
    `UPDATE employees SET photo_path = $2, updated_at = now()
     WHERE id = $1::uuid AND deleted_at IS NULL
     RETURNING *`,
    [id, photo_path],
  );

  return result.rows[0] ?? null;
}

// Membuat banyak karyawan sekaligus dalam satu query
export async function createEmployees(
  db: Executor,
  daftar: { user_id: string | null; data: CreateEmployeeInput }[],
): Promise<Employee[]> {
  if (daftar.length === 0) return [];

  const kolom = <T>(ambil: (baris: (typeof daftar)[number]) => T) =>
    daftar.map(ambil);

  const result = await db.query<Employee>(
    `INSERT INTO employees
       (user_id, full_name, phone, gender, birth_date, address,
        department_id, position_id, manager_id, employment_status, join_date)
     SELECT b.user_id::uuid, b.full_name, b.phone, b.gender::employee_gender,
            b.birth_date::date, b.address,
            b.department_id::uuid, b.position_id::uuid, b.manager_id::uuid,
            COALESCE(b.employment_status::employment_status, 'probation'),
            COALESCE(b.join_date::date, current_date)
     FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
                 $6::text[], $7::text[], $8::text[], $9::text[], $10::text[],
                 $11::text[])
       AS b(user_id, full_name, phone, gender, birth_date, address,
            department_id, position_id, manager_id, employment_status,
            join_date)
     RETURNING *`,
    [
      kolom((b) => b.user_id),
      kolom((b) => b.data.full_name),
      kolom((b) => b.data.phone),
      kolom((b) => b.data.gender),
      kolom((b) => b.data.birth_date ?? null),
      kolom((b) => b.data.address ?? null),
      kolom((b) => b.data.department_id ?? null),
      kolom((b) => b.data.position_id ?? null),
      kolom((b) => b.data.manager_id ?? null),
      kolom((b) => b.data.employment_status ?? null),
      kolom((b) => b.data.join_date ?? null),
    ],
  );

  if (result.rows.length !== daftar.length) {
    throw new Error("Gagal menyimpan sebagian data karyawan");
  }

  return result.rows;
}
