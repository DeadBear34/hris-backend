import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

// Umur token Realtime dibuat pendek. Frontend memintanya lagi lewat
// endpoint terautentikasi setiap kali menyambung ulang
const TTL_SECONDS = 60 * 60;

// Nama kanal privat milik satu pengguna. Harus cocok dengan kebijakan RLS
// di realtime.messages: topic() = 'notif:' || auth.uid()
export function topicFor(user_id: string): string {
  return `notif:${user_id}`;
}

export function realtimeEnabled(): boolean {
  return Boolean(
    env.SUPABASE_JWT_SECRET && env.SUPABASE_ANON_KEY && env.SUPABASE_URL,
  );
}

// Token kedua, khusus Realtime. Ditandatangani dengan rahasia milik
// Supabase, bukan JWT_SECRET aplikasi, supaya Supabase mau mengenalinya.
// sub diisi users.id agar auth.uid() di kebijakan RLS bernilai sama
export function mintRealtimeToken(user_id: string): string | null {
  if (!env.SUPABASE_JWT_SECRET) return null;

  return jwt.sign(
    {
      sub: user_id,
      role: "authenticated",
      aud: "authenticated",
    },
    env.SUPABASE_JWT_SECRET,
    { algorithm: "HS256", expiresIn: TTL_SECONDS },
  );
}

export const REALTIME_TOKEN_TTL = TTL_SECONDS;
