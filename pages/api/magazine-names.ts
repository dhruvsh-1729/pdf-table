// pages/api/magazine-names.ts
import { createClient } from "@supabase/supabase-js";
import type { NextApiRequest, NextApiResponse } from "next";

const supabase = createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { q = "" } = req.query;
    const searchQuery = String(q).trim();

    // Get unique magazine names from the database
    let query = supabase.from("records").select("name").order("name", { ascending: true });

    // If there's a search query, filter by it
    if (searchQuery) {
      query = query.ilike("name", `%${searchQuery}%`);
    }

    // Limit results for performance
    query = query.limit(50);

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching magazine names:", error);
      return res.status(500).json({ error: "Failed to fetch magazine names" });
    }

    // Extract unique names and filter out nulls
    const uniqueNames = Array.from(new Set((data || []).map((record) => record.name).filter(Boolean))).sort();

    return res.status(200).json(uniqueNames);
  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({
      error: "Server error",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
