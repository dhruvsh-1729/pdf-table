const QUERY_CACHE_TTL_MS = Number(process.env.RECORDS_QUERY_CACHE_TTL_MS || "60000");

type CacheEntry = { ts: number; payload: any };

const queryCache = new Map<string, CacheEntry>();

export function getRecordsQueryCacheTtlMs() {
  return QUERY_CACHE_TTL_MS;
}

export function getCachedResponse(key: string) {
  const cached = queryCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.ts > QUERY_CACHE_TTL_MS) {
    queryCache.delete(key);
    return null;
  }
  return cached.payload;
}

export function setCachedResponse(key: string, payload: any) {
  queryCache.set(key, { ts: Date.now(), payload });
}

export function invalidateRecordsCache() {
  queryCache.clear();
}
