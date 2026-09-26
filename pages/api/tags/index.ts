import { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { cleanEntityName, findByEntityName } from "@/lib/entityNames";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    try {
      const search = (req.query.q as string) || ""; // query param
      let query = supabase.from("tags").select("id, name");

      if (search) {
        query = query.ilike("name", `%${search}%`); // case-insensitive match
      }

      const { data, error } = await query.limit(20); // limit for performance
      if (error) throw error;

      res.setHeader("Cache-Control", "private, max-age=60");
      return res.status(200).json(data);
    } catch (error) {
      return res.status(500).json({ error: "Error fetching tags", details: (error as Error).message });
    }
  } else if (req.method === "POST") {
    // Create new tag
    try {
      const { name, important, reuseExisting } = req.body as {
        name?: string;
        important?: boolean | null;
        reuseExisting?: boolean;
      };

      if (!name) {
        return res.status(400).json({ message: "Name is required" });
      }

      // Normalize the tag name (NFC, collapse whitespace, trim)
      const normalizedName = cleanEntityName(name);

      if (normalizedName.length === 0) {
        return res.status(400).json({ message: "Name cannot be empty" });
      }

      if (normalizedName.length > 100) {
        return res.status(400).json({ message: "Name must be less than 100 characters" });
      }

      // Case-insensitive, like the tags_name_key_unique index (migration 014).
      const existing = await findByEntityName(supabase, "tags", normalizedName);
      if (existing) {
        if (reuseExisting === true) return res.status(200).json(existing);
        return res.status(409).json({ message: "Tag name already exists", existing });
      }

      const { data, error } = await supabase
        .from("tags")
        .insert([
          {
            name: normalizedName,
            important: important === true || important === false ? important : null,
          },
        ])
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          // Created concurrently by another request.
          const raced = await findByEntityName(supabase, "tags", normalizedName);
          if (raced && reuseExisting === true) return res.status(200).json(raced);
          return res.status(409).json({ message: "Tag name already exists", existing: raced });
        }
        throw error;
      }

      return res.status(201).json(data);
    } catch (error) {
      console.error("Error creating tag:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}
