const LANGUAGE_NAME_BY_TOKEN = new Map(
  Object.entries({
    afr: "Afrikaans",
    afrikaans: "Afrikaans",
    apabhramsa: "Apabhramsa",
    apabhramsha: "Apabhramsa",
    arabic: "Arabic",
    assamese: "Assamese",
    bengali: "Bengali",
    bodo: "Bodo",
    chinese: "Chinese",
    dogri: "Dogri",
    eng: "English",
    english: "English",
    french: "French",
    german: "German",
    gujarati: "Gujarati",
    hau: "Hausa",
    hausa: "Hausa",
    hindi: "Hindi",
    italian: "Italian",
    kannada: "Kannada",
    kashmiri: "Kashmiri",
    konkani: "Konkani",
    lin: "Lingala",
    lingala: "Lingala",
    maithili: "Maithili",
    malayalam: "Malayalam",
    manipuri: "Manipuri",
    marathi: "Marathi",
    nepali: "Nepali",
    odia: "Odia",
    oriya: "Odia",
    pali: "Pali",
    persian: "Persian",
    prakrit: "Prakrit",
    punjabi: "Punjabi",
    sanskrit: "Sanskrit",
    santhali: "Santhali",
    sindhi: "Sindhi",
    spanish: "Spanish",
    tamil: "Tamil",
    telugu: "Telugu",
    urdu: "Urdu",
    war: "Waray",
    waray: "Waray",
  }),
);

const IGNORED_LANGUAGE_TOKENS = new Set(["various"]);

function stripJsonArrayWrapper(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^\["(.*)"\]$/);
  if (match) return match[1].trim();
  return trimmed;
}

function toTitleCase(value: string): string {
  return value
    .split(/\s+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function splitByAndSafely(chunk: string): string[] {
  if (!/\sand\s/i.test(chunk)) return [chunk];
  const parts = chunk
    .split(/\sand\s/gi)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return [chunk];
  const allKnown = parts.every((part) => {
    const key = normalizeLanguageToken(part).toLowerCase();
    return LANGUAGE_NAME_BY_TOKEN.has(key) || IGNORED_LANGUAGE_TOKENS.has(key);
  });
  return allKnown ? parts : [chunk];
}

function normalizeLanguageToken(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/^[\s`"[\]]+|[\s`"[\];:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalizeLanguageToken(value: string): string | null {
  const normalized = normalizeLanguageToken(value);
  if (!normalized) return null;

  const key = normalized.toLowerCase();
  if (IGNORED_LANGUAGE_TOKENS.has(key)) return null;
  return LANGUAGE_NAME_BY_TOKEN.get(key) || toTitleCase(normalized);
}

export function normalizeOptionalText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = stripJsonArrayWrapper(String(value)).trim();
  return normalized === "" ? null : normalized;
}

export function parseLanguageValues(raw?: string | null): string[] {
  const normalized = normalizeOptionalText(raw);
  if (!normalized) return [];

  const tokens: string[] = [];
  const splitByDelimiter = normalized
    .replace(/\u00a0/g, " ")
    .replace(/[\[\]"]/g, "")
    .replace(/`/g, "")
    .split(/\s*(?:,|&|\/|\.)\s*/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  for (const chunk of splitByDelimiter) {
    const pieces = splitByAndSafely(chunk);
    for (const piece of pieces) {
      const cleaned = canonicalizeLanguageToken(piece);
      if (!cleaned) continue;
      tokens.push(cleaned);
    }
  }

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const token of tokens) {
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(token);
  }

  return unique;
}

function getMagazineRelation(record: any): { id?: number; name?: string } | null {
  if (!record || typeof record !== "object") return null;
  const relation = record.magazines ?? record.magazine;
  if (!relation) return null;
  if (Array.isArray(relation)) return relation[0] || null;
  return relation;
}

function getLanguageNode(item: any): any {
  if (!item || typeof item !== "object") return null;
  return item.languages ?? item.language ?? null;
}

export function extractMagazineName(record: any): string {
  const relationName = normalizeOptionalText(getMagazineRelation(record)?.name);
  if (relationName) return relationName;
  return normalizeOptionalText(record?.name) || normalizeOptionalText(record?.name_legacy) || "";
}

export function extractLanguageNames(record: any): string[] {
  const fromRelations: string[] = [];
  const relationRows = Array.isArray(record?.record_languages) ? record.record_languages : [];

  for (const row of relationRows) {
    const node = getLanguageNode(row);
    if (!node) continue;
    if (Array.isArray(node)) {
      for (const entry of node) {
        const value = normalizeOptionalText(entry?.name);
        if (value) fromRelations.push(toTitleCase(value));
      }
      continue;
    }

    const value = normalizeOptionalText(node?.name);
    if (value) fromRelations.push(toTitleCase(value));
  }

  if (fromRelations.length > 0) {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const value of fromRelations) {
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(value);
    }
    return out;
  }

  return parseLanguageValues(normalizeOptionalText(record?.language) || normalizeOptionalText(record?.language_legacy));
}

export function extractLanguageDisplay(record: any): string | null {
  const values = extractLanguageNames(record);
  return values.length ? values.join(", ") : null;
}

export async function ensureMagazineId(supabase: any, rawName: string): Promise<number> {
  const name = normalizeOptionalText(rawName);
  if (!name) throw new Error("Magazine name is required.");

  const { data: upserted, error: upsertError } = await supabase
    .from("magazines")
    .upsert([{ name }], { onConflict: "name" })
    .select("id, name")
    .single();

  if (upsertError) throw upsertError;
  const id = Number(upserted?.id);
  if (!Number.isFinite(id)) throw new Error("Failed to resolve magazine id.");
  return id;
}

async function ensureLanguageIds(supabase: any, names: string[]): Promise<Map<string, number>> {
  const deduped = Array.from(
    new Map(
      names
        .map((name) => normalizeOptionalText(name))
        .filter((name): name is string => Boolean(name))
        .map((name) => [name.toLowerCase(), toTitleCase(name)]),
    ).values(),
  );

  if (deduped.length === 0) return new Map();

  const { error: upsertError } = await supabase.from("languages").upsert(
    deduped.map((name) => ({ name })),
    {
      onConflict: "name",
      ignoreDuplicates: true,
    },
  );
  if (upsertError) throw upsertError;

  const { data, error } = await supabase.from("languages").select("id, name").in("name", deduped);
  if (error) throw error;

  const out = new Map<string, number>();
  for (const row of data || []) {
    const name = normalizeOptionalText(row?.name);
    const id = Number(row?.id);
    if (!name || !Number.isFinite(id)) continue;
    out.set(name.toLowerCase(), id);
  }
  return out;
}

export async function syncRecordLanguages(
  supabase: any,
  recordId: number | string,
  rawLanguage: string | null | undefined,
): Promise<string[]> {
  const numericRecordId = Number(recordId);
  if (!Number.isFinite(numericRecordId)) {
    throw new Error("Invalid record id for language sync.");
  }

  const parsed = parseLanguageValues(rawLanguage || null);
  const languageIds = await ensureLanguageIds(supabase, parsed);

  const { error: clearError } = await supabase.from("record_languages").delete().eq("record_id", numericRecordId);
  if (clearError) throw clearError;

  if (parsed.length === 0) return [];

  const rows = parsed
    .map((name) => {
      const languageId = languageIds.get(name.toLowerCase());
      if (!languageId) return null;
      return { record_id: numericRecordId, language_id: languageId };
    })
    .filter(Boolean) as Array<{ record_id: number; language_id: number }>;

  if (rows.length === 0) return [];

  const { error: insertError } = await supabase.from("record_languages").upsert(rows, {
    onConflict: "record_id,language_id",
    ignoreDuplicates: true,
  });
  if (insertError) throw insertError;

  return parsed;
}

export function withRecordLegacyShape<T extends Record<string, any>>(record: T): T & { name: string; language: string | null } {
  return {
    ...record,
    name: extractMagazineName(record),
    language: extractLanguageDisplay(record),
  };
}
