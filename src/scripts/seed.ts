import { pool } from "../config/databaseConnection.js";
import { hashPassword } from "../helpers/password.js";
import { logger } from "../config/logger.js";

interface SeedEmployee {
  email: string;
  full_name: string;
  phone: string;
  gender: "male" | "female";
  role: "employee" | "hr" | "admin";
  department_code: string;
  position_code: string;
  employment_status: "probation" | "contract" | "permanent" | "intern";
  join_date: string;
  manager_email?: string;
}

const PASSWORD_DEFAULT = "Password123";

const data: SeedEmployee[] = [
  {
    email: "hendra.wijaya@awan.io",
    full_name: "Hendra Wijaya",
    phone: "+628110000001",
    gender: "male",
    role: "admin",
    department_code: "PM",
    position_code: "CHIEF",
    employment_status: "permanent",
    join_date: "2018-03-01",
  },
  {
    email: "ratna.puspita@awan.io",
    full_name: "Ratna Puspita",
    phone: "+628110000002",
    gender: "female",
    role: "hr",
    department_code: "HR",
    position_code: "MANAGER",
    employment_status: "permanent",
    join_date: "2019-02-18",
    manager_email: "hendra.wijaya@awan.io",
  },
  {
    email: "bagus.nugroho@awan.io",
    full_name: "Bagus Nugroho",
    phone: "+628110000003",
    gender: "male",
    role: "hr",
    department_code: "ENG",
    position_code: "MANAGER",
    employment_status: "permanent",
    join_date: "2019-07-15",
    manager_email: "hendra.wijaya@awan.io",
  },
  {
    email: "lintang.pramesti@awan.io",
    full_name: "Lintang Pramesti",
    phone: "+628110000004",
    gender: "female",
    role: "employee",
    department_code: "QA",
    position_code: "LEAD",
    employment_status: "permanent",
    join_date: "2020-04-06",
    manager_email: "hendra.wijaya@awan.io",
  },
  {
    email: "yusuf.ramadhan@awan.io",
    full_name: "Yusuf Ramadhan",
    phone: "+628110000005",
    gender: "male",
    role: "employee",
    department_code: "OPS",
    position_code: "LEAD",
    employment_status: "permanent",
    join_date: "2020-08-17",
    manager_email: "hendra.wijaya@awan.io",
  },
  {
    email: "arum.wulandari@awan.io",
    full_name: "Arum Wulandari",
    phone: "+628110000006",
    gender: "female",
    role: "employee",
    department_code: "ENG",
    position_code: "SENIOR",
    employment_status: "permanent",
    join_date: "2021-01-11",
    manager_email: "bagus.nugroho@awan.io",
  },
  {
    email: "galih.saputra@awan.io",
    full_name: "Galih Saputra",
    phone: "+628110000007",
    gender: "male",
    role: "employee",
    department_code: "ENG",
    position_code: "SENIOR",
    employment_status: "permanent",
    join_date: "2021-06-21",
    manager_email: "bagus.nugroho@awan.io",
  },
  {
    email: "citra.melati@awan.io",
    full_name: "Citra Melati",
    phone: "+628110000008",
    gender: "female",
    role: "employee",
    department_code: "FIN",
    position_code: "SENIOR",
    employment_status: "permanent",
    join_date: "2021-09-06",
    manager_email: "hendra.wijaya@awan.io",
  },
  {
    email: "fajar.maulana@awan.io",
    full_name: "Fajar Maulana",
    phone: "+628110000009",
    gender: "male",
    role: "employee",
    department_code: "ENG",
    position_code: "SWE",
    employment_status: "permanent",
    join_date: "2022-02-14",
    manager_email: "bagus.nugroho@awan.io",
  },
  {
    email: "nadia.safitri@awan.io",
    full_name: "Nadia Safitri",
    phone: "+628110000010",
    gender: "female",
    role: "employee",
    department_code: "QA",
    position_code: "QA_ENG",
    employment_status: "permanent",
    join_date: "2022-05-30",
    manager_email: "lintang.pramesti@awan.io",
  },
  {
    email: "reza.firmansyah@awan.io",
    full_name: "Reza Firmansyah",
    phone: "+628110000011",
    gender: "male",
    role: "employee",
    department_code: "QA",
    position_code: "QA_ENG",
    employment_status: "contract",
    join_date: "2023-03-20",
    manager_email: "lintang.pramesti@awan.io",
  },
  {
    email: "salma.aulia@awan.io",
    full_name: "Salma Aulia",
    phone: "+628110000012",
    gender: "female",
    role: "employee",
    department_code: "FIN",
    position_code: "STAFF",
    employment_status: "permanent",
    join_date: "2022-11-01",
    manager_email: "citra.melati@awan.io",
  },
  {
    email: "dimas.prabowo@awan.io",
    full_name: "Dimas Prabowo",
    phone: "+628110000013",
    gender: "male",
    role: "employee",
    department_code: "OPS",
    position_code: "STAFF",
    employment_status: "contract",
    join_date: "2023-07-10",
    manager_email: "yusuf.ramadhan@awan.io",
  },
  {
    email: "intan.permata@awan.io",
    full_name: "Intan Permata",
    phone: "+628110000014",
    gender: "female",
    role: "employee",
    department_code: "PM",
    position_code: "STAFF",
    employment_status: "probation",
    join_date: "2026-06-01",
    manager_email: "hendra.wijaya@awan.io",
  },
  {
    email: "aditya.wibowo@awan.io",
    full_name: "Aditya Wibowo",
    phone: "+628110000015",
    gender: "male",
    role: "employee",
    department_code: "ENG",
    position_code: "INTERN",
    employment_status: "intern",
    join_date: "2026-08-03",
    manager_email: "bagus.nugroho@awan.io",
  },
];

async function seed() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const deptResult = await client.query<{ id: string; code: string }>(
      "SELECT id, code FROM departments WHERE deleted_at IS NULL",
    );
    const posResult = await client.query<{ id: string; code: string }>(
      "SELECT id, code FROM positions WHERE deleted_at IS NULL",
    );

    const departments = new Map(deptResult.rows.map((r) => [r.code, r.id]));
    const positions = new Map(posResult.rows.map((r) => [r.code, r.id]));

    if (departments.size === 0 || positions.size === 0) {
      throw new Error(
        "Tabel departments atau positions kosong. Jalankan skema SQL terlebih dahulu.",
      );
    }

    const hashed = await hashPassword(PASSWORD_DEFAULT);
    const employeeIdByEmail = new Map<string, string>();

    for (const item of data) {
      const sudahAda = await client.query(
        "SELECT id FROM users WHERE email = $1",
        [item.email],
      );

      if (sudahAda.rows.length > 0) {
        logger.info(`Dilewati, sudah ada: ${item.email}`);
        continue;
      }

      const userResult = await client.query<{ id: string }>(
        `INSERT INTO users
           (email, password, role, is_active, terms_accepted_at,
            approved_at, must_change_password)
         VALUES ($1, $2, $3::user_role, true, now(), now(), true)
         RETURNING id`,
        [item.email, hashed, item.role],
      );

      const userId = userResult.rows[0]?.id;
      if (!userId) throw new Error(`Gagal membuat akun ${item.email}`);

      const employeeResult = await client.query<{
        id: string;
        employee_number: string;
      }>(
        `INSERT INTO employees
           (user_id, full_name, phone, gender, department_id, position_id,
            employment_status, join_date)
         VALUES ($1::uuid, $2, $3, $4::employee_gender, $5::uuid, $6::uuid,
                 $7::employment_status, $8::date)
         RETURNING id, employee_number`,
        [
          userId,
          item.full_name,
          item.phone,
          item.gender,
          departments.get(item.department_code) ?? null,
          positions.get(item.position_code) ?? null,
          item.employment_status,
          item.join_date,
        ],
      );

      const employee = employeeResult.rows[0];
      if (!employee) throw new Error(`Gagal membuat karyawan ${item.email}`);

      employeeIdByEmail.set(item.email, employee.id);

      logger.info(
        `Dibuat: ${employee.employee_number} - ${item.full_name} (${item.role})`,
      );
    }

    for (const item of data) {
      if (!item.manager_email) continue;

      const employeeId = employeeIdByEmail.get(item.email);
      const managerId = employeeIdByEmail.get(item.manager_email);

      if (!employeeId || !managerId) continue;

      await client.query(
        "UPDATE employees SET manager_id = $2::uuid WHERE id = $1::uuid",
        [employeeId, managerId],
      );
    }

    await client.query("COMMIT");

    logger.info("Seed selesai");
    logger.info(`Password untuk seluruh akun: ${PASSWORD_DEFAULT}`);
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error(err, "Seed gagal");
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
