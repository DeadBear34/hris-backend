const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  codes: string[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export function readFromCache(position_id: string): string[] | null {
  const entry = cache.get(position_id);

  if (!entry) return null;

  if (Date.now() >= entry.expiresAt) {
    cache.delete(position_id);
    return null;
  }

  return entry.codes;
}

export function writeToCache(position_id: string, codes: string[]): void {
  cache.set(position_id, {
    codes,
    expiresAt: Date.now() + CACHE_TTL_MS,
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
