import { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "POST") {
    // Create new author
    try {
      const { name, description, cover_url } = req.body;

      if (!name) {
        return res.status(400).json({ message: "Name is required" });
      }

      const { data, error } = await supabase.from("authors").insert([{ name, description, cover_url }]).select();

      if (error) {
        if (error.code === "23505") {
          // Unique constraint violation
          return res.status(409).json({ message: "Author name already exists" });
        }
        throw error;
      }

      return res.status(201).json(data[0]);
    } catch (error) {
      console.error("Error creating author:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}
