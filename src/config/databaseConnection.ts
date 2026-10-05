import pg from "pg";
import { env } from "./env.js";
import { logger } from "./logger.js";

// Kolom bertipe date dikembalikan apa adanya sebagai "YYYY-MM-DD".
//
// Bawaan driver mengubahnya menjadi objek Date pada zona waktu server, sehingga
// 1995-03-15 menjadi 1995-03-14T17:00:00Z ketika server berada di WIB. Klien
// yang memotong sepuluh karakter pertama akan membaca tanggalnya mundur sehari.
// Tanggal lahir dan tanggal bergabung tidak punya jam, jadi tidak seharusnya
// melewati konversi zona waktu sama sekali.
const OID_DATE = 1082;
pg.types.setTypeParser(OID_DATE, (value) => value);

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  // Menyambung ke Supabase yang tidak menjawab tidak boleh menggantung
  // permintaan selamanya
  connectionTimeoutMillis: 10_000,
  // Menjaga koneksi diam tetap hidup supaya tidak diputus diam-diam oleh
  // jaringan di antara server dan database
  keepAlive: true,
});

// Koneksi yang sedang diam di pool bisa diputus dari sisi database, misalnya
// ECONNRESET saat Supabase memutus koneksi. Tanpa pendengar ini pg melempar
// event error yang tidak ditangani dan seluruh proses ikut mati. Pool akan
// membuang koneksi rusak itu sendiri dan membuat yang baru saat dibutuhkan
pool.on("error", (err) => {
  logger.warn(
    { reason: err.message },
    "Idle database connection was closed unexpectedly",
  );
});

export async function testConnection() {
  const result = await pool.query("SELECT NOW()");
  return result.rows[0];
}
