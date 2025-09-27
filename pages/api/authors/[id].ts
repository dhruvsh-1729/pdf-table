// /api/authors/[id].ts (Updated)
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
      const { name, description, cover_url, national, designation, short_name } = req.body as {
        name?: string;
        description?: string | null;
        cover_url?: string | null;
        national?: string | null;
        designation?: string | null; // New field
        short_name?: string | null; // New field
      };

      if (!name) {
        return res.status(400).json({ message: "Name is required" });
      }

      const normalizedNational =
        national === "national" || national === "international"
          ? national
          : national === null || national === undefined || national === ""
            ? null
            : null;

      const { data } = await supabase
        .from("authors")
        .update({
          name,
          description,
          cover_url,
          national: normalizedNational,
          designation: designation || null, // New field
          short_name: short_name || null, // New field
        })
        .eq("id", authorId)
        .select();

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
