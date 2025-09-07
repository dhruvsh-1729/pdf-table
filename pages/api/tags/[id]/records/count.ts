import { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    try {
      const { id } = req.query;
      const tagId = parseInt(id as string);

      if (isNaN(tagId)) {
        return res.status(400).json({ message: "Invalid tag ID" });
      }

      // First verify the tag exists
      const { data: tag, error: tagError } = await supabase.from("tags").select("id").eq("id", tagId).single();

      if (tagError || !tag) {
        return res.status(404).json({ message: "Tag not found" });
      }

      // Count records associated with this tag
      const { count, error } = await supabase
        .from("record_tags")
        .select("*", { count: "exact", head: true })
        .eq("tag_id", tagId);

      if (error) {
        throw error;
      }

      return res.status(200).json({ count: count || 0 });
    } catch (error) {
      console.error("Error counting tag records:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}
