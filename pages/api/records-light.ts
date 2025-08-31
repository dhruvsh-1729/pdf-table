// pages/api/records-light.ts
import { createClient } from "@supabase/supabase-js";
import type { NextApiRequest, NextApiResponse } from "next";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const limit = Math.min(Number(req.query.limit ?? 300), 1000); // safety cap
    const { data, error } = await supabase
      .from("records")
      .select(
        "id,name,timestamp,summary,conclusion,pdf_url,volume,number,title_name,page_numbers,authors,language,email,creator_name",
      )
      .order("timestamp", { ascending: false })
      .limit(limit);

    if (error) throw error;

    // No heavy parsing – return as-is
    res.status(200).json({ records: data ?? [] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}
