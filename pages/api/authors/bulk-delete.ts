import { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { invalidateRecordsCache } from "@/lib/recordsQueryCache";
import { invalidateRelationSnapshot } from "@/lib/recordRelationSnapshot";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "POST") {
    try {
      const { authorIds } = req.body;

      if (!Array.isArray(authorIds) || authorIds.length === 0) {
        return res.status(400).json({ message: "Author IDs array is required" });
      }

      // Deleting an author never deletes articles: their record_authors links
      // cascade, and the articles stay (use Merge to fold a duplicate instead).
      // Delete authors
      const { data: deletedAuthors, error: deleteAuthorsError } = await supabase
        .from("authors")
        .delete()
        .in("id", authorIds)
        .select("id");

      if (deleteAuthorsError) {
        throw deleteAuthorsError;
      }

      invalidateRecordsCache();
      invalidateRelationSnapshot();
      return res.status(200).json({
        message: "Authors deleted successfully",
        deletedAuthors: deletedAuthors?.length || 0,
        deletedRecords: 0,
      });
    } catch (error) {
      console.error("Error in bulk delete:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}
