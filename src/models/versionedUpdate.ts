import type { QueryResultRow } from "pg";
import { pool } from "../config/databaseConnection.js";
import { sameVersion } from "../helpers/concurrency.js";
import type { Executor } from "./user.js";

interface VersionedUpdate<T> {
  // nama tabel dan kolom selalu konstanta dari model, tidak pernah dari input
  table: string;
  id: string;
  data: Record<string, unknown>;
  columns: readonly string[];
  casts?: Record<string, string>;
  returning: string;
  // false untuk tabel tanpa kolom deleted_at
  softDelete?: boolean;
  expectedUpdatedAt?: string;
  // dipakai bila tidak ada kolom yang berubah, supaya tidak menulis apa pun
  current: () => Promise<T | null>;
  // baru: bisa ikut transaksi
  // klien transaksi bila UPDATE harus satu transaksi dengan perubahan lain
  db?: Executor;
}

// UPDATE sebagian kolom dengan pemeriksaan versi updated_at. Kolom di luar
// daftar columns dan nilai undefined diabaikan. Null berarti barisnya sudah
// tidak ada atau sudah diubah orang lain, lihat rejectStaleUpdate
export async function updateVersioned<T extends QueryResultRow>({
  table,
  id,
  data,
  columns,
  casts = {},
  returning,
  softDelete = true,
  expectedUpdatedAt,
  current,
  db = pool,
}: VersionedUpdate<T>): Promise<T | null> {
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || !columns.includes(key)) continue;

    values.push(value);
    fields.push(`${key} = $${values.length}${casts[key] ?? ""}`);
  }

  if (fields.length === 0) return current();

  fields.push("updated_at = now()");
  values.push(id);
  const idParam = values.length;
  values.push(expectedUpdatedAt ?? null);

  // ubah: pakai db (bisa transaksi), bukan pool langsung
  const result = await db.query<T>(
    `UPDATE ${table}
     SET ${fields.join(", ")}
     WHERE id = $${idParam}::uuid${softDelete ? " AND deleted_at IS NULL" : ""}
       AND ${sameVersion("updated_at", values.length)}
     RETURNING ${returning}`,
    values,
  );

  return result.rows[0] ?? null;
}
