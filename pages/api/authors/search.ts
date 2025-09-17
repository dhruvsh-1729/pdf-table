// /api/authors/search.ts (Updated)
import { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    try {
      const { q: searchTerm = "", offset = "0" } = req.query;

      const offsetNum = parseInt(offset as string) || 0;

      let query = supabase
        .from("authors")
        .select("id,name,description,cover_url,created_at,national,designation,short_name") // Updated select
        .order("name")
        .range(offsetNum, offsetNum - 1);

      if (searchTerm) {
        query = query.or(
          `name.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%,designation.ilike.%${searchTerm}%`,
        );
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return res.status(200).json(data || []);
    } catch (error) {
      console.error("Error searching authors:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}
