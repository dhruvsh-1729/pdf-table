import { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  const tagId = parseInt(id as string);

  if (isNaN(tagId)) {
    return res.status(400).json({ message: "Invalid tag ID" });
  }

  if (req.method === "GET") {
    // Get single tag
    try {
      const { data, error } = await supabase.from("tags").select("*").eq("id", tagId).single();

      if (error) {
        if (error.code === "PGRST116") {
          return res.status(404).json({ message: "Tag not found" });
        }
        throw error;
      }

      return res.status(200).json(data);
    } catch (error) {
      console.error("Error fetching tag:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  if (req.method === "PUT") {
    // Update tag
    try {
      const { name, important } = req.body as {
        name?: string;
        important?: boolean | null;
      };

      if (!name) {
        return res.status(400).json({ message: "Name is required" });
      }

      // Normalize the tag name
      const normalizedName = name.trim();

      if (normalizedName.length === 0) {
        return res.status(400).json({ message: "Name cannot be empty" });
      }

      if (normalizedName.length > 100) {
        return res.status(400).json({ message: "Name must be less than 100 characters" });
      }

      // Check for valid characters
      if (!/^[a-zA-Z0-9\s\-_]+$/.test(normalizedName)) {
        return res.status(400).json({
          message: "Name can only contain letters, numbers, spaces, hyphens, and underscores",
        });
      }

      const { data, error } = await supabase
        .from("tags")
        .update({
          name: normalizedName,
          important: important === true || important === false ? important : null,
        })
        .eq("id", tagId)
        .select();

      if (error) {
        if (error.code === "23505") {
          // Unique constraint violation
          return res.status(409).json({ message: "Tag name already exists" });
        }
        throw error;
      }

      if (!data || data.length === 0) {
        return res.status(404).json({ message: "Tag not found" });
      }

      return res.status(200).json(data[0]);
    } catch (error) {
      console.error("Error updating tag:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  if (req.method === "DELETE") {
    // Delete tag and related records
    try {
      // First, delete records from junction table record_tags
      const { error: junctionError } = await supabase.from("record_tags").delete().eq("tag_id", tagId);

      if (junctionError) {
        throw junctionError;
      }

      // Then delete the tag
      const { data, error } = await supabase.from("tags").delete().eq("id", tagId).select();

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        return res.status(404).json({ message: "Tag not found" });
      }

      return res.status(200).json({
        message: "Tag deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting tag:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}
