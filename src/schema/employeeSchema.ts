import { z } from "zod";

export const listEmployeeQuerySchema = z.object({
  search: z.string().trim().optional(),
  department_id: z.uuid("Department tidak valid").optional(),
  is_active: z
    .enum(["true", "false"])
    .optional()
    .transform((val) => (val === undefined ? undefined : val === "true")),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

const employeeDataSchema = z.object({
  full_name: z
    .string({ message: "Nama lengkap wajib diisi" })
    .trim()
    .min(3, "Nama lengkap minimal 3 karakter")
    .max(150, "Nama lengkap maksimal 150 karakter"),

  phone: z
    .string({ message: "Nomor telepon wajib diisi" })
    .trim()
    .regex(
      /^\+[1-9]\d{7,14}$/,
      "Nomor telepon harus diawali kode negara, contoh: +628123456789",
    ),

  gender: z.enum(["male", "female"], {
    message: "Jenis kelamin wajib dipilih",
  }),

  birth_date: z.iso.date("Tanggal lahir tidak valid").optional(),
  address: z
    .string()
    .trim()
    .max(500, "Alamat maksimal 500 karakter")
    .optional(),
  department_id: z.uuid("Departemen tidak valid").optional(),
  position_id: z.uuid("Jabatan tidak valid").optional(),
  manager_id: z.uuid("Manajer tidak valid").optional(),

  employment_status: z
    .enum(["probation", "contract", "permanent", "intern", "resigned"])
    .optional(),

  join_date: z.iso.date("Tanggal bergabung tidak valid").optional(),
});

export const createEmployeeSchema = employeeDataSchema.extend({
  email: z
    .string({ message: "Email wajib diisi" })
    .trim()
    .toLowerCase()
    .pipe(z.email("Format email tidak valid, contoh: nama@domain.com")),

  password: z
    .string({ message: "Password wajib diisi" })
    .min(8, "Password minimal 8 karakter")
    .max(72, "Password maksimal 72 karakter"),

  role: z.enum(["employee", "admin"]).optional(),
});

export const updateOwnProfileSchema = employeeDataSchema
  .pick({
    full_name: true,
    phone: true,
    birth_date: true,
    address: true,
  })
  .partial();

export const updateEmployeeSchema = employeeDataSchema.partial().extend({
  is_active: z.boolean().optional(),
  resign_date: z.iso.date("Tanggal resign tidak valid").optional(),
});
