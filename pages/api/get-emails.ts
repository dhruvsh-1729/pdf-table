import { createClient } from "@supabase/supabase-js";
import type { NextApiRequest, NextApiResponse } from "next";

// Initialize Supabase client
const supabase = createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Query distinct creator_name and email rows from the "records" table
    const { data, error } = await supabase.from("users").select("name, email");

    if (error) {
      throw error;
    }

    // Clean up fields
    const formattedData: any = data.map((item: any) => ({
      creator_name: item.name?.replace(/^\[|\]$/g, "").replace(/^"|"$/g, ""),
      email: item.email?.replace(/^\[|\]$/g, "").replace(/^"|"$/g, ""),
    }));

    res.status(200).json(formattedData);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
