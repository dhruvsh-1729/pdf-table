import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { fetchMagazineById, enrichMagazines, MAGAZINE_SELECT_COLUMNS } from "@/lib/magazineQueries";
import { normalizeMagazinePayload } from "@/lib/magazineUtils";
import { replaceMagazineAuthors } from "@/lib/magazineAuthorUtils";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function parseNumber(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    try {
      const q = String(req.query.q || "").trim();
      const isActive = String(req.query.is_active || "").trim().toLowerCase();
      const limit = Math.max(1, Math.min(100, parseNumber(req.query.limit, 50)));
      const offset = Math.max(0, parseNumber(req.query.offset, 0));

      let query = supabase.from("magazines").select(MAGAZINE_SELECT_COLUMNS, { count: "exact" });

      if (q) {
        query = query.or(`name.ilike.%${q}%,short_name.ilike.%${q}%,slug.ilike.%${q}%,description.ilike.%${q}%`);
      }

      if (["true", "false"].includes(isActive)) {
        query = query.eq("is_active", isActive === "true");
      }

      const { data, count, error } = await query.order("name", { ascending: true }).range(offset, offset + limit - 1);
      if (error) throw error;

      const magazines = await enrichMagazines(supabase, data || []);
      return res.status(200).json({ magazines, count: count || 0, limit, offset });
    } catch (error) {
      console.error("Error fetching magazines:", error);
      return res.status(500).json({ error: "Failed to fetch magazines" });
    }
  }

  if (req.method === "POST") {
    try {
      const { data: payload, authorIds, errors } = normalizeMagazinePayload(req.body || {}, { isUpdate: false });
      if (errors.length) {
        return res.status(400).json({ error: "Validation failed", details: errors });
      }

      const { data: inserted, error: insertError } = await supabase.from("magazines").insert([payload]).select("id").single();

      if (insertError) {
        if ((insertError as any).code === "23505") {
          return res.status(409).json({ error: "Magazine already exists." });
        }
        throw insertError;
      }

      const magazineId = Number(inserted.id);
      if (authorIds.length) {
        await replaceMagazineAuthors(supabase, magazineId, authorIds);
      }

      const magazine = await fetchMagazineById(supabase, magazineId);
      return res.status(201).json(magazine);
    } catch (error: any) {
      if (error?.code === "AUTHOR_NOT_FOUND") {
        return res.status(400).json({ error: error.message, missingAuthorIds: error.missingIds || [] });
      }
      console.error("Error creating magazine:", error);
      return res.status(500).json({ error: "Failed to create magazine" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
