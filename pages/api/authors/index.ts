// /api/authors/index.ts (Updated)
import { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

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
      }

      const { data, error } = await query.limit(20);
      if (error) throw error;

      return res.status(200).json(data);
    } catch (err) {
      return res.status(500).json({ error: "Server error" });
    }
  } else if (req.method === "POST") {
    // Create new author
    try {
      const { name, description, cover_url, national, designation, short_name } = req.body as {
        name?: string;
        description?: string | null;
        cover_url?: string | null;
        national?: string | null;
        designation?: string | null; // New field
        short_name?: string | null; // New field
      };

      if (!name) {
        return res.status(400).json({ message: "Name is required" });
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
            name,
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
          // Unique constraint violation
          return res.status(409).json({ message: "Author name already exists" });
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
