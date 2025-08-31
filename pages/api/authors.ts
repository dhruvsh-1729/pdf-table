import { createClient } from "@supabase/supabase-js";
import type { NextApiRequest, NextApiResponse } from "next";

const supabase = createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method === "GET") {
    try {
      const search = (req.query.q as string) || "";
      let query = supabase.from("authors").select("id, name");

      if (search) {
        query = query.ilike("name", `%${search}%`);
      }

      const { data, error } = await query.limit(20);
      if (error) throw error;

      return res.status(200).json(data);
    } catch (error) {
      return res.status(500).json({ error: "Error fetching authors", details: (error as Error).message });
    }
  } else if (req.method === "POST") {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: "Author name is required" });

      const { data, error } = await supabase.from("authors").upsert({ name }, { onConflict: "name" }).select().single();

      if (error) throw error;
      return res.status(200).json(data);
    } catch (error) {
      return res.status(500).json({ error: "Error creating author", details: (error as Error).message });
    }
  } else {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
}
