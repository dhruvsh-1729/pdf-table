// Author / tag name matching. Mirrors public.clean_entity_name and
// public.entity_name_key (migration 014), which back the unique indexes.

/** NFC, collapse internal whitespace, trim. */
export function cleanEntityName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.normalize("NFC").replace(/\s+/g, " ").trim();
}

function escapeIlike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * Find an existing author/tag whose name matches case-insensitively after
 * cleaning. Names are stored cleaned (DB trigger), so an escaped ILIKE with no
 * wildcards is an exact, case-insensitive match — and, unlike the listing
 * search, it works for Devanagari names.
 */
export async function findByEntityName<T = { id: number; name: string }>(
  supabase: any,
  table: "authors" | "tags",
  rawName: string,
  columns = "id, name",
): Promise<T | null> {
  const name = cleanEntityName(rawName);
  if (!name) return null;
  const { data, error } = await supabase.from(table).select(columns).ilike("name", escapeIlike(name)).limit(1);
  if (error) throw error;
  return (data?.[0] as T) ?? null;
}
