import { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "POST") {
    try {
      const { authorIds } = req.body;

      if (!Array.isArray(authorIds) || authorIds.length === 0) {
        return res.status(400).json({ message: "Author IDs array is required" });
      }

      // Get author names first for record deletion
      const { data: authors, error: authorsError } = await supabase
        .from("authors")
        .select("id, name")
        .in("id", authorIds);

      if (authorsError) {
        throw authorsError;
      }

      let totalDeletedRecords = 0;

      // Delete records for each author
      for (const author of authors) {
        const { data: recordsData, error: recordsCountError } = await supabase
          .from("records")
          .select("id")
          .contains("authors", `"${author.name}"`);

        if (recordsCountError) {
          console.error(`Error counting records for author ${author.name}:`, recordsCountError);
          continue;
        }

        const recordCount = recordsData?.length || 0;
        totalDeletedRecords += recordCount;

        if (recordCount > 0) {
          const { error: deleteRecordsError } = await supabase
            .from("records")
            .delete()
            .contains("authors", `"${author.name}"`);

          if (deleteRecordsError) {
            console.error(`Error deleting records for author ${author.name}:`, deleteRecordsError);
          }
        }
      }

      // Delete authors
      const { data: deletedAuthors, error: deleteAuthorsError } = await supabase
        .from("authors")
        .delete()
        .in("id", authorIds)
        .select();

      if (deleteAuthorsError) {
        throw deleteAuthorsError;
      }

      return res.status(200).json({
        message: "Authors deleted successfully",
        deletedAuthors: deletedAuthors?.length || 0,
        deletedRecords: totalDeletedRecords,
      });
    } catch (error) {
      console.error("Error in bulk delete:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}
