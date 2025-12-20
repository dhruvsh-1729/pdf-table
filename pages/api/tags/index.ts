import { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

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

      return res.status(200).json(data);
    } catch (error) {
      return res.status(500).json({ error: "Error fetching tags", details: (error as Error).message });
    }
  } else if (req.method === "POST") {
    // Create new tag
    try {
      const { name, important } = req.body as {
        name?: string;
        important?: boolean | null;
      };

      if (!name) {
        return res.status(400).json({ message: "Name is required" });
      }

      // Normalize the tag name (trim whitespace)
      const normalizedName = name.trim();

      if (normalizedName.length === 0) {
        return res.status(400).json({ message: "Name cannot be empty" });
      }

      if (normalizedName.length > 100) {
        return res.status(400).json({ message: "Name must be less than 100 characters" });
      }

      // Enforce uniqueness without relying on DB constraint (not present in some envs)
      const { data: existing, error: existingError } = await supabase
        .from("tags")
        .select("id")
        .eq("name", normalizedName)
        .limit(1);

      if (existingError) {
        throw existingError;
      }

      if (existing && existing.length > 0) {
        return res.status(409).json({ message: "Tag name already exists" });
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
