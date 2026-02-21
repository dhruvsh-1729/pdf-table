import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { addMagazineAuthors, removeMagazineAuthors, replaceMagazineAuthors } from "@/lib/magazineAuthorUtils";
import { normalizeAuthorIds } from "@/lib/magazineUtils";

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
      const { data, error } = await supabase
        .from("magazine_authors")
        .select("author_id, authors(id, name, short_name, designation)")
        .eq("magazine_id", magazineId)
        .order("author_id", { ascending: true });

      if (error) throw error;
      const authors = (data || []).map((row) => row.authors).filter(Boolean);
      return res.status(200).json({ authors });
    } catch (error) {
      console.error("Error fetching magazine authors:", error);
      return res.status(500).json({ error: "Failed to fetch magazine authors" });
    }
  }

  const authorIds = normalizeAuthorIds(req.body?.author_ids);
  if (!authorIds.length && req.method !== "DELETE") {
    return res.status(400).json({ error: "author_ids must be a non-empty array" });
  }

  try {
    if (req.method === "POST") {
      await addMagazineAuthors(supabase, magazineId, authorIds);
      return res.status(200).json({ success: true });
    }

    if (req.method === "PUT") {
      await replaceMagazineAuthors(supabase, magazineId, authorIds);
      return res.status(200).json({ success: true });
    }

    if (req.method === "DELETE") {
      await removeMagazineAuthors(supabase, magazineId, authorIds);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error: any) {
    if (error?.code === "AUTHOR_NOT_FOUND") {
      return res.status(400).json({ error: error.message, missingAuthorIds: error.missingIds || [] });
    }

    console.error("Error mutating magazine authors:", error);
    return res.status(500).json({ error: "Failed to update magazine authors" });
  }
}
