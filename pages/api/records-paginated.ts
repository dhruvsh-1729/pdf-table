import { createClient } from "@supabase/supabase-js";
import type { NextApiRequest, NextApiResponse } from "next";
import {
  getCachedResponse,
  getRecordsQueryCacheTtlMs,
  invalidateRecordsCache,
  setCachedResponse,
} from "@/lib/recordsQueryCache";

const supabase = createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");

const RECORD_BASE_SELECT = `
  id,
  magazine_id,
  timestamp,
  summary,
  pdf_public_id,
  pdf_url,
  volume,
  number,
  title_name,
  page_numbers,
  authors,
  email,
  creator_name,
  conclusion,
  extracted_text,
  magazines(id, name)
`;

function buildRecordSelect(options: {
  includeTagJoin?: boolean;
  includeAuthorJoin?: boolean;
  includeLanguageJoin?: boolean;
}) {
  const parts = [RECORD_BASE_SELECT.trim()];
  if (options.includeTagJoin) parts.push("record_tags!left(record_id)");
  if (options.includeAuthorJoin) parts.push("record_authors!left(record_id)");
  if (options.includeLanguageJoin) parts.push("record_languages!left(record_id)");
  return parts.join(", ");
}

type RawEditHistory = {
  count: number;
  editors: string[];
  editorCounts: Record<string, number>;
  latest: { name: string; email: string; editedAt: string } | null;
  latestTime: number;
};

type RelationRow = {
  record_id: number | string | null;
  [key: string]: any;
};

type FilterParams = {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  filters?: Record<string, any>;
  globalFilter?: string;
  email?: string;
};

function getCacheKey(params: FilterParams) {
  return `records:${JSON.stringify(normalizeObject(params))}`;
}

function normalizeObject(value: any): any {
  if (Array.isArray(value)) return value.map((item) => normalizeObject(item));
  if (!value || typeof value !== "object") return value;
  const sortedKeys = Object.keys(value).sort();
  const out: Record<string, any> = {};
  for (const key of sortedKeys) {
    out[key] = normalizeObject(value[key]);
  }
  return out;
}


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
      // keep original
    }
  }

  if (typeof parsed === "string") {
    parsed = parsed
      .replace(/\\r\\n|\\n|\\r/g, "\n")
      .replace(/\\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, "\\")
      .trim();
    if (parsed.length > 1 && parsed[0] === '"' && parsed[parsed.length - 1] === '"') {
      parsed = parsed.slice(1, -1);
    }
  }

  return parsed;
}

function timeFromNow(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

function normalizeEmailKey(rawValue: any): string | null {
  const normalized = String(formatValue(rawValue) || "")
    .trim()
    .toLowerCase();
  if (!normalized || normalized === "null" || normalized === "undefined") return null;
  return normalized;
}

function normalizeFilterValue(value: any): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value) && value.length === 1) return normalizeFilterValue(value[0]);
  return String(value).trim();
}

function mapRelationsByRecordId(rows: RelationRow[]) {
  const map = new Map<number, RelationRow[]>();
  for (const row of rows || []) {
    const recordId = Number(row.record_id);
    if (!Number.isFinite(recordId)) continue;
    if (!map.has(recordId)) map.set(recordId, []);
    map.get(recordId)!.push(row);
  }
  return map;
}

function uniqueById(items: any[]): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const item of items || []) {
    const key = `${item?.id ?? ""}:${item?.name ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function extractMagazineNameFromRelation(relation: any): string {
  const node = Array.isArray(relation) ? relation[0] : relation;
  const name = formatValue(node?.name);
  if (typeof name !== "string") return "";
  return name.trim();
}

function extractLanguageNamesFromRelations(rows: any[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const row of rows || []) {
    const node = row?.languages ?? row?.language;
    if (!node) continue;

    const normalizedName = String(formatValue(node?.name) || "").trim();
    if (!normalizedName) continue;

    const key = normalizedName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalizedName);
  }

  return out;
}

function withFormattedRecord(record: any) {
  const formatted: Record<string, any> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === "record_tags" || key === "record_authors" || key === "record_languages") continue;
    formatted[key] = formatValue(value);
  }

  formatted.tags = uniqueById((record.record_tags || []).map((rt: any) => rt?.tags).filter(Boolean));
  formatted.authors_linked = uniqueById((record.record_authors || []).map((ra: any) => ra?.authors).filter(Boolean));
  formatted.name = extractMagazineNameFromRelation(record.magazines);
  formatted.languages = extractLanguageNamesFromRelations(record.record_languages || []);
  formatted.language = formatted.languages.length > 0 ? formatted.languages.join(", ") : null;

  return formatted;
}

function buildEditHistoryMap(summaryRows: any[]) {
  const editHistoryByRecord: Record<string, RawEditHistory> = {};

  for (const summary of summaryRows || []) {
    const recordId = String(Number(summary.record_id));
    if (!recordId || recordId === "NaN") continue;

    const name = String(formatValue(summary.name) || "");
    const email = String(formatValue(summary.email) || "");
    const createdAt = summary.created_at ? String(summary.created_at) : "";

    if (!editHistoryByRecord[recordId]) {
      editHistoryByRecord[recordId] = {
        count: 0,
        editors: [],
        editorCounts: {},
        latest: null,
        latestTime: 0,
      };
    }

    const history = editHistoryByRecord[recordId];
    history.count += 1;
    if (name && !history.editors.includes(name)) {
      history.editors.push(name);
    }
    if (name) {
      history.editorCounts[name] = (history.editorCounts[name] || 0) + 1;
    }
    if (createdAt) {
      const createdTime = new Date(createdAt).getTime();
      if (Number.isFinite(createdTime) && createdTime > history.latestTime) {
        history.latestTime = createdTime;
        history.latest = {
          name,
          email,
          editedAt: createdAt,
        };
      }
    }
  }

  return editHistoryByRecord;
}

function toResponseEditHistory(history?: RawEditHistory) {
  if (!history) {
    return {
      count: 0,
      editors: [],
      editorCounts: {},
      latestEditor: null,
    };
  }

  return {
    count: history.count,
    editors: history.editors,
    editorCounts: history.editorCounts,
    latestEditor: history.latest
      ? {
          name: history.latest.name,
          email: history.latest.email,
          editedAt: history.latest.editedAt,
          timeFromNow: timeFromNow(history.latest.editedAt),
        }
      : null,
  };
}

function parseFilters(rawFilters: string | string[] | undefined) {
  if (!rawFilters) return {};
  const source = Array.isArray(rawFilters) ? rawFilters[0] : rawFilters;
  if (!source) return {};
  try {
    const parsed = JSON.parse(source);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function chunkArray<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function intersectSets(sets: Set<number>[]) {
  if (sets.length === 0) return null;
  let out = new Set<number>(sets[0]);
  for (let i = 1; i < sets.length; i++) {
    const next = sets[i];
    out = new Set([...out].filter((id) => next.has(id)));
  }
  return out;
}

async function fetchRecordIdsByEmail(email: string) {
  const raw = String(email || "").trim();
  const normalized = normalizeEmailKey(email);
  if (!normalized && !raw) return new Set<number>();
  const formattedRaw = raw ? `["${raw}"]` : "";
  const formattedNormalized = normalized ? `["${normalized}"]` : "";
  const candidates = [raw, normalized || "", formattedRaw, formattedNormalized].filter((v) => v);

  const [records, summaries, conclusions] = await Promise.all([
    supabase.from("records").select("id, email").in("email", candidates),
    supabase.from("summaries").select("record_id, email").in("email", candidates),
    supabase.from("conclusions").select("record_id, email").in("email", candidates),
  ]);

  const ids = new Set<number>();
  (records.data || []).forEach((row: any) => {
    const id = Number(row.id);
    if (Number.isFinite(id)) ids.add(id);
  });
  (summaries.data || []).forEach((row: any) => {
    const id = Number(row.record_id);
    if (Number.isFinite(id)) ids.add(id);
  });
  (conclusions.data || []).forEach((row: any) => {
    const id = Number(row.record_id);
    if (Number.isFinite(id)) ids.add(id);
  });

  return ids;
}

async function fetchRecordIdsByTagFilter(value: string) {
  const trimmed = normalizeFilterValue(value);
  if (!trimmed) return null;

  if (trimmed === "__EMPTY__" || trimmed === "__NONEMPTY__") {
    return null;
  }

  const { data: tagRows, error: tagError } = await supabase.from("tags").select("id").ilike("name", `%${trimmed}%`);
  if (tagError) throw tagError;
  const tagIds = (tagRows || []).map((t: any) => t.id).filter((id: any) => Number.isFinite(Number(id)));
  if (tagIds.length === 0) return { ids: new Set<number>(), mode: "IN" };

  const { data: recordRows, error: recordError } = await supabase
    .from("record_tags")
    .select("record_id")
    .in("tag_id", tagIds);
  if (recordError) throw recordError;

  const recordIds = new Set<number>();
  (recordRows || []).forEach((row: any) => {
    const id = Number(row.record_id);
    if (Number.isFinite(id)) recordIds.add(id);
  });
  return { ids: recordIds, mode: "IN" };
}

async function fetchRecordIdsByAuthorFilter(value: string) {
  const trimmed = normalizeFilterValue(value);
  if (!trimmed) return null;

  if (trimmed === "__EMPTY__" || trimmed === "__NONEMPTY__") {
    return null;
  }

  const { data: authorRows, error: authorError } = await supabase
    .from("authors")
    .select("id")
    .ilike("name", `%${trimmed}%`);
  if (authorError) throw authorError;
  const authorIds = (authorRows || []).map((a: any) => a.id).filter((id: any) => Number.isFinite(Number(id)));
  if (authorIds.length === 0) return { ids: new Set<number>(), mode: "IN" };

  const { data: recordRows, error: recordError } = await supabase
    .from("record_authors")
    .select("record_id")
    .in("author_id", authorIds);
  if (recordError) throw recordError;

  const recordIds = new Set<number>();
  (recordRows || []).forEach((row: any) => {
    const id = Number(row.record_id);
    if (Number.isFinite(id)) recordIds.add(id);
  });

  return { ids: recordIds, mode: "IN" };
}

async function fetchRecordIdsByLanguageFilter(value: string) {
  const trimmed = normalizeFilterValue(value);
  if (!trimmed) return null;

  if (trimmed === "__EMPTY__" || trimmed === "__NONEMPTY__") {
    return null;
  }

  const { data: languageRows, error: languageError } = await supabase
    .from("languages")
    .select("id")
    .ilike("name", `%${trimmed}%`);
  if (languageError) throw languageError;
  const languageIds = (languageRows || []).map((l: any) => l.id).filter((id: any) => Number.isFinite(Number(id)));
  if (languageIds.length === 0) return { ids: new Set<number>(), mode: "IN" };

  const { data: recordRows, error: recordError } = await supabase
    .from("record_languages")
    .select("record_id")
    .in("language_id", languageIds);
  if (recordError) throw recordError;

  const recordIds = new Set<number>();
  (recordRows || []).forEach((row: any) => {
    const id = Number(row.record_id);
    if (Number.isFinite(id)) recordIds.add(id);
  });

  return { ids: recordIds, mode: "IN" };
}

async function fetchMagazineIdsByName(value: string) {
  const trimmed = normalizeFilterValue(value);
  if (!trimmed) return null;

  const { data, error } = await supabase.from("magazines").select("id").ilike("name", `%${trimmed}%`);
  if (error) throw error;
  const ids = (data || []).map((row: any) => row.id).filter((id: any) => Number.isFinite(Number(id)));
  return new Set<number>(ids.map((id) => Number(id)));
}

async function fetchRecordIdsByGlobalFilter(value: string) {
  const trimmed = normalizeFilterValue(value);
  if (!trimmed) return null;

  const { data: directRows, error: directError } = await supabase
    .from("records")
    .select("id")
    .or(`summary.ilike.%${trimmed}%,conclusion.ilike.%${trimmed}%,title_name.ilike.%${trimmed}%`);
  if (directError) throw directError;

  const ids = new Set<number>();
  (directRows || []).forEach((row: any) => {
    const id = Number(row.id);
    if (Number.isFinite(id)) ids.add(id);
  });

  const magazineIds = await fetchMagazineIdsByName(trimmed);
  if (magazineIds && magazineIds.size > 0) {
    const chunked = chunkArray(Array.from(magazineIds), 1000);
    for (const chunk of chunked) {
      const { data: recordRows, error: recordError } = await supabase
        .from("records")
        .select("id")
        .in("magazine_id", chunk);
      if (recordError) throw recordError;
      (recordRows || []).forEach((row: any) => {
        const id = Number(row.id);
        if (Number.isFinite(id)) ids.add(id);
      });
    }
  }

  return ids;
}

async function fetchRecordIdsByIdPrefix(prefix: string) {
  const trimmed = normalizeFilterValue(prefix);
  if (!trimmed) return null;

  const { data, error } = await supabase.from("records").select("id");
  if (error) throw error;

  const ids = new Set<number>();
  (data || []).forEach((row: any) => {
    const id = Number(row.id);
    if (!Number.isFinite(id)) return;
    if (String(id).startsWith(trimmed)) {
      ids.add(id);
    }
  });

  return ids;
}

async function fetchRelationsForRecords(recordIds: number[]) {
  if (recordIds.length === 0) {
    return {
      tagMap: new Map<number, RelationRow[]>(),
      authorMap: new Map<number, RelationRow[]>(),
      languageMap: new Map<number, RelationRow[]>(),
    };
  }

  const chunks = chunkArray(recordIds, 1000);
  const tagRows: any[] = [];
  const authorRows: any[] = [];
  const languageRows: any[] = [];

  for (const chunk of chunks) {
    const [tags, authors, languages] = await Promise.all([
      supabase.from("record_tags").select("record_id, tags(id, name)").in("record_id", chunk),
      supabase.from("record_authors").select("record_id, authors(id, name)").in("record_id", chunk),
      supabase.from("record_languages").select("record_id, languages(id, name)").in("record_id", chunk),
    ]);

    if (tags.error) throw tags.error;
    if (authors.error) throw authors.error;
    if (languages.error) throw languages.error;

    tagRows.push(...(tags.data || []));
    authorRows.push(...(authors.data || []));
    languageRows.push(...(languages.data || []));
  }

  return {
    tagMap: mapRelationsByRecordId(tagRows),
    authorMap: mapRelationsByRecordId(authorRows),
    languageMap: mapRelationsByRecordId(languageRows),
  };
}

function applyIdFilter(query: any, ids: Set<number>) {
  const idList = Array.from(ids).filter((id) => Number.isFinite(id));
  if (idList.length === 0) {
    return { query, empty: true };
  }

  const chunks = chunkArray(idList, 1000);
  if (chunks.length === 1) {
    return { query: query.in("id", chunks[0]), empty: false };
  }

  const or = chunks.map((chunk) => `id.in.(${chunk.join(",")})`).join(",");
  return { query: query.or(or), empty: false };
}

function applyNotInFilter(query: any, ids: Set<number>) {
  const idList = Array.from(ids).filter((id) => Number.isFinite(id));
  if (idList.length === 0) return query;
  return query.not("id", "in", `(${idList.join(",")})`);
}

async function fetchPaginatedRecords(params: FilterParams) {
  const { page, pageSize, sortBy = "id", sortOrder = "desc", filters = {}, globalFilter, email } = params;

  const tagsFilterRaw = filters.tags ?? filters.tag;
  const authorsFilterRaw = filters.authors ?? filters.author;
  const languageFilterRaw = filters.language ?? filters.languages;

  const tagsFilter = normalizeFilterValue(tagsFilterRaw);
  const authorsFilter = normalizeFilterValue(authorsFilterRaw);
  const languageFilter = normalizeFilterValue(languageFilterRaw);

  const includeTagJoin = tagsFilter === "__EMPTY__" || tagsFilter === "__NONEMPTY__";
  const includeAuthorJoin = authorsFilter === "__EMPTY__" || authorsFilter === "__NONEMPTY__";
  const includeLanguageJoin = languageFilter === "__EMPTY__" || languageFilter === "__NONEMPTY__";

  let query = supabase.from("records").select(
    buildRecordSelect({
      includeTagJoin,
      includeAuthorJoin,
      includeLanguageJoin,
    }),
    { count: "exact" },
  );

  const filterSets: Set<number>[] = [];

  if (email) {
    const emailIds = await fetchRecordIdsByEmail(email);
    filterSets.push(emailIds);
  }

  if (includeTagJoin) {
    if (tagsFilter === "__EMPTY__") {
      query = query.is("record_tags.record_id", null);
    } else {
      query = query.not("record_tags.record_id", "is", null);
    }
  } else if (tagsFilterRaw !== undefined && tagsFilterRaw !== null && tagsFilterRaw !== "") {
    const result = await fetchRecordIdsByTagFilter(tagsFilterRaw as any);
    if (result) {
      filterSets.push(result.ids);
    }
  }

  if (includeAuthorJoin) {
    if (authorsFilter === "__EMPTY__") {
      query = query.is("record_authors.record_id", null);
    } else {
      query = query.not("record_authors.record_id", "is", null);
    }
  } else if (authorsFilterRaw !== undefined && authorsFilterRaw !== null && authorsFilterRaw !== "") {
    const result = await fetchRecordIdsByAuthorFilter(authorsFilterRaw as any);
    if (result) {
      filterSets.push(result.ids);
    }
  }

  if (includeLanguageJoin) {
    if (languageFilter === "__EMPTY__") {
      query = query.is("record_languages.record_id", null);
    } else {
      query = query.not("record_languages.record_id", "is", null);
    }
  } else if (languageFilterRaw !== undefined && languageFilterRaw !== null && languageFilterRaw !== "") {
    const result = await fetchRecordIdsByLanguageFilter(languageFilterRaw as any);
    if (result) {
      filterSets.push(result.ids);
    }
  }

  const magazineFilter = filters.name ?? filters.magazine ?? filters.magazine_name;
  if (magazineFilter !== undefined && magazineFilter !== null && magazineFilter !== "") {
    const trimmed = normalizeFilterValue(magazineFilter);
    if (trimmed === "__EMPTY__") {
      query = query.is("magazine_id", null);
    } else if (trimmed === "__NONEMPTY__") {
      query = query.not("magazine_id", "is", null);
    } else {
      const magazineIds = await fetchMagazineIdsByName(trimmed);
      if (!magazineIds || magazineIds.size === 0) {
        return { data: [], count: 0, editHistory: {} };
      }
      filterSets.push(magazineIds);
    }
  }

  if (globalFilter) {
    const globalIds = await fetchRecordIdsByGlobalFilter(globalFilter);
    if (!globalIds || globalIds.size === 0) {
      return { data: [], count: 0, editHistory: {} };
    }
    filterSets.push(globalIds);
  }

  for (const [key, rawValue] of Object.entries(filters)) {
    if (rawValue === null || rawValue === undefined || rawValue === "") continue;
    if (key === "tags" || key === "tag" || key === "authors" || key === "author" || key === "language" || key === "languages") continue;
    if (key === "name" || key === "magazine" || key === "magazine_name") continue;

    const value = normalizeFilterValue(rawValue);
    if (!value) continue;

    if (value === "__EMPTY__") {
      query = query.or(`${key}.is.null,${key}.eq.""`);
      continue;
    }
    if (value === "__NONEMPTY__") {
      query = query.not(key, "is", null).not(key, "eq", "");
      continue;
    }

    if (key === "id") {
      const idSet = await fetchRecordIdsByIdPrefix(value);
      if (!idSet || idSet.size === 0) {
        return { data: [], count: 0, editHistory: {} };
      }
      filterSets.push(idSet);
      continue;
    }

    if (typeof rawValue === "string") {
      query = query.ilike(key, `%${value}%`);
    } else {
      query = query.eq(key, rawValue as any);
    }
  }

  const intersected = intersectSets(filterSets);
  if (intersected) {
    const { query: filteredQuery, empty } = applyIdFilter(query, intersected);
    if (empty) return { data: [], count: 0, editHistory: {} };
    query = filteredQuery;
  }

  const sortCol = sortBy === "tags" || sortBy === "authors" ? "id" : sortBy;
  if (sortCol === "name") {
    query = query.order("name", { ascending: sortOrder === "asc", foreignTable: "magazines" });
  } else {
    query = query.order(sortCol, { ascending: sortOrder === "asc" });
  }

  const from = page * pageSize;
  const to = from + pageSize - 1;
  const maxRange = 1000;
  let baseRecords: any[] = [];
  let totalCount: number | null = null;

  for (let start = from; start <= to; start += maxRange) {
    const end = Math.min(to, start + maxRange - 1);
    const { data, error, count } = await query.range(start, end);
    if (error) throw error;
    if (totalCount === null && typeof count === "number") {
      totalCount = count;
    }
    baseRecords = baseRecords.concat(data || []);
    if (!data || data.length < maxRange) {
      break;
    }
  }
  const recordIds = baseRecords.map((record: any) => Number(record.id)).filter((id: number) => Number.isFinite(id));

  const { tagMap, authorMap, languageMap } = await fetchRelationsForRecords(recordIds);

  const formattedRecords = baseRecords.map((record: any) => {
    const recordId = Number(record.id);
    const merged = {
      ...record,
      record_languages: languageMap.get(recordId) || [],
      record_tags: tagMap.get(recordId) || [],
      record_authors: authorMap.get(recordId) || [],
    };
    return withFormattedRecord(merged);
  });

  const editHistoryByRecord: Record<string, RawEditHistory> = {};
  if (recordIds.length > 0) {
    const { data: summaryRows, error: summaryError } = await supabase
      .from("summaries")
      .select("record_id, email, name, created_at")
      .in("record_id", recordIds);
    if (summaryError) throw summaryError;
    Object.assign(editHistoryByRecord, buildEditHistoryMap(summaryRows || []));
  }

  const recordsWithHistory = formattedRecords.map((record: any) => {
    const history = editHistoryByRecord[String(record.id)];
    return {
      ...record,
      editHistory: toResponseEditHistory(history),
    };
  });

  return {
    data: recordsWithHistory,
    count: totalCount || 0,
    editHistory: editHistoryByRecord,
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
      page: Math.max(0, Number.parseInt(String(page), 10) || 0),
      pageSize: Math.min(10000, Math.max(1, Number.parseInt(String(pageSize), 10) || 20)),
      sortBy: String(sortBy || "id"),
      sortOrder: String(sortOrder || "desc") === "asc" ? "asc" : "desc",
      filters: parseFilters(filters as string | string[] | undefined),
      globalFilter: String(globalFilter || ""),
      email: String(email || ""),
    };

    const bypassQueryCache = String(noCache) === "true";
    const cacheKey = getCacheKey(params);

    if (!bypassQueryCache) {
      const cached = getCachedResponse(cacheKey);
      if (cached) {
        res.setHeader("Cache-Control", "public, max-age=15, s-maxage=60, stale-while-revalidate=300");
        return res.status(200).json(cached);
      }
    }

    const result = await fetchPaginatedRecords(params);
    const cacheTtlMs = getRecordsQueryCacheTtlMs();
    const responsePayload = {
      ...result,
      cacheInfo: {
        source: "database",
        generatedAt: new Date().toISOString(),
        ttlMs: cacheTtlMs,
      },
    };

    if (!bypassQueryCache) {
      setCachedResponse(cacheKey, responsePayload);
    }

    res.setHeader("Cache-Control", bypassQueryCache ? "no-store" : "public, max-age=15, s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json(responsePayload);
  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({
      error: "Server error",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

export { invalidateRecordsCache as invalidateCache };
