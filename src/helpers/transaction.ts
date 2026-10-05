import type pg from "pg";
import { pool } from "../config/databaseConnection.js";
import { logger } from "../config/logger.js";

// Satu tempat untuk pola BEGIN, COMMIT, ROLLBACK, dan release.
//
// Koneksi baru diambil saat transaksi benar-benar dimulai, sehingga validasi
// dan pembacaan sebelum transaksi tidak menahan koneksi pool. Kalau ROLLBACK
// sendiri gagal, koneksinya sudah tidak bisa dipercaya, jadi dibuang dari pool
// alih-alih dikembalikan dalam keadaan transaksi menggantung. Kesalahan aslinya
// tetap yang dilempar, bukan kesalahan ROLLBACK
export async function withTransaction<T>(
  work: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let broken: Error | undefined;

  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");

    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {
      broken =
        rollbackErr instanceof Error ? rollbackErr : new Error("Rollback failed");
      logger.error({ err: rollbackErr }, "Failed to roll back transaction");
    }

    throw err;
  } finally {
    client.release(broken);
  }
}
