import { z } from "zod";
import { expectedUpdatedAt } from "./commonSchema.js";
import { todayInOfficeZone } from "../helpers/timezone.js";

// Sel kosong pada CSV terbaca sebagai string kosong, bukan tidak ada. Tanpa ini
// satu kolom opsional yang dibiarkan kosong akan menggagalkan seluruh barisnya
const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

function optionalField<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(blankToUndefined, schema.optional());
}

// Khusus update: null berarti kosongkan kolomnya, sedangkan tidak dikirim
// berarti biarkan nilai lama
function clearableField<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(blankToUndefined, schema.nullable().optional());
}

// Batas kewajaran tanggal. Usia kerja minimal mengikuti UU Ketenagakerjaan
export const MIN_WORKING_AGE = 15;
export const MAX_AGE = 100;
export const MAX_JOIN_DATE_DAYS_AHEAD = 365;

// Usia dihitung secara kalender, bukan dengan membagi selisih milidetik.
// Pembagian dengan rata-rata panjang tahun meleset di batasnya: seseorang yang
// tepat berulang tahun ke-100 hari ini bisa terhitung 100,002 tahun hanya
// karena Date.now() membawa jam saat ini sedangkan tanggal lahir dihitung dari
// tengah malam. Cara ini juga sama persis dengan perhitungan di frontend.
function ageFrom(birthDate: string): number {
  const [birthYear, birthMonth, birthDay] = birthDate.split("-").map(Number);
  const [nowYear, nowMonth, nowDay] = todayInOfficeZone()
    .split("-")
    .map(Number);

  if (!birthYear || !birthMonth || !birthDay) return 0;

  let age = nowYear! - birthYear;

  if (
    nowMonth! < birthMonth ||
    (nowMonth === birthMonth && nowDay! < birthDay)
  ) {
    age -= 1;
  }

  return age;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Selisih hari kalender terhadap hari ini menurut zona waktu kantor
function daysUntil(date: string): number {
  const target = new Date(`${date}T00:00:00Z`).getTime();
  const today = new Date(`${todayInOfficeZone()}T00:00:00Z`).getTime();

  return Math.round((target - today) / DAY_MS);
}

export const listEmployeeQuerySchema = z.object({
  search: z.string().trim().optional(),
  department_id: z.uuid("Invalid department").optional(),
  is_active: z
    .enum(["true", "false"])
    .optional()
    .transform((val) => (val === undefined ? undefined : val === "true")),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

const employeeDataSchema = z.object({
  full_name: z
    .string({ message: "Full name is required" })
    .trim()
    .min(3, "Full name must be at least 3 characters")
    .max(150, "Full name must be at most 150 characters"),

  phone: z
    .string({ message: "Phone number is required" })
    .trim()
    .regex(
      /^\+[1-9]\d{7,14}$/,
      "Phone number must start with a country code, example: +628123456789",
    ),

  gender: z.enum(["male", "female"], {
    message: "Gender is required",
  }),

  birth_date: optionalField(
    z.iso
      .date("Invalid birth date")
      .refine((value) => ageFrom(value) >= MIN_WORKING_AGE, {
        message: `Employee must be at least ${MIN_WORKING_AGE} years old`,
      })
      .refine((value) => ageFrom(value) <= MAX_AGE, {
        message: "Birth date is too far in the past, please check it again",
      }),
  ),

  address: optionalField(
    z.string().trim().max(500, "Address must be at most 500 characters"),
  ),

  department_id: optionalField(z.uuid("Invalid department")),
  position_id: optionalField(z.uuid("Invalid position")),
  manager_id: optionalField(z.uuid("Invalid manager")),

  employment_status: optionalField(
    z.enum(["probation", "contract", "permanent", "intern", "resigned"], {
      message: "Unknown employment status",
    }),
  ),

  join_date: optionalField(
    z.iso
      .date("Invalid join date")
      .refine((value) => daysUntil(value) <= MAX_JOIN_DATE_DAYS_AHEAD, {
        message: `Join date can be at most ${MAX_JOIN_DATE_DAYS_AHEAD} days ahead`,
      }),
  ),
});

// Tanggal bergabung mustahil mendahului tanggal lahir. Diperiksa di tingkat
// objek karena membandingkan dua kolom sekaligus
const datesMakeSense = (data: { birth_date?: unknown; join_date?: unknown }) =>
  typeof data.birth_date !== "string" ||
  typeof data.join_date !== "string" ||
  data.join_date >= data.birth_date;

const datesMakeSenseMessage = {
  message: "Join date cannot be before birth date",
  path: ["join_date"],
};

export const createEmployeeSchema = employeeDataSchema
  .extend({
    email: z
      .string({ message: "Email is required" })
      .trim()
      .toLowerCase()
      .pipe(z.email("Invalid email format, example: name@domain.com")),

    password: z
      .string({ message: "Password is required" })
      .min(8, "Password must be at least 8 characters")
      .max(72, "Password must be at most 72 characters"),

    role: optionalField(
      z.enum(["employee", "admin"], { message: "Unknown role" }),
    ),
  })
  .refine(datesMakeSense, datesMakeSenseMessage);

export const updateOwnProfileSchema = employeeDataSchema
  .pick({
    full_name: true,
    phone: true,
    birth_date: true,
    address: true,
  })
  .partial()
  .extend({ updated_at: expectedUpdatedAt });

export const updateEmployeeSchema = employeeDataSchema
  .partial()
  .extend({
    is_active: z.boolean().optional(),
    address: clearableField(
      z.string().trim().max(500, "Address must be at most 500 characters"),
    ),
    department_id: clearableField(z.uuid("Invalid department")),
    position_id: clearableField(z.uuid("Invalid position")),
    manager_id: clearableField(z.uuid("Invalid manager")),
    resign_date: clearableField(z.iso.date("Invalid resign date")),
    updated_at: expectedUpdatedAt,
  })
  .refine(datesMakeSense, datesMakeSenseMessage);

export const MAX_EMPLOYEES_PER_REQUEST = 20;

// Gerbang bentuk saja: objek berarti satu karyawan, array berarti banyak.
// Isi tiap baris diperiksa di controller agar galatnya dapat dilaporkan
// per baris beserta nama kolomnya
export const createEmployeePayloadSchema = z.union([
  z
    .array(z.unknown())
    .min(1, "At least one employee is required")
    .max(
      MAX_EMPLOYEES_PER_REQUEST,
      `At most ${MAX_EMPLOYEES_PER_REQUEST} employees per request`,
    ),
  z.record(z.string(), z.unknown()),
]);
