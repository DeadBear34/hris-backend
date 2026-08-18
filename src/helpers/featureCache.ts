/**
 * Cache fitur per jabatan di memori proses.
 *
 * Pemeriksaan fitur terjadi pada hampir setiap request, sedangkan daftar fitur
 * sebuah jabatan jarang berubah. Tanpa cache, satu request bisa memicu
 * beberapa query yang isinya sama persis.
 *
 * Sengaja tidak memakai Redis: masa berlakunya pendek dan setiap perubahan
 * pemberian fitur langsung membatalkan entrinya, sehingga jendela data basi
 * hampir tidak ada. Pada penyebaran multi-instance, entri di instance lain
 * paling lama tertinggal selama TTL di bawah ini.
 */
const MASA_BERLAKU_MS = 60_000;

interface Entri {
  codes: string[];
  kedaluwarsaPada: number;
}

const cache = new Map<string, Entri>();

export function ambilDariCache(position_id: string): string[] | null {
  const entri = cache.get(position_id);

  if (!entri) return null;

  if (Date.now() >= entri.kedaluwarsaPada) {
    cache.delete(position_id);
    return null;
  }

  return entri.codes;
}

export function simpanKeCache(position_id: string, codes: string[]): void {
  cache.set(position_id, {
    codes,
    kedaluwarsaPada: Date.now() + MASA_BERLAKU_MS,
  });
}

/**
 * Dipanggil setiap kali pemberian fitur sebuah jabatan berubah, supaya
 * perubahan langsung terasa tanpa menunggu masa berlaku habis.
 */
export function batalkanCacheFitur(position_id?: string): void {
  if (position_id) {
    cache.delete(position_id);
    return;
  }

  cache.clear();
}

/** Hanya dipakai pengujian untuk memastikan keadaan awal yang bersih. */
export function ukuranCacheFitur(): number {
  return cache.size;
}
