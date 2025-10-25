// pages/api/records.ts
import { createClient } from "@supabase/supabase-js";
import type { NextApiRequest, NextApiResponse } from "next";
import NodeCache from "node-cache";

const supabase = createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");

// Initialize cache with 5 minute TTL
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// Cache key generators
const getCacheKey = (params: any) => {
  return `records:${JSON.stringify(params)}`;
};

const CACHE_VERSION_KEY = "cache_version";
let cacheVersion = 1;

// Function to invalidate all caches
export function invalidateRecordsCache() {
  cacheVersion++;
  cache.flushAll();
}

/** ==============================================================
 * Utility formatters (same as before)
 * ============================================================== */
function formatValue(v: any) {
  if (v === null || v === undefined) return null;
  try {
    const parsed = JSON.parse(v);
    if (Array.isArray(parsed)) return parsed.join(", ");
    if (typeof parsed === "object") return JSON.stringify(parsed);
    return parsed;
  } catch {
    return v;
  }
}

function timeFromNow(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}

interface FilterParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  filters?: Record<string, any>;
  globalFilter?: string;
  email?: string;
}

/** ==============================================================
 * Helper to fetch *all* rows from a Supabase table (bypass 1000-row limit)
 * ============================================================== */
async function fetchAllRows<T = any>(table: string, columns = "*", filters?: (query: any) => any): Promise<T[]> {
  const pageSize = 1000;
  let from = 0;
  const all: T[] = [];

  while (true) {
    let q = supabase
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1);
    if (filters) q = filters(q);

    const { data, error } = await q;
    if (error) throw error;
    if (!data || !Array.isArray(data) || data.length === 0) break;

    all.push(...(data as T[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

/** ==============================================================
 * Main function — fetchPaginatedRecords (now no row limit)
 * ============================================================== */
async function fetchPaginatedRecords(params: FilterParams) {
  const { page, pageSize, sortBy = "id", sortOrder = "desc", filters = {}, globalFilter, email } = params;

  /** ------------------------------------------
   * Step 1: handle email filter (collect record IDs)
   * ------------------------------------------ */
  let allowedRecordIds: string[] | null = null;

  if (email) {
    const formattedEmail = `["${email.trim()}"]`;

    const [summaryRecords, conclusionRecords, directRecords] = await Promise.all([
      fetchAllRows("summaries", "record_id", (q) => q.eq("email", formattedEmail)),
      fetchAllRows("conclusions", "record_id", (q) => q.eq("email", formattedEmail)),
      fetchAllRows("records", "id", (q) => q.eq("email", formattedEmail)),
    ]);

    const uniqueRecordIds = new Set<string>();
    summaryRecords.forEach((r: any) => uniqueRecordIds.add(r.record_id));
    conclusionRecords.forEach((r: any) => uniqueRecordIds.add(r.record_id));
    directRecords.forEach((r: any) => uniqueRecordIds.add(r.id));

    if (uniqueRecordIds.size === 0) {
      return { data: [], count: 0, editHistory: {} };
    }

    allowedRecordIds = Array.from(uniqueRecordIds);
  }

  /** ------------------------------------------
   * Step 2: fetch *all* records (no limit)
   * ------------------------------------------ */
  const records: any[] = await fetchAllRows(
    "records",
    `
      *,
      record_tags!left(tags(id, name)),
      record_authors!left(authors(id, name))
    `,
    (q) => {
      if (allowedRecordIds) q = q.in("id", allowedRecordIds);
      // Apply filters
      Object.entries(filters).forEach(([key, value]) => {
        if (value === null || value === undefined || value === "") return;
        if (key === "id") {
          q = q.filter("id", "gte", value);
          q = q.filter("id", "lt", String(Number(value) + 1));
        } else if (key === "tags" || key === "authors") {
          // skip — handled later
        } else if (typeof value === "string") {
          q = q.ilike(key, `%${value}%`);
        } else {
          q = q.eq(key, value);
        }
      });

      // Apply global filter if needed
      if (globalFilter) {
        q = q.or(
          `name.ilike.%${globalFilter}%,summary.ilike.%${globalFilter}%,conclusion.ilike.%${globalFilter}%,title_name.ilike.%${globalFilter}%`,
        );
      }

      // Sorting
      q = q.order(sortBy, { ascending: sortOrder === "asc" });
      return q;
    },
  );

  const count = records.length;

  /** ------------------------------------------
   * Step 3: compute pagination slice (client-side)
   * ------------------------------------------ */
  const from = page * pageSize;
  const to = from + pageSize;
  const paginatedRecords = records.slice(from, to);

  /** ------------------------------------------
   * Step 4: build edit history for these records
   * ------------------------------------------ */
  const recordIds = paginatedRecords.map((r) => r.id);
  const editHistory: Record<string, any> = {};

  if (recordIds.length > 0) {
    const summaries = await fetchAllRows("summaries", "record_id, email, name, created_at", (q) =>
      q.in("record_id", recordIds),
    );

    summaries.forEach((summary: any) => {
      const rid = formatValue(summary.record_id);
      const name = formatValue(summary.name);
      const email = formatValue(summary.email);
      const createdAt = summary.created_at;

      if (!editHistory[rid]) {
        editHistory[rid] = {
          count: 0,
          editors: [],
          editorCounts: {},
          latest: null,
          latestTime: 0,
        };
      }

      editHistory[rid].count++;
      if (email && name && !editHistory[rid].editors.includes(name)) {
        editHistory[rid].editors.push(name);
      }
      if (name) {
        editHistory[rid].editorCounts[name] = (editHistory[rid].editorCounts[name] || 0) + 1;
      }
      if (createdAt) {
        const currentTime = new Date(createdAt).getTime();
        if (currentTime > editHistory[rid].latestTime) {
          editHistory[rid].latestTime = currentTime;
          editHistory[rid].latest = {
            name: name || "",
            email: email || "",
            editedAt: createdAt,
          };
        }
      }
    });
  }

  /** ------------------------------------------
   * Step 5: format records
   * ------------------------------------------ */
  const formattedRecords = paginatedRecords.map((record) => {
    const formatted: any = {};

    // Linked tags
    if (record.record_tags) {
      formatted.tags = record.record_tags.map((rt: any) => rt.tags).filter(Boolean);
    }

    // Linked authors
    if (record.record_authors) {
      formatted.authors_linked = record.record_authors.map((ra: any) => ra.authors).filter(Boolean);
    }

    // Other fields
    Object.keys(record).forEach((key) => {
      if (key !== "record_tags" && key !== "record_authors") {
        formatted[key] = formatValue(record[key]);
      }
    });

    // Edit history
    formatted.editHistory = editHistory[formatted.id]
      ? {
          count: editHistory[formatted.id].count,
          editors: editHistory[formatted.id].editors,
          editorCounts: editHistory[formatted.id].editorCounts,
          latestEditor: editHistory[formatted.id].latest
            ? {
                name: editHistory[formatted.id].latest.name,
                email: editHistory[formatted.id].latest.email,
                editedAt: editHistory[formatted.id].latest.editedAt,
                timeFromNow: timeFromNow(editHistory[formatted.id].latest.editedAt),
              }
            : null,
        }
      : {
          count: 0,
          editors: [],
          editorCounts: {},
          latestEditor: null,
        };

    return formatted;
  });

  /** ------------------------------------------
   * Step 6: post-filter for tags and authors
   * ------------------------------------------ */
  let filteredRecords = formattedRecords;

  if (filters.tags) {
    if (filters.tags === "__EMPTY__") {
      filteredRecords = filteredRecords.filter((r) => !r.tags || r.tags.length === 0);
    } else if (filters.tags === "__NONEMPTY__") {
      filteredRecords = filteredRecords.filter((r) => r.tags && r.tags.length > 0);
    } else {
      filteredRecords = filteredRecords.filter((r) =>
        r.tags?.some((tag: any) => tag.name.toLowerCase() === filters.tags.toLowerCase()),
      );
    }
  }

  if (filters.authors) {
    if (filters.authors === "__EMPTY__") {
      filteredRecords = filteredRecords.filter((r) => !r.authors_linked || r.authors_linked.length === 0);
    } else if (filters.authors === "__NONEMPTY__") {
      filteredRecords = filteredRecords.filter((r) => r.authors_linked && r.authors_linked.length > 0);
    } else {
      filteredRecords = filteredRecords.filter((r) =>
        r.authors_linked?.some((author: any) => author.name.toLowerCase() === filters.authors.toLowerCase()),
      );
    }
  }

  /** ------------------------------------------
   * Step 7: return final structured output
   * ------------------------------------------ */
  return {
    data: filteredRecords,
    count: count,
    editHistory,
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    // Parse query parameters
    const {
      page = "0",
      pageSize = "20",
      sortBy = "id",
      sortOrder = "desc",
      filters = "{}",
      globalFilter = "",
      email = "",
      noCache = "false",
    } = req.query;

    const params: FilterParams = {
      page: parseInt(page as string),
      pageSize: parseInt(pageSize as string),
      sortBy: sortBy as string,
      sortOrder: sortOrder as "asc" | "desc",
      filters: JSON.parse(filters as string),
      globalFilter: globalFilter as string,
      email: email as string,
    };

    // Generate cache key
    const cacheKey = `${CACHE_VERSION_KEY}:${cacheVersion}:${getCacheKey(params)}`;

    // Check cache unless explicitly disabled
    if (noCache !== "true") {
      const cachedData = cache.get(cacheKey);
      if (cachedData) {
        console.log("🎯 Cache hit for:", cacheKey);
        return res.status(200).json(cachedData);
      }
    }

    console.log("🔍 Cache miss, fetching from database...");

    // Fetch from database
    const result = await fetchPaginatedRecords(params);

    // Store in cache
    cache.set(cacheKey, result);

    return res.status(200).json(result);
  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({
      error: "Server error",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

// Export cache invalidation for use in other API routes
export { invalidateRecordsCache as invalidateCache };
