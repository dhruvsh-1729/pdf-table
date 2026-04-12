import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function parseNumber(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeLanguageName(value: unknown) {
  if (typeof value !== "string") return "";
  const normalized = normalizeWhitespace(value);
  if (!normalized) return "";
  return toTitleCase(normalized);
}

async function fetchLanguageRelationCounts(
  table: "record_languages" | "magazine_languages",
  countColumn: "record_id" | "magazine_id",
  ids: number[],
) {
  const entries = await Promise.all(
    ids.map(async (id) => {
      const { count, error } = await supabase
        .from(table)
        .select(countColumn, { count: "exact", head: true })
        .eq("language_id", id);

      if (error) throw error;
      return [id, count || 0] as const;
    }),
  );

  return new Map<number, number>(entries);
}

async function attachLanguageCounts(rows: any[]) {
  const ids = (rows || []).map((row) => Number(row?.id)).filter((id) => Number.isFinite(id));
  if (ids.length === 0) {
    return (rows || []).map((row) => ({ ...row, records_count: 0, magazines_count: 0 }));
  }

  const [recordCountMap, magazineCountMap] = await Promise.all([
    fetchLanguageRelationCounts("record_languages", "record_id", ids),
    fetchLanguageRelationCounts("magazine_languages", "magazine_id", ids),
  ]);

  return rows.map((row) => {
    const id = Number(row?.id);
    return {
      ...row,
      records_count: Number.isFinite(id) ? recordCountMap.get(id) || 0 : 0,
      magazines_count: Number.isFinite(id) ? magazineCountMap.get(id) || 0 : 0,
    };
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    try {
      const q = String(req.query.q || "").trim();
      const limit = Math.max(1, Math.min(100, parseNumber(req.query.limit, 100)));
      const offset = Math.max(0, parseNumber(req.query.offset, 0));

      let query = supabase.from("languages").select("id, name, created_at", { count: "exact" });

      if (q) {
        query = query.ilike("name", `%${q}%`);
      }

      const { data, count, error } = await query.order("name", { ascending: true }).range(offset, offset + limit - 1);
      if (error) throw error;

      const languages = await attachLanguageCounts(data || []);
      return res.status(200).json({ languages, count: count || 0, limit, offset });
    } catch (error) {
      console.error("Error fetching languages:", error);
      return res.status(500).json({ error: "Failed to fetch languages" });
    }
  }

  if (req.method === "POST") {
    try {
      const name = normalizeLanguageName(req.body?.name);
      if (!name) {
        return res.status(400).json({ error: "Language name is required." });
      }

      const { data: existing, error: existingError } = await supabase.from("languages").select("id, name").ilike("name", name).limit(1);
      if (existingError) throw existingError;
      if ((existing || []).some((row) => String(row?.name || "").trim().toLowerCase() === name.toLowerCase())) {
        return res.status(409).json({ error: "Language already exists." });
      }

      const { data: inserted, error: insertError } = await supabase
        .from("languages")
        .insert([{ name }])
        .select("id, name, created_at")
        .single();

      if (insertError) {
        if ((insertError as any).code === "23505") {
          return res.status(409).json({ error: "Language already exists." });
        }
        throw insertError;
      }

      const [language] = await attachLanguageCounts([inserted]);
      return res.status(201).json(language);
    } catch (error) {
      console.error("Error creating language:", error);
      return res.status(500).json({ error: "Failed to create language" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
