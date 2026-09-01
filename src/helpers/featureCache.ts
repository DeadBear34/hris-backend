const MASA_BERLAKU_MS = 60_000;

interface Entri {
  codes: string[];
  kedaluwarsaPada: number;
}

const cache = new Map<string, Entri>();

export function readFromCache(position_id: string): string[] | null {
  const entri = cache.get(position_id);

  if (!entri) return null;

  if (Date.now() >= entri.kedaluwarsaPada) {
    cache.delete(position_id);
    return null;
  }

  return entri.codes;
}

export function writeToCache(position_id: string, codes: string[]): void {
  cache.set(position_id, {
    codes,
    kedaluwarsaPada: Date.now() + MASA_BERLAKU_MS,
  });
}

export function invalidateFeatureCache(position_id?: string): void {
  if (position_id) {
    cache.delete(position_id);
    return;
  }

  cache.clear();
}

export function featureCacheSize(): number {
  return cache.size;
}
