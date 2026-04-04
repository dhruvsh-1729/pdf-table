import { createClient } from "@supabase/supabase-js";

const SNAPSHOT_TTL_MS = Number(process.env.RECORD_RELATION_SNAPSHOT_TTL_MS || "86400000");

const supabase = createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");

type RelationSnapshot = {
  allRecordIds: Set<number>;
  tagRecordIds: Set<number>;
  authorRecordIds: Set<number>;
  languageRecordIds: Set<number>;
};

type CachedSnapshot = {
  ts: number;
  data: RelationSnapshot;
};

let cached: CachedSnapshot | null = null;

async function fetchAllIds(table: string, column: string) {
  const out = new Set<number>();
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from(table).select(column).range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data || [];
    rows.forEach((row: any) => {
      const value = Number(row[column]);
      if (Number.isFinite(value)) out.add(value);
    });
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

async function buildSnapshot(): Promise<RelationSnapshot> {
  const [allRecordIds, tagRecordIds, authorRecordIds, languageRecordIds] = await Promise.all([
    fetchAllIds("records", "id"),
    fetchAllIds("record_tags", "record_id"),
    fetchAllIds("record_authors", "record_id"),
    fetchAllIds("record_languages", "record_id"),
  ]);

  return { allRecordIds, tagRecordIds, authorRecordIds, languageRecordIds };
}

export async function getRelationSnapshot(): Promise<RelationSnapshot> {
  if (cached && Date.now() - cached.ts < SNAPSHOT_TTL_MS) {
    return cached.data;
  }
  const data = await buildSnapshot();
  cached = { ts: Date.now(), data };
  return data;
}

export function invalidateRelationSnapshot() {
  cached = null;
}
