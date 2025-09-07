import { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "POST") {
    try {
      const { tagIds } = req.body as { tagIds: number[] };

      if (!tagIds || !Array.isArray(tagIds) || tagIds.length === 0) {
        return res.status(400).json({ message: "Tag IDs are required" });
      }

      // Validate tag IDs
      const validTagIds = tagIds.filter((id) => Number.isInteger(id) && id > 0);
      if (validTagIds.length === 0) {
        return res.status(400).json({ message: "Valid tag IDs are required" });
      }

      // First, count how many record associations will be deleted
      const { count: recordAssociationsCount } = await supabase
        .from("record_tags")
        .select("*", { count: "exact", head: true })
        .in("tag_id", validTagIds);

      // Delete records from junction table record_tags
      const { error: junctionError } = await supabase.from("record_tags").delete().in("tag_id", validTagIds);

      if (junctionError) {
        throw junctionError;
      }

      // Then delete the tags
      const { data: deletedTags, error: tagError } = await supabase
        .from("tags")
        .delete()
        .in("id", validTagIds)
        .select("id");

      if (tagError) {
        throw tagError;
      }

      const deletedCount = deletedTags?.length || 0;

      return res.status(200).json({
        message: `Successfully deleted ${deletedCount} tag(s) and ${recordAssociationsCount || 0} record associations`,
        deletedTags: deletedCount,
        deletedRecords: recordAssociationsCount || 0,
      });
    } catch (error) {
      console.error("Error in bulk delete:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}
