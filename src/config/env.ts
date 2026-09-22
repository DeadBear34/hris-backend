import "dotenv/config";
import { z } from "zod";

const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().default(8080),
  // Boleh berisi beberapa asal dipisah koma, misalnya saat frontend
  // dijalankan di beberapa laptop
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("24h"),
  RESEND_API_KEY: z.preprocess(blankToUndefined, z.string().min(1).optional()),

  MAIL_DRIVER: z.preprocess(
    blankToUndefined,
    z.enum(["log", "resend"]).optional(),
  ),
  MAIL_FROM: z.preprocess(
    blankToUndefined,
    z.string().default("HRIS <onboarding@resend.dev>"),
  ),
  APP_URL: z.preprocess(
    blankToUndefined,
    z.string().default("http://localhost:5173"),
  ),

  SUPABASE_URL: z.preprocess(blankToUndefined, z.string().min(1).optional()),
  SUPABASE_SERVICE_ROLE_KEY: z.preprocess(
    blankToUndefined,
    z.string().min(1).optional(),
  ),
  TIMEZONE: z.preprocess(blankToUndefined, z.string().default("Asia/Jakarta")),

  CRON_SECRET: z.preprocess(
    blankToUndefined,
    z.string().min(16, "CRON_SECRET must be at least 16 characters").optional(),
  ),

  SUPABASE_STORAGE_BUCKET: z.preprocess(
    blankToUndefined,
    z.string().default("leave-attachments"),
  ),

  SUPABASE_PHOTO_BUCKET: z.preprocess(
    blankToUndefined,
    z.string().default("employee-photos"),
  ),

  // Kosong berarti menyala, kecuali saat pengujian. Test lama memanggil login
  // berkali-kali dengan email yang sama dan akan tertahan oleh batasnya
  RATE_LIMIT_ENABLED: z.preprocess(
    blankToUndefined,
    z.enum(["true", "false"]).optional(),
  ),

  // Wajib diisi bila server berada di balik reverse proxy atau load balancer.
  // Tanpa ini semua klien terlihat ber-IP sama, yaitu IP proxy-nya
  TRUST_PROXY: z.preprocess(blankToUndefined, z.string().optional()),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(parsed.error.issues);
  process.exit(1);
}

export const env = parsed.data;
