// /api/authors/index.ts (Updated)
import { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { cleanEntityName, findByEntityName } from "@/lib/entityNames";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    try {
      const raw = (req.query.q as string) || "";
      // normalize: keep only letters/digits, lowercase
      const needle = raw.replace(/[^a-z0-9]/gi, "").toLowerCase();

      // Build a fuzzy pattern like %c%k% for "ck"
      const fuzzy = needle ? `%${needle.split("").join("%")}%` : "";

      let query = supabase.from("authors").select("id, name, designation, short_name");

      if (needle) {
        // case-insensitive search with wildcards between letters
        // This will match across punctuation/spaces like "C. K. Chapple"
        query = query.or(`name.ilike.${fuzzy},short_name.ilike.${fuzzy}`);
      } else if (cleanEntityName(raw)) {
        // Non-Latin names (Devanagari etc.) have no [a-z0-9] characters, so the
        // fuzzy needle is empty; match the text itself instead.
        const term = cleanEntityName(raw).replace(/[\\%_,()]/g, " ").trim();
        if (term) query = query.or(`name.ilike.%${term}%,short_name.ilike.%${term}%`);
      }

      const { data, error } = await query.limit(20);
      if (error) throw error;

      res.setHeader("Cache-Control", "private, max-age=60");
      return res.status(200).json(data);
    } catch (err) {
      return res.status(500).json({ error: "Server error" });
    }
  } else if (req.method === "POST") {
    // Create new author
    try {
      const { name, description, cover_url, national, designation, short_name, reuseExisting } = req.body as {
        name?: string;
        reuseExisting?: boolean;
        description?: string | null;
        cover_url?: string | null;
        national?: string | null;
        designation?: string | null; // New field
        short_name?: string | null; // New field
      };

      const cleanName = cleanEntityName(name);
      if (!cleanName) {
        return res.status(400).json({ message: "Name is required" });
      }

      // Callers that just need an id for this name (upload page, record
      // editor) pass reuseExisting and get the existing author back.
      const existing = await findByEntityName(supabase, "authors", cleanName);
      if (existing) {
        if (reuseExisting === true) return res.status(200).json(existing);
        return res.status(409).json({ message: "Author name already exists", existing });
      }

      const normalizedNational =
        national === "national" || national === "international" || national === "jainmonk" || national === "jainnun"
          ? national
          : national === null || national === undefined || national === "" || national === "null"
            ? null
            : null;

      const { data, error } = await supabase
        .from("authors")
        .insert([
          {
            name: cleanName,
            description,
            cover_url,
            national: normalizedNational,
            designation: designation || null, // New field
            short_name: short_name || null, // New field
          },
        ])
        .select();

      if (error) {
        if (error.code === "23505") {
          // Created concurrently by another request.
          const raced = await findByEntityName(supabase, "authors", cleanName);
          if (raced && reuseExisting === true) return res.status(200).json(raced);
          return res.status(409).json({ message: "Author name already exists", existing: raced });
        }
        throw error;
      }

      return res.status(201).json(data[0]);
    } catch (error) {
      console.error("Error creating author:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}
