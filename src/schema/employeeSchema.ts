import { z } from "zod";

// Sel kosong pada CSV terbaca sebagai string kosong, bukan tidak ada. Tanpa ini
// satu kolom opsional yang dibiarkan kosong akan menggagalkan seluruh barisnya
const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

function optionalField<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(blankToUndefined, schema.optional());
}

// Batas kewajaran tanggal. Usia kerja minimal mengikuti UU Ketenagakerjaan
export const MIN_WORKING_AGE = 15;
export const MAX_AGE = 100;
export const MAX_JOIN_DATE_DAYS_AHEAD = 365;

const HARI_MS = 24 * 60 * 60 * 1000;

function yearsSince(date: string): number {
  return (Date.now() - new Date(`${date}T00:00:00Z`).getTime()) / (365.25 * HARI_MS);
}

function daysUntil(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getTime() - Date.now()) / HARI_MS;
}

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

  birth_date: optionalField(
    z.iso
      .date("Tanggal lahir tidak valid")
      .refine((value) => yearsSince(value) >= MIN_WORKING_AGE, {
        message: `Usia karyawan minimal ${MIN_WORKING_AGE} tahun`,
      })
      .refine((value) => yearsSince(value) <= MAX_AGE, {
        message: "Tanggal lahir terlalu jauh ke belakang, periksa kembali",
      }),
  ),

  address: optionalField(z.string().trim().max(500, "Alamat maksimal 500 karakter")),

  department_id: optionalField(z.uuid("Departemen tidak valid")),
  position_id: optionalField(z.uuid("Jabatan tidak valid")),
  manager_id: optionalField(z.uuid("Manajer tidak valid")),

  employment_status: optionalField(
    z.enum(["probation", "contract", "permanent", "intern", "resigned"], {
      message: "Status kepegawaian tidak dikenal",
    }),
  ),

  join_date: optionalField(
    z.iso
      .date("Tanggal bergabung tidak valid")
      .refine((value) => daysUntil(value) <= MAX_JOIN_DATE_DAYS_AHEAD, {
        message: `Tanggal bergabung paling jauh ${MAX_JOIN_DATE_DAYS_AHEAD} hari ke depan`,
      }),
  ),
});

// Tanggal bergabung mustahil mendahului tanggal lahir. Diperiksa di tingkat
// objek karena membandingkan dua kolom sekaligus
const datesMakeSense = (data: {
  birth_date?: unknown;
  join_date?: unknown;
}) =>
  typeof data.birth_date !== "string" ||
  typeof data.join_date !== "string" ||
  data.join_date >= data.birth_date;

const datesMakeSenseMessage = {
  message: "Tanggal bergabung tidak boleh mendahului tanggal lahir",
  path: ["join_date"],
};

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

  role: optionalField(z.enum(["employee", "admin"], { message: "Peran tidak dikenal" })),
}).refine(datesMakeSense, datesMakeSenseMessage);

export const updateOwnProfileSchema = employeeDataSchema
  .pick({
    full_name: true,
    phone: true,
    birth_date: true,
    address: true,
  })
  .partial();

export const updateEmployeeSchema = employeeDataSchema
  .partial()
  .extend({
    is_active: z.boolean().optional(),
    resign_date: optionalField(z.iso.date("Tanggal resign tidak valid")),
  })
  .refine(datesMakeSense, datesMakeSenseMessage);

export const MAX_EMPLOYEES_PER_REQUEST = 500;

// Gerbang bentuk saja: objek berarti satu karyawan, array berarti banyak.
// Isi tiap baris diperiksa di controller agar galatnya dapat dilaporkan
// per baris beserta nama kolomnya
export const createEmployeePayloadSchema = z.union([
  z
    .array(z.unknown())
    .min(1, "Minimal satu karyawan harus diisi")
    .max(
      MAX_EMPLOYEES_PER_REQUEST,
      `Maksimal ${MAX_EMPLOYEES_PER_REQUEST} karyawan dalam satu permintaan`,
    ),
  z.record(z.string(), z.unknown()),
]);
