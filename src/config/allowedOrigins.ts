import { env } from "./env.js";

// Satu sumber kebenaran untuk REST maupun WebSocket, supaya keduanya tidak
// bisa berbeda aturan
export const allowedOrigins = env.CORS_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// Permintaan tanpa Origin datang dari luar browser: curl, aplikasi mobile,
// pengujian. Yang perlu dijaga hanya browser, karena hanya browser yang
// bisa disuruh menyambung oleh situs lain
export function originAllowed(origin: string | undefined): boolean {
  if (!origin) return true;

  return allowedOrigins.includes(origin);
}
