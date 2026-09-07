import { createHmac } from "node:crypto";
import { env } from "../config/env.js";

// Nama kanal diturunkan dari HMAC, bukan dari user_id mentah. Dengan begitu
// bocornya user_id lewat log atau respons lain tidak membuat orang bisa
// menguping kanal notifikasi milik orang tersebut.
//
// Tidak disimpan di database karena selalu dapat dihitung ulang dari
// user_id yang sama
export function channelFor(user_id: string): string | null {
  if (!env.NOTIFY_CHANNEL_SECRET) return null;

  const digest = createHmac("sha256", env.NOTIFY_CHANNEL_SECRET)
    .update(user_id)
    .digest("hex");

  // separuh digest sudah 128 bit, cukup untuk tidak bisa ditebak
  return `notif-${digest.slice(0, 32)}`;
}

export function realtimeEnabled(): boolean {
  return Boolean(
    env.NOTIFY_CHANNEL_SECRET &&
    env.SUPABASE_URL &&
    env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
