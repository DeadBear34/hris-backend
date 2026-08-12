import "dotenv/config";
import { z } from "zod";

const kosongJadiUndefined = (nilai: unknown) =>
  typeof nilai === "string" && nilai.trim() === "" ? undefined : nilai;

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
    kosongJadiUndefined,
    z.string().min(1).optional(),
  ),

  MAIL_DRIVER: z.preprocess(
    kosongJadiUndefined,
    z.enum(["log", "resend"]).optional(),
  ),
  MAIL_FROM: z.preprocess(
    kosongJadiUndefined,
    z.string().default("HRIS <onboarding@resend.dev>"),
  ),
  APP_URL: z.preprocess(
    kosongJadiUndefined,
    z.string().default("http://localhost:5173"),
  ),

  // penyimpanan lampiran cuti. dibuat opsional supaya aplikasi tetap jalan
  // tanpa Supabase, hanya fitur unggah lampiran yang tidak tersedia
  SUPABASE_URL: z.preprocess(
    kosongJadiUndefined,
    z.string().min(1).optional(),
  ),
  SUPABASE_SERVICE_ROLE_KEY: z.preprocess(
    kosongJadiUndefined,
    z.string().min(1).optional(),
  ),
  SUPABASE_STORAGE_BUCKET: z.preprocess(
    kosongJadiUndefined,
    z.string().default("leave-attachments"),
  ),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Environment variable tidak valid:");
  console.error(parsed.error.issues);
  process.exit(1);
}

export const env = parsed.data;
