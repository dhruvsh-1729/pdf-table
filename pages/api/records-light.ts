// pages/api/records-light.ts
import { createClient } from "@supabase/supabase-js";
import type { NextApiRequest, NextApiResponse } from "next";
import { withRecordLegacyShape } from "@/lib/recordRelations";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const limit = Math.min(Number(req.query.limit ?? 300), 1000); // safety cap
    const { data, error } = await supabase
      .from("records")
      .select(
        "id,magazine_id,timestamp,summary,conclusion,pdf_url,volume,number,title_name,page_numbers,authors,email,creator_name,magazines(id,name),record_languages(language_id,languages(id,name))",
      )
      .order("timestamp", { ascending: false })
      .limit(limit);

    if (error) throw error;

    const records = (data || []).map((record: any) => withRecordLegacyShape(record));
    res.status(200).json({ records });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}
