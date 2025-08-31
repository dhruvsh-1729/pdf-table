import { createClient } from "@supabase/supabase-js";
import type { NextApiRequest, NextApiResponse } from "next";

const supabase = createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method === "GET") {
    const { recordId } = req.query;
    if (!recordId) return res.status(400).json({ error: "Record ID is required" });

    try {
      const { data, error } = await supabase
        .from("record_authors")
        .select("authors(id, name)")
        .eq("record_id", recordId);

      if (error) throw error;
      const authors = data.map((item) => item.authors);
      return res.status(200).json(authors);
    } catch (error) {
      return res.status(500).json({ error: "Error fetching record authors", details: (error as Error).message });
    }
  } else if (req.method === "POST") {
    const { recordId, authorIds } = req.body;
    if (!recordId || !Array.isArray(authorIds)) {
      return res.status(400).json({ error: "Record ID and author IDs array are required" });
    }

    try {
      const { error } = await supabase
        .from("record_authors")
        .insert(authorIds.map((authorId) => ({ record_id: recordId, author_id: authorId })));

      if (error) throw error;
      return res.status(200).json({ message: "Authors assigned successfully" });
    } catch (error) {
      return res.status(500).json({ error: "Error assigning authors", details: (error as Error).message });
    }
  } else if (req.method === "DELETE") {
    const { recordId, authorIds } = req.body;
    if (!recordId || !Array.isArray(authorIds)) {
      return res.status(400).json({ error: "Record ID and author IDs array are required" });
    }

    try {
      const { error } = await supabase
        .from("record_authors")
        .delete()
        .eq("record_id", recordId)
        .in("author_id", authorIds);

      if (error) throw error;
      return res.status(200).json({ message: "Authors removed successfully" });
    } catch (error) {
      return res.status(500).json({ error: "Error removing authors", details: (error as Error).message });
    }
  } else {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
}
