// pages/api/records-paginated.ts
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

// Format value helper
function formatValue(value: any): any {
  if (typeof value !== "string") {
    if (Array.isArray(value) && value.length === 1 && typeof value[0] === "string") {
      return formatValue(value[0]);
    }
    return value === null || value === undefined ? "" : value;
  }

  if (!value.includes("[") && !value.includes("{") && !value.includes('"')) {
    return value.trim();
  }

  let parsed = value;
  if ((value.startsWith("[") && value.endsWith("]")) || (value.startsWith("{") && value.endsWith("}"))) {
    try {
      const jsonParsed = JSON.parse(value);
      if (Array.isArray(jsonParsed) && jsonParsed.length === 1 && typeof jsonParsed[0] === "string") {
        parsed = jsonParsed[0];
      } else if (typeof jsonParsed === "string") {
        parsed = jsonParsed;
      }
    } catch {
      // Keep original if parse fails
    }
  }

  if (typeof parsed === "string") {
    parsed = parsed
      .replace(/\\r\\n|\\n|\\r/g, "\n")
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, "\\")
      .trim();

    if (parsed.length > 1 && parsed[0] === '"' && parsed[parsed.length - 1] === '"') {
      parsed = parsed.slice(1, -1);
    }
  }

  return parsed;
}

// Time from now helper
function timeFromNow(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return `${diffSec}s ago`;
  else if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  else if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  else return `${Math.floor(diffSec / 86400)}d ago`;
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

const RECORD_COLUMNS =
  "id, name, timestamp, summary, pdf_public_id, pdf_url, volume, number, title_name, page_numbers, authors, language, email, creator_name, conclusion";

// Fetch distinct IDs from a table with pagination (1,000 rows per page)
async function fetchDistinctIds<T extends string>(
  table: string,
  idColumn: T,
  build?: (q: any) => any,
  pageSize = 1000,
): Promise<string[]> {
  const ids = new Set<string>();
  let offset = 0;

  while (true) {
    let q = supabase.from(table).select(`${idColumn}`);
    if (build) q = build(q);
    const { data, error } = await q.range(offset, offset + pageSize - 1);
    if (error) throw error;

    (data ?? []).forEach((row: any) => {
      const v = row[idColumn];
      if (v !== null && v !== undefined) ids.add(String(v));
    });

    if (!data || data.length < pageSize) break;
    offset += pageSize;
  }

  return Array.from(ids);
}

async function fetchPaginatedRecords(params: FilterParams) {
  const { page, pageSize, sortBy = "id", sortOrder = "desc", filters = {}, globalFilter, email } = params;

  // Start building the query
  let query = supabase.from("records").select(
    `
      ${RECORD_COLUMNS},
      record_tags:record_tags(
        tag_id,
        tags:tags(id, name)
      ),
      record_authors:record_authors(
        author_id,
        authors:authors(id, name)
      )
    `,
    { count: "exact" },
  );

  // -------------------------
  // Email filtering
  // -------------------------
  if (email) {
    const formattedEmail = `["${email.trim()}"]`;

    const [summaryRecords, conclusionRecords, directRecords] = await Promise.all([
      supabase.from("summaries").select("record_id").eq("email", formattedEmail),
      supabase.from("conclusions").select("record_id").eq("email", formattedEmail),
      supabase.from("records").select("id").eq("email", formattedEmail),
    ]);

    const uniqueRecordIds = new Set<string>();
    summaryRecords.data?.forEach((r) => uniqueRecordIds.add(String(r.record_id)));
    conclusionRecords.data?.forEach((r) => uniqueRecordIds.add(String(r.record_id)));
    directRecords.data?.forEach((r) => uniqueRecordIds.add(String(r.id)));

    if (uniqueRecordIds.size === 0) return { data: [], count: 0, editHistory: {} };
    query = query.in("id", Array.from(uniqueRecordIds));
  }

  // -------------------------
  // Other column filters
  // -------------------------
  Object.entries(filters).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") return;

    if (key === "id") {
      query = query.filter("id", "gte", value);
      query = query.filter("id", "lt", String(Number(value) + 1));
    } else if (key === "tags" || key === "authors") {
      // handled below
      return;
    } else if (key === "summary" || key === "conclusion" || key === "language") {
      if (value === "__EMPTY__") {
        query = query.or(`${key}.is.null,${key}.eq.`);
      } else if (value === "__NONEMPTY__") {
        query = query.not(key, "is", null).neq(key, "");
      } else if (typeof value === "string") {
        query = query.ilike(key, `%${value}%`);
      }
    } else if (typeof value === "string") {
      query = query.ilike(key, `%${value}%`);
    } else {
      query = query.eq(key, value);
    }
  });

  // -------------------------
  // Global filter
  // -------------------------
  if (globalFilter) {
    query = query.or(
      `name.ilike.%${globalFilter}%,summary.ilike.%${globalFilter}%,conclusion.ilike.%${globalFilter}%,title_name.ilike.%${globalFilter}%`,
    );
  }

  // -------------------------
  // Tags filtering (server side)
  // -------------------------
  if (filters.tags) {
    if (filters.tags === "__EMPTY__" || filters.tags === "__NONEMPTY__") {
      const idsWithTags = new Set(await fetchDistinctIds("record_tags", "record_id"));

      if (filters.tags === "__EMPTY__") {
        // records NOT present in idsWithTags
        query = query.not("id", "in", `(${Array.from(idsWithTags).join(",") || "NULL"})`);
      } else {
        // only records present in idsWithTags
        const arr = Array.from(idsWithTags);
        if (arr.length === 0) return { data: [], count: 0, editHistory: {} };
        query = query.in("id", arr);
      }
    } else {
      // name search: ilike needs wildcards
      const { data: tagRows, error: tagErr } = await supabase
        .from("tags")
        .select("id, name")
        .ilike("name", `%${filters.tags}%`);
      if (tagErr) throw tagErr;

      const tagIds = (tagRows ?? []).map((t) => t.id);
      if (tagIds.length === 0) return { data: [], count: 0, editHistory: {} };

      // collect record_ids for all matching tag_ids (paginated)
      const recIds = await fetchDistinctIds("record_tags", "record_id", (q) => q.in("tag_id", tagIds));

      if (recIds.length === 0) return { data: [], count: 0, editHistory: {} };
      query = query.in("id", recIds);
    }
  }

  // -------------------------
  // Authors filtering (server side)
  // -------------------------
  if (filters.authors) {
    if (filters.authors === "__EMPTY__" || filters.authors === "__NONEMPTY__") {
      const idsWithAuthors = new Set(await fetchDistinctIds("record_authors", "record_id"));

      if (filters.authors === "__EMPTY__") {
        query = query.not("id", "in", `(${Array.from(idsWithAuthors).join(",") || "NULL"})`);
      } else {
        const arr = Array.from(idsWithAuthors);
        if (arr.length === 0) return { data: [], count: 0, editHistory: {} };
        query = query.in("id", arr);
      }
    } else {
      const { data: aRows, error: aErr } = await supabase
        .from("authors")
        .select("id, name")
        .ilike("name", `%${filters.authors}%`);
      if (aErr) throw aErr;

      const authorIds = (aRows ?? []).map((a) => a.id);
      if (authorIds.length === 0) return { data: [], count: 0, editHistory: {} };

      const recIds = await fetchDistinctIds("record_authors", "record_id", (q) => q.in("author_id", authorIds));

      if (recIds.length === 0) return { data: [], count: 0, editHistory: {} };
      query = query.in("id", recIds);
    }
  }

  // -------------------------
  // Sorting
  // -------------------------
  if (sortBy === "tags" || sortBy === "authors" || sortBy === "authors_linked") {
    query = query.order("id", { ascending: sortOrder === "asc" });
  } else {
    query = query.order(sortBy, { ascending: sortOrder === "asc" });
  }

  // -------------------------
  // Pagination
  // -------------------------
  const from = page * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  // -------------------------
  // Execute query
  // -------------------------
  const { data: records, count, error } = await query;
  if (error) throw error;

  // -------------------------
  // Edit history aggregation
  // -------------------------
  const recordIds = records?.map((r) => r.id) || [];
  const editHistory: Record<string, any> = {};

  if (recordIds.length > 0) {
    const { data: summaries } = await supabase
      .from("summaries")
      .select("record_id, email, name, created_at")
      .in("record_id", recordIds);

    if (summaries) {
      summaries.forEach((summary) => {
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
  }

  // -------------------------
  // Format records
  // -------------------------
  const formattedRecords = (records || []).map((record) => {
    const formatted: any = {};

    // Handle tags
    if (record.record_tags) {
      formatted.tags = record.record_tags.map((rt: any) => rt?.tags).filter(Boolean);
    }

    // Handle authors
    if (record.record_authors) {
      formatted.authors_linked = record.record_authors.map((ra: any) => ra?.authors).filter(Boolean);
    }

    // Format other fields
    Object.keys(record).forEach((key) => {
      if (key !== "record_tags" && key !== "record_authors") {
        formatted[key] = formatValue(record[key]);
      }
    });

    // Add edit history
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

  return {
    data: formattedRecords,
    count: count || 0,
    editHistory,
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
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

    const cacheKey = `${CACHE_VERSION_KEY}:${cacheVersion}:${getCacheKey(params)}`;

    if (noCache !== "true") {
      const cachedData = cache.get(cacheKey);
      if (cachedData) {
        console.log("🎯 Cache hit for:", cacheKey);
        return res.status(200).json(cachedData);
      }
    }

    console.log("🔍 Cache miss, fetching from database...");
    const result = await fetchPaginatedRecords(params);
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

// Export cache invalidation
export { invalidateRecordsCache as invalidateCache };
