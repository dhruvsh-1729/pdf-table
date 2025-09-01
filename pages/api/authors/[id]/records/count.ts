import { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  const authorId = parseInt(id as string);

  if (isNaN(authorId)) {
    return res.status(400).json({ message: "Invalid author ID" });
  }

  if (req.method === "GET") {
    try {
      // First, get the author's name
      const { data: authorData, error: authorError } = await supabase
        .from("authors")
        .select("name")
        .eq("id", authorId)
        .single();

      if (authorError) {
        if (authorError.code === "PGRST116") {
          return res.status(404).json({ message: "Author not found" });
        }
        throw authorError;
      }

      const authorName = authorData.name;

      // Count records where the authors field contains this author's name
      const { count, error } = await supabase
        .from("records")
        .select("*", { count: "exact", head: true })
        .contains("authors", `"${authorName}"`);

      if (error) {
        throw error;
      }

      return res.status(200).json({ count: count || 0 });
    } catch (error) {
      console.error("Error counting author records:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}
