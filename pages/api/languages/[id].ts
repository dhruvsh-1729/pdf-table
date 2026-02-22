import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function parseId(idValue: string | string[] | undefined) {
  if (!idValue || Array.isArray(idValue)) return null;
  const id = Number(idValue);
  return Number.isInteger(id) && id > 0 ? id : null;
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

async function fetchLanguageById(languageId: number) {
  const { data, error } = await supabase.from("languages").select("id, name, created_at").eq("id", languageId).single();
  if (error) throw error;

  const [{ count: recordCount, error: recordError }, { count: magazineCount, error: magazineError }] = await Promise.all([
    supabase.from("record_languages").select("record_id", { count: "exact", head: true }).eq("language_id", languageId),
    supabase.from("magazine_languages").select("magazine_id", { count: "exact", head: true }).eq("language_id", languageId),
  ]);

  if (recordError) throw recordError;
  if (magazineError) throw magazineError;

  return {
    ...data,
    records_count: recordCount || 0,
    magazines_count: magazineCount || 0,
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const languageId = parseId(req.query.id);
  if (!languageId) {
    return res.status(400).json({ error: "Invalid language id" });
  }

  if (req.method === "GET") {
    try {
      const language = await fetchLanguageById(languageId);
      return res.status(200).json(language);
    } catch (error: any) {
      if (error?.code === "PGRST116") {
        return res.status(404).json({ error: "Language not found" });
      }
      console.error("Error fetching language:", error);
      return res.status(500).json({ error: "Failed to fetch language" });
    }
  }

  if (req.method === "PUT" || req.method === "PATCH") {
    try {
      if (!Object.prototype.hasOwnProperty.call(req.body || {}, "name")) {
        return res.status(400).json({ error: "Field 'name' is required." });
      }

      const name = normalizeLanguageName(req.body?.name);
      if (!name) {
        return res.status(400).json({ error: "Language name is required." });
      }

      const { data: existing, error: existingError } = await supabase
        .from("languages")
        .select("id, name")
        .ilike("name", name)
        .neq("id", languageId)
        .limit(1);
      if (existingError) throw existingError;
      if ((existing || []).some((row) => String(row?.name || "").trim().toLowerCase() === name.toLowerCase())) {
        return res.status(409).json({ error: "Language already exists." });
      }

      const { error: updateError } = await supabase.from("languages").update({ name }).eq("id", languageId);
      if (updateError) {
        if ((updateError as any).code === "23505") {
          return res.status(409).json({ error: "Language already exists." });
        }
        throw updateError;
      }

      const language = await fetchLanguageById(languageId);
      return res.status(200).json(language);
    } catch (error: any) {
      if (error?.code === "PGRST116") {
        return res.status(404).json({ error: "Language not found" });
      }
      console.error("Error updating language:", error);
      return res.status(500).json({ error: "Failed to update language" });
    }
  }

  if (req.method === "DELETE") {
    try {
      const [{ count: recordCount, error: recordError }, { count: magazineCount, error: magazineError }] = await Promise.all([
        supabase.from("record_languages").select("record_id", { count: "exact", head: true }).eq("language_id", languageId),
        supabase.from("magazine_languages").select("magazine_id", { count: "exact", head: true }).eq("language_id", languageId),
      ]);

      if (recordError) throw recordError;
      if (magazineError) throw magazineError;

      if ((recordCount || 0) > 0 || (magazineCount || 0) > 0) {
        return res.status(409).json({
          error: "Cannot delete language with linked records or magazines.",
          linkedRecords: recordCount || 0,
          linkedMagazines: magazineCount || 0,
        });
      }

      const { error: deleteError } = await supabase.from("languages").delete().eq("id", languageId);
      if (deleteError) throw deleteError;

      return res.status(200).json({ success: true, id: languageId });
    } catch (error) {
      console.error("Error deleting language:", error);
      return res.status(500).json({ error: "Failed to delete language" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
