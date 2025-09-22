import { createClient } from "@supabase/supabase-js";
import { NextApiRequest, NextApiResponse } from "next";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// pages/api/tags/[id]/records/count.ts
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ message: "Missing tag id" });

  const { count, error } = await supabase
    .from("record_tags")
    .select("record_id", { count: "exact", head: true })
    .eq("tag_id", id);

  if (error) return res.status(500).json({ message: error.message });

  res.status(200).json({ count });
}
