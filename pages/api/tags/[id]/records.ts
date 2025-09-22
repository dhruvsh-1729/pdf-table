// pages/api/tags/[id]/records.ts
import { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  const page = parseInt((req.query.page as string) || "1");
  const limit = 20;
  const offset = (page - 1) * limit;

  if (!id) return res.status(400).json({ message: "Missing tag id" });

  const { data, error } = await supabase
    .from("records")
    .select("id,name,timestamp,volume,number,title_name", { count: "exact" })
    .filter("id", "in", supabase.from("record_tags").select("record_id").eq("tag_id", id))
    .range(offset, offset + limit - 1);

  if (error) return res.status(500).json({ message: error.message });

  res.status(200).json({
    records: data,
    hasMore: (data?.length || 0) === limit,
  });
}
