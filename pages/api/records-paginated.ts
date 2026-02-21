import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { NextApiRequest, NextApiResponse } from "next";
import NodeCache from "node-cache";

const supabase = createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");

const CACHE_VERSION_KEY = "cache_version";
const DATASET_SCHEMA_VERSION = 1;
const DATASET_CACHE_TTL_MS = Number(process.env.RECORDS_DATASET_CACHE_TTL_MS || "120000");
const QUERY_CACHE_TTL_SECONDS = Math.max(30, Math.floor(DATASET_CACHE_TTL_MS / 1000));
const queryCache = new NodeCache({
  stdTTL: QUERY_CACHE_TTL_SECONDS,
  checkperiod: Math.max(30, Math.floor(QUERY_CACHE_TTL_SECONDS / 2)),
});
const DB_FETCH_BATCH_SIZE = Math.max(100, Number(process.env.RECORDS_DB_FETCH_BATCH_SIZE || "300"));

const CACHE_DIR = path.join(process.cwd(), "cache");
const DATASET_CACHE_PATH = path.join(CACHE_DIR, "records-paginated-dataset-v1.json");

let cacheVersion = 1;
let datasetMemory: RecordsDataset | null = null;
let datasetLoadPromise: Promise<RecordsDataset> | null = null;
let diskLoadAttempted = false;
let datasetStamp: string | null = null;
let cacheAutoRotationStarted = false;

interface FilterParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  filters?: Record<string, any>;
  globalFilter?: string;
  email?: string;
}

type RawEditHistory = {
  count: number;
  editors: string[];
  editorCounts: Record<string, number>;
  latest: { name: string; email: string; editedAt: string } | null;
  latestTime: number;
};

type RecordsDataset = {
  schemaVersion: number;
  generatedAt: string;
  records: any[];
  editHistoryByRecord: Record<string, RawEditHistory>;
  recordIdsByEmail: Record<string, number[]>;
  stats: {
    records: number;
    recordLanguages: number;
    recordTags: number;
    recordAuthors: number;
    summaries: number;
    conclusions: number;
  };
};

type RelationRow = {
  record_id: number | string | null;
  [key: string]: any;
};

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

function setDataset(dataset: RecordsDataset) {
  datasetMemory = dataset;
  diskLoadAttempted = true;
  if (datasetStamp !== dataset.generatedAt) {
    datasetStamp = dataset.generatedAt;
    queryCache.flushAll();
  }
}

async function deleteDatasetFromDisk() {
  try {
    await fs.unlink(DATASET_CACHE_PATH);
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      console.warn("Failed to remove dataset cache file:", error?.message || String(error));
    }
  }
}

export function invalidateRecordsCache() {
  cacheVersion++;
  queryCache.flushAll();
  datasetMemory = null;
  datasetLoadPromise = null;
  diskLoadAttempted = false;
  datasetStamp = null;
  void deleteDatasetFromDisk();
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

function getCacheKey(params: FilterParams) {
  return `records:${JSON.stringify(normalizeObject(params))}`;
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

function timeFromNow(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

function asComparable(value: any): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(asComparable).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function includesIgnoreCase(haystack: any, needle: string) {
  return asComparable(haystack).toLowerCase().includes(needle.toLowerCase());
}

function normalizeEmailKey(rawValue: any): string | null {
  const normalized = String(formatValue(rawValue) || "")
    .trim()
    .toLowerCase();
  if (!normalized || normalized === "null" || normalized === "undefined") return null;
  return normalized;
}

async function fetchAllRows<T = any>(table: string, columns: string, build?: (q: any) => any): Promise<T[]> {
  const rows: T[] = [];
  let offset = 0;

  while (true) {
    let q = supabase
      .from(table)
      .select(columns)
      .range(offset, offset + DB_FETCH_BATCH_SIZE - 1);
    if (build) q = build(q);

    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;

    rows.push(...(data as T[]));
    if (data.length < DB_FETCH_BATCH_SIZE) break;
    offset += DB_FETCH_BATCH_SIZE;
  }

  return rows;
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
    if (key === "record_tags" || key === "record_authors") continue;
    formatted[key] = formatValue(value);
  }

  formatted.tags = uniqueById((record.record_tags || []).map((rt: any) => rt?.tags).filter(Boolean));
  formatted.authors_linked = uniqueById((record.record_authors || []).map((ra: any) => ra?.authors).filter(Boolean));
  formatted.name = extractMagazineNameFromRelation(record.magazines);
  formatted.languages = extractLanguageNamesFromRelations(record.record_languages || []);
  formatted.language = formatted.languages.length > 0 ? formatted.languages.join(", ") : null;

  return formatted;
}

function appendEmailRecord(emailMap: Map<string, Set<number>>, rawEmail: any, rawRecordId: any) {
  const recordId = Number(rawRecordId);
  if (!Number.isFinite(recordId)) return;

  const emailKey = normalizeEmailKey(rawEmail);
  if (!emailKey) return;

  if (!emailMap.has(emailKey)) emailMap.set(emailKey, new Set<number>());
  emailMap.get(emailKey)!.add(recordId);
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

async function buildRecordsDatasetFromDb(): Promise<RecordsDataset> {
  const baseRecords = await fetchAllRows<any>("records", RECORD_BASE_SELECT, (q) => q.order("id", { ascending: true }));

  const [recordLanguageRows, recordTagRows, recordAuthorRows, summaryRows, conclusionRows] = await Promise.all([
    fetchAllRows<any>("record_languages", "record_id, language_id, languages(id, name)", (q) =>
      q.order("record_id", { ascending: true }).order("language_id", { ascending: true }),
    ),
    fetchAllRows<any>("record_tags", "record_id, tag_id, tags(id, name)", (q) =>
      q.order("record_id", { ascending: true }).order("tag_id", { ascending: true }),
    ),
    fetchAllRows<any>("record_authors", "record_id, author_id, authors(id, name)", (q) =>
      q.order("record_id", { ascending: true }).order("author_id", { ascending: true }),
    ),
    fetchAllRows<any>("summaries", "record_id, email, name, created_at", (q) =>
      q.order("record_id", { ascending: true }).order("created_at", { ascending: true }),
    ),
    fetchAllRows<any>("conclusions", "record_id, email", (q) => q.order("record_id", { ascending: true })),
  ]);

  const languageMap = mapRelationsByRecordId(recordLanguageRows);
  const tagMap = mapRelationsByRecordId(recordTagRows);
  const authorMap = mapRelationsByRecordId(recordAuthorRows);

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

  const editHistoryByRecord = buildEditHistoryMap(summaryRows);
  const emailMap = new Map<string, Set<number>>();
  for (const record of baseRecords) {
    appendEmailRecord(emailMap, record.email, record.id);
  }
  for (const summary of summaryRows) {
    appendEmailRecord(emailMap, summary.email, summary.record_id);
  }
  for (const conclusion of conclusionRows) {
    appendEmailRecord(emailMap, conclusion.email, conclusion.record_id);
  }

  const recordIdsByEmail: Record<string, number[]> = {};
  for (const [emailKey, ids] of emailMap.entries()) {
    recordIdsByEmail[emailKey] = Array.from(ids).sort((a, b) => a - b);
  }

  return {
    schemaVersion: DATASET_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    records: formattedRecords,
    editHistoryByRecord,
    recordIdsByEmail,
    stats: {
      records: baseRecords.length,
      recordLanguages: recordLanguageRows.length,
      recordTags: recordTagRows.length,
      recordAuthors: recordAuthorRows.length,
      summaries: summaryRows.length,
      conclusions: conclusionRows.length,
    },
  };
}

function isDatasetFresh(dataset: RecordsDataset) {
  const generatedAt = new Date(dataset.generatedAt).getTime();
  if (!Number.isFinite(generatedAt)) return false;
  return Date.now() - generatedAt <= DATASET_CACHE_TTL_MS;
}

function isValidDataset(value: any): value is RecordsDataset {
  return Boolean(
    value &&
      value.schemaVersion === DATASET_SCHEMA_VERSION &&
      typeof value.generatedAt === "string" &&
      Array.isArray(value.records) &&
      value.editHistoryByRecord &&
      typeof value.editHistoryByRecord === "object" &&
      value.recordIdsByEmail &&
      typeof value.recordIdsByEmail === "object",
  );
}

async function readDatasetFromDisk(): Promise<RecordsDataset | null> {
  try {
    const raw = await fs.readFile(DATASET_CACHE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!isValidDataset(parsed)) return null;
    if (!isDatasetFresh(parsed)) return null;
    return parsed;
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      console.warn("Failed to read dataset cache from disk:", error?.message || String(error));
    }
    return null;
  }
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeDatasetToDisk(dataset: RecordsDataset) {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const stamp = Date.now();
    const tempPath = `${DATASET_CACHE_PATH}.${stamp}.tmp`;
    const oldPath = `${DATASET_CACHE_PATH}.${stamp}.old`;
    const hasExisting = await fileExists(DATASET_CACHE_PATH);

    await fs.writeFile(tempPath, JSON.stringify(dataset), "utf8");
    if (hasExisting) {
      await fs.rename(DATASET_CACHE_PATH, oldPath);
    }
    await fs.rename(tempPath, DATASET_CACHE_PATH);
    if (hasExisting) {
      await fs.unlink(oldPath);
    }
  } catch (error: any) {
    console.warn("Failed to write dataset cache to disk:", error?.message || String(error));
  }
}

async function getOrBuildDataset(forceRefresh: boolean): Promise<{ dataset: RecordsDataset; source: "memory" | "disk" | "database" }> {
  if (!forceRefresh && datasetMemory && isDatasetFresh(datasetMemory)) {
    return { dataset: datasetMemory, source: "memory" };
  }

  if (!forceRefresh && !diskLoadAttempted) {
    diskLoadAttempted = true;
    const diskDataset = await readDatasetFromDisk();
    if (diskDataset) {
      setDataset(diskDataset);
      return { dataset: diskDataset, source: "disk" };
    }
  }

  if (datasetLoadPromise) {
    const dataset = await datasetLoadPromise;
    return { dataset, source: "memory" };
  }

  datasetLoadPromise = (async () => {
    const dataset = await buildRecordsDatasetFromDb();
    setDataset(dataset);
    await writeDatasetToDisk(dataset);
    return dataset;
  })();

  try {
    const dataset = await datasetLoadPromise;
    return { dataset, source: "database" };
  } finally {
    datasetLoadPromise = null;
  }
}

function recordMatchesFilters(record: any, filters: Record<string, any>) {
  for (const [key, rawValue] of Object.entries(filters)) {
    const value = rawValue as any;
    if (value === null || value === undefined || value === "") continue;

    if (key === "tags") {
      const tags = Array.isArray(record.tags) ? record.tags : [];
      if (value === "__EMPTY__" && tags.length > 0) return false;
      if (value === "__NONEMPTY__" && tags.length === 0) return false;
      if (value !== "__EMPTY__" && value !== "__NONEMPTY__") {
        const needle = String(value).toLowerCase();
        if (!tags.some((tag: any) => includesIgnoreCase(tag?.name, needle))) return false;
      }
      continue;
    }

    if (key === "authors") {
      const authorsLinked = Array.isArray(record.authors_linked) ? record.authors_linked : [];
      if (value === "__EMPTY__" && authorsLinked.length > 0) return false;
      if (value === "__NONEMPTY__" && authorsLinked.length === 0) return false;
      if (value !== "__EMPTY__" && value !== "__NONEMPTY__") {
        const needle = String(value).toLowerCase();
        if (!authorsLinked.some((author: any) => includesIgnoreCase(author?.name, needle))) return false;
      }
      continue;
    }

    if (key === "id") {
      const idNeedle = String(value).trim();
      if (!String(record.id || "").startsWith(idNeedle)) return false;
      continue;
    }

    if (key === "language" || key === "languages") {
      const languageText = Array.isArray(record.languages) ? record.languages.join(", ") : asComparable(record.language);
      if (value === "__EMPTY__") {
        if (languageText.trim() !== "") return false;
        continue;
      }
      if (value === "__NONEMPTY__") {
        if (languageText.trim() === "") return false;
        continue;
      }
      if (!includesIgnoreCase(languageText, String(value))) return false;
      continue;
    }

    if (key === "name" || key === "magazine" || key === "magazine_name") {
      const magazineName = asComparable(record.name);
      if (value === "__EMPTY__") {
        if (magazineName.trim() !== "") return false;
        continue;
      }
      if (value === "__NONEMPTY__") {
        if (magazineName.trim() === "") return false;
        continue;
      }
      if (!includesIgnoreCase(magazineName, String(value))) return false;
      continue;
    }

    const target = record[key];
    if (value === "__EMPTY__") {
      if (asComparable(target).trim() !== "") return false;
      continue;
    }
    if (value === "__NONEMPTY__") {
      if (asComparable(target).trim() === "") return false;
      continue;
    }

    if (typeof value === "string") {
      if (!includesIgnoreCase(target, value)) return false;
      continue;
    }

    if (target !== value) return false;
  }
  return true;
}

function recordMatchesGlobalFilter(record: any, globalFilter?: string) {
  if (!globalFilter) return true;
  const needle = globalFilter.toLowerCase();
  const fields = [record.name, record.summary, record.conclusion, record.title_name];
  return fields.some((field) => includesIgnoreCase(field, needle));
}

function sortRecords(records: any[], sortBy: string, sortOrder: "asc" | "desc") {
  const direction = sortOrder === "asc" ? 1 : -1;
  const accessor = (row: any) => {
    if (sortBy === "tags") return (row.tags || []).map((t: any) => t?.name || "").join(", ");
    if (sortBy === "authors" || sortBy === "authors_linked") {
      return (row.authors_linked || []).map((a: any) => a?.name || "").join(", ");
    }
    return row[sortBy];
  };

  records.sort((a, b) => {
    const aRaw = accessor(a);
    const bRaw = accessor(b);

    if (sortBy === "id") {
      const aNum = Number(aRaw) || 0;
      const bNum = Number(bRaw) || 0;
      if (aNum === bNum) return 0;
      return aNum > bNum ? direction : -direction;
    }

    const aVal = asComparable(aRaw).toLowerCase();
    const bVal = asComparable(bRaw).toLowerCase();
    if (aVal === bVal) {
      const aId = Number(a.id) || 0;
      const bId = Number(b.id) || 0;
      if (aId === bId) return 0;
      return aId > bId ? direction : -direction;
    }
    return aVal > bVal ? direction : -direction;
  });
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

function resolveEmailRecordIdsFromDataset(dataset: RecordsDataset, email?: string): Set<number> | null {
  if (!email) return null;
  const emailKey = normalizeEmailKey(email);
  if (!emailKey) return new Set<number>();
  return new Set(dataset.recordIdsByEmail[emailKey] || []);
}

function getDatasetAgeMs(dataset: RecordsDataset) {
  const ts = new Date(dataset.generatedAt).getTime();
  if (!Number.isFinite(ts)) return null;
  return Date.now() - ts;
}

function invalidateIfStale() {
  if (datasetMemory && !isDatasetFresh(datasetMemory)) {
    invalidateRecordsCache();
  }
}

function startCacheAutoRotation() {
  if (cacheAutoRotationStarted) return;
  cacheAutoRotationStarted = true;

  const timer = setInterval(() => {
    invalidateIfStale();
  }, DATASET_CACHE_TTL_MS);

  if (typeof (timer as any).unref === "function") {
    (timer as any).unref();
  }
}

startCacheAutoRotation();

async function fetchPaginatedRecords(params: FilterParams, dataset: RecordsDataset) {
  const { page, pageSize, sortBy = "id", sortOrder = "desc", filters = {}, globalFilter, email } = params;

  const emailRecordIds = resolveEmailRecordIdsFromDataset(dataset, email);
  if (email && emailRecordIds && emailRecordIds.size === 0) {
    return { data: [], count: 0, editHistory: {} };
  }

  let candidates = dataset.records;
  if (emailRecordIds) {
    candidates = dataset.records.filter((record: any) => emailRecordIds.has(Number(record.id)));
  }

  const filtered = candidates.filter(
    (record: any) => recordMatchesFilters(record, filters) && recordMatchesGlobalFilter(record, globalFilter),
  );
  sortRecords(filtered, sortBy, sortOrder);

  const totalCount = filtered.length;
  const from = page * pageSize;
  const to = from + pageSize;
  const pageRecords = filtered.slice(from, to);

  const pageEditHistory: Record<string, RawEditHistory> = {};
  const recordsWithHistory = pageRecords.map((record: any) => {
    const history = dataset.editHistoryByRecord[String(record.id)];
    if (history) {
      pageEditHistory[String(record.id)] = history;
    }

    return {
      ...record,
      editHistory: toResponseEditHistory(history),
    };
  });

  return { data: recordsWithHistory, count: totalCount, editHistory: pageEditHistory };
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    invalidateIfStale();

    const {
      page = "0",
      pageSize = "20",
      sortBy = "id",
      sortOrder = "desc",
      filters = "{}",
      globalFilter = "",
      email = "",
      noCache = "false",
      rebuildDataset = "false",
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
    const forceDatasetRebuild = String(rebuildDataset) === "true";
    const cacheKey = `${CACHE_VERSION_KEY}:${cacheVersion}:${getCacheKey(params)}`;
    if (!bypassQueryCache) {
      const cachedData = queryCache.get(cacheKey);
      if (cachedData) {
        return res.status(200).json(cachedData);
      }
    }

    const { dataset, source } = await getOrBuildDataset(forceDatasetRebuild);
    const result = await fetchPaginatedRecords(params, dataset);
    const datasetAgeMs = getDatasetAgeMs(dataset);

    const responsePayload = {
      ...result,
      cacheInfo: {
        source,
        generatedAt: dataset.generatedAt,
        ageMs: datasetAgeMs,
        ttlMs: DATASET_CACHE_TTL_MS,
        datasetStats: dataset.stats,
        filePath: "cache/records-paginated-dataset-v1.json",
      },
    };

    queryCache.set(cacheKey, responsePayload);
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
