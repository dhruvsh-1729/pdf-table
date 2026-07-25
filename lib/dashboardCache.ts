// In-memory cache for the dashboard's aggregate dataset.
//
// /dashboard SSR pages through the entire records table (plus every summary and
// conclusion) on each load to compute its charts client-side. That is a few MB of
// Supabase egress per refresh, and the page is one people leave open and reload.
// The numbers it renders are aggregates, so serving them a few minutes stale is fine.
//
// Intentionally TTL-only rather than invalidated by record mutations: during active
// data entry a mutation hook would clear this on nearly every page load and the cache
// would never pay for itself. Tune with DASHBOARD_CACHE_TTL_MS; invalidateDashboardCache()
// is exported for callers that genuinely need an immediate refresh.

const DASHBOARD_CACHE_TTL_MS = Number(process.env.DASHBOARD_CACHE_TTL_MS || "300000");

type CacheEntry<T> = { ts: number; payload: T };

let cached: CacheEntry<any> | null = null;

export function getDashboardCacheTtlMs() {
  return DASHBOARD_CACHE_TTL_MS;
}

export function getCachedDashboardData<T>(): T | null {
  if (!cached) return null;
  if (Date.now() - cached.ts > DASHBOARD_CACHE_TTL_MS) {
    cached = null;
    return null;
  }
  return cached.payload as T;
}

export function setCachedDashboardData<T>(payload: T) {
  cached = { ts: Date.now(), payload };
}

export function invalidateDashboardCache() {
  cached = null;
}
