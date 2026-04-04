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

    let query = supabase.from("magazines").select("name").order("name", { ascending: true });

    if (searchQuery) {
      query = query.ilike("name", `%${searchQuery}%`);
    }

    query = query.limit(50);

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching magazine names:", error);
      return res.status(500).json({ error: "Failed to fetch magazine names" });
    }

    const uniqueNames = Array.from(new Set((data || []).map((magazine) => magazine.name).filter(Boolean))).sort();

    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json(uniqueNames);
  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({
      error: "Server error",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
