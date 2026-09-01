import pg from "pg";
import { env } from "./env.js";

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
});

export async function testConnection() {
  const result = await pool.query("SELECT NOW()");
  return result.rows[0];
}
