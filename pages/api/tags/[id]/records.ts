import { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    try {
      const { id } = req.query;
      const tagId = parseInt(id as string);
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
      const offset = (page - 1) * limit;

      if (isNaN(tagId)) {
        return res.status(400).json({ message: "Invalid tag ID" });
      }

      // First verify the tag exists
      const { data: tag, error: tagError } = await supabase.from("tags").select("id").eq("id", tagId).single();

      if (tagError || !tag) {
        return res.status(404).json({ message: "Tag not found" });
      }

      // Get records associated with this tag
      const { data: recordsData, error } = await supabase
        .from("record_tags")
        .select(
          `
          records (
            id,
            name,
            timestamp,
            volume,
            number,
            title_name
          )
        `,
        )
        .eq("tag_id", tagId)
        .range(offset, offset + limit - 1);

      if (error) {
        throw error;
      }

      // Transform the data structure
      const records =
        recordsData?.map((item: any) => ({
          id: item.records.id,
          name: item.records.name,
          timestamp: item.records.timestamp,
          volume: item.records.volume,
          number: item.records.number,
          title_name: item.records.title_name || null,
        })) || [];
      const totalRecords = await supabase
        .from("record_tags")
        .select("*", { count: "exact", head: true })
        .eq("tag_id", tagId);

      const hasMore = (totalRecords.count || 0) > offset + limit;

      return res.status(200).json({
        ...records,
        hasMore,
      });
    } catch (error) {
      console.error("Error fetching tag records:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}
