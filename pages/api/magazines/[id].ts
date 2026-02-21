import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { fetchMagazineById } from "@/lib/magazineQueries";
import { normalizeMagazinePayload } from "@/lib/magazineUtils";
import { replaceMagazineAuthors } from "@/lib/magazineAuthorUtils";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function parseId(idValue: string | string[] | undefined) {
  if (!idValue || Array.isArray(idValue)) return null;
  const id = Number(idValue);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const magazineId = parseId(req.query.id);
  if (!magazineId) {
    return res.status(400).json({ error: "Invalid magazine id" });
  }

  if (req.method === "GET") {
    try {
      const magazine = await fetchMagazineById(supabase, magazineId);
      if (!magazine) {
        return res.status(404).json({ error: "Magazine not found" });
      }
      return res.status(200).json(magazine);
    } catch (error: any) {
      if (error?.code === "PGRST116") {
        return res.status(404).json({ error: "Magazine not found" });
      }
      console.error("Error fetching magazine:", error);
      return res.status(500).json({ error: "Failed to fetch magazine" });
    }
  }

  if (req.method === "PUT" || req.method === "PATCH") {
    try {
      const { data: payload, authorIds, errors } = normalizeMagazinePayload(req.body || {}, { isUpdate: true });
      if (errors.length) {
        return res.status(400).json({ error: "Validation failed", details: errors });
      }

      const incomingAuthorIds = Object.prototype.hasOwnProperty.call(req.body || {}, "author_ids");
      const hasPayload = Object.keys(payload).length > 0;
      if (!hasPayload && !incomingAuthorIds) {
        return res.status(400).json({ error: "No update fields provided." });
      }

      if (hasPayload) {
        const { error } = await supabase.from("magazines").update(payload).eq("id", magazineId);
        if (error) {
          if ((error as any).code === "23505") {
            return res.status(409).json({ error: "Magazine name or slug already exists." });
          }
          throw error;
        }
      }

      if (incomingAuthorIds) {
        await replaceMagazineAuthors(supabase, magazineId, authorIds);
      }

      const magazine = await fetchMagazineById(supabase, magazineId);
      if (!magazine) {
        return res.status(404).json({ error: "Magazine not found" });
      }

      return res.status(200).json(magazine);
    } catch (error: any) {
      if (error?.code === "AUTHOR_NOT_FOUND") {
        return res.status(400).json({ error: error.message, missingAuthorIds: error.missingIds || [] });
      }
      console.error("Error updating magazine:", error);
      return res.status(500).json({ error: "Failed to update magazine" });
    }
  }

  if (req.method === "DELETE") {
    try {
      const { count, error: countError } = await supabase
        .from("records")
        .select("id", { count: "exact", head: true })
        .eq("magazine_id", magazineId);

      if (countError) throw countError;
      if ((count || 0) > 0) {
        return res.status(409).json({
          error: "Cannot delete magazine with linked records.",
          linkedRecords: count || 0,
        });
      }

      const { error: unlinkError } = await supabase.from("magazine_authors").delete().eq("magazine_id", magazineId);
      if (unlinkError) throw unlinkError;

      const { error } = await supabase.from("magazines").delete().eq("id", magazineId);
      if (error) throw error;

      return res.status(200).json({ success: true, id: magazineId });
    } catch (error) {
      console.error("Error deleting magazine:", error);
      return res.status(500).json({ error: "Failed to delete magazine" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
