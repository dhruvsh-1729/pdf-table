import { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    try {
      const { q: searchTerm = "", limit = "10", offset = "0" } = req.query;

      const limitNum = Math.min(parseInt(limit as string) || 10, 50); // Max 50 results
      const offsetNum = parseInt(offset as string) || 0;

      let query = supabase
        .from("tags")
        .select("id,name,important,created_at")
        .order("name")
        .range(offsetNum, offsetNum + limitNum - 1);

      if (searchTerm) {
        query = query.ilike("name", `%${searchTerm}%`);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return res.status(200).json(data || []);
    } catch (error) {
      console.error("Error searching tags:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}
