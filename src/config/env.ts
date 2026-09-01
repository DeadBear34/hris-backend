import "dotenv/config";
import { z } from "zod";

const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().default(8080),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL wajib diisi"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET minimal 32 karakter"),
  JWT_EXPIRES_IN: z.string().default("24h"),
  RESEND_API_KEY: z.preprocess(
    blankToUndefined,
    z.string().min(1).optional(),
  ),

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
  TIMEZONE: z.preprocess(
    blankToUndefined,
    z.string().default("Asia/Jakarta"),
  ),

  CRON_SECRET: z.preprocess(
    blankToUndefined,
    z.string().min(16, "CRON_SECRET minimal 16 karakter").optional(),
  ),

  SUPABASE_STORAGE_BUCKET: z.preprocess(
    blankToUndefined,
    z.string().default("leave-attachments"),
  ),

  SUPABASE_PHOTO_BUCKET: z.preprocess(
    blankToUndefined,
    z.string().default("employee-photos"),
  ),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Environment variable tidak valid:");
  console.error(parsed.error.issues);
  process.exit(1);
}

export const env = parsed.data;
