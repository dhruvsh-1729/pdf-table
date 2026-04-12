import { createClient } from "@supabase/supabase-js";
import type { NextApiRequest, NextApiResponse } from "next";
import { invalidateRecordsCache } from "@/lib/recordsQueryCache";
import { invalidateRelationSnapshot } from "@/lib/recordRelationSnapshot";

const supabase = createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");

function parseRecordId(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = typeof raw === "string" ? Number.parseInt(raw, 10) : Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function sanitizeIds(values: unknown) {
  if (!Array.isArray(values)) return null;
  const ids = values.map((id) => (typeof id === "string" ? Number.parseInt(id, 10) : Number(id)));
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) return null;
  return Array.from(new Set(ids));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method === "GET") {
    const recordId = parseRecordId(req.query.recordId);
    if (!recordId) return res.status(400).json({ error: "Valid record ID is required" });

    try {
      const { data, error } = await supabase
        .from("record_languages")
        .select("languages(id, name)")
        .eq("record_id", recordId);

      if (error) throw error;
      const languages = (data || []).map((item: any) => item.languages).filter(Boolean);
      return res.status(200).json(languages);
    } catch (error) {
      return res.status(500).json({ error: "Error fetching record languages", details: (error as Error).message });
    }
  }

  if (req.method === "POST") {
    const recordId = parseRecordId(req.body?.recordId);
    const languageIds = sanitizeIds(req.body?.languageIds);
    if (!recordId || !languageIds) {
      return res.status(400).json({ error: "Record ID and language IDs array are required" });
    }

    try {
      const { data: existingLanguages, error: languageFetchError } = await supabase
        .from("languages")
        .select("id")
        .in("id", languageIds);

      if (languageFetchError) {
        return res.status(500).json({ error: "Error validating languages", details: languageFetchError.message });
      }

      const existingIds = new Set((existingLanguages || []).map((language) => Number(language.id)));
      const missing = languageIds.filter((id) => !existingIds.has(id));
      if (missing.length > 0) {
        return res.status(400).json({ error: "Some languages do not exist", missingLanguageIds: missing });
      }

      const { error } = await supabase.from("record_languages").upsert(
        languageIds.map((languageId) => ({ record_id: recordId, language_id: languageId })),
        { onConflict: "record_id,language_id", ignoreDuplicates: true },
      );

      if (error) throw error;

      invalidateRecordsCache();
      invalidateRelationSnapshot();

      return res.status(200).json({ message: "Languages assigned successfully" });
    } catch (error) {
      return res.status(500).json({ error: "Error assigning languages", details: (error as Error).message });
    }
  }

  if (req.method === "DELETE") {
    const recordId = parseRecordId(req.body?.recordId);
    const languageIds = sanitizeIds(req.body?.languageIds);
    if (!recordId || !languageIds) {
      return res.status(400).json({ error: "Record ID and language IDs array are required" });
    }

    try {
      const { error } = await supabase
        .from("record_languages")
        .delete()
        .eq("record_id", recordId)
        .in("language_id", languageIds);

      if (error) throw error;

      invalidateRecordsCache();
      invalidateRelationSnapshot();

      return res.status(200).json({ message: "Languages removed successfully" });
    } catch (error) {
      return res.status(500).json({ error: "Error removing languages", details: (error as Error).message });
    }
  }

  return res.status(405).json({ error: "Method Not Allowed" });
}
