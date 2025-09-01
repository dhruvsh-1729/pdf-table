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
    // Get single author
    try {
      const { data, error } = await supabase.from("authors").select("*").eq("id", authorId).single();

      if (error) {
        if (error.code === "PGRST116") {
          return res.status(404).json({ message: "Author not found" });
        }
        throw error;
      }

      return res.status(200).json(data);
    } catch (error) {
      console.error("Error fetching author:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  if (req.method === "PUT") {
    // Update author
    try {
      const { name, description, cover_url } = req.body;

      if (!name) {
        return res.status(400).json({ message: "Name is required" });
      }

      const { data, error } = await supabase
        .from("authors")
        .update({ name, description, cover_url })
        .eq("id", authorId)
        .select();

      if (error) {
        if (error.code === "23505") {
          // Unique constraint violation
          return res.status(409).json({ message: "Author name already exists" });
        }
        throw error;
      }

      if (!data || data.length === 0) {
        return res.status(404).json({ message: "Author not found" });
      }

      return res.status(200).json(data[0]);
    } catch (error) {
      console.error("Error updating author:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  if (req.method === "DELETE") {
    // Delete author and related records
    try {
      // First, delete records from junction table record_authors
      const { error: junctionError } = await supabase.from("record_authors").delete().eq("author_id", authorId);

      if (junctionError) {
        throw junctionError;
      }

      // Then delete the author
      const { data, error } = await supabase.from("authors").delete().eq("id", authorId).select();

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        return res.status(404).json({ message: "Author not found" });
      }

      return res.status(200).json({
        message: "Author deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting author:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}
