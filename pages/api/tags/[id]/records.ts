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

  // First, get all record_ids for the given tag_id
  const { data: tagRecords, error: tagError } = await supabase.from("record_tags").select("record_id").eq("tag_id", id);

  if (tagError) return res.status(500).json({ message: tagError.message });

  const recordIds = tagRecords?.map((tr: { record_id: number }) => tr.record_id) || [];

  if (recordIds.length === 0) {
    return res.status(200).json({
      records: [],
      hasMore: false,
    });
  }

  // Now, fetch records with those IDs
  const { data, error } = await supabase
    .from("records")
    .select("id,name,timestamp,volume,number,title_name", { count: "exact" })
    .in("id", recordIds)
    .range(offset, offset + limit - 1);

  const cleanedRecords = (data || []).map((record) => ({
    ...record,
    title_name: typeof record.title_name === "string" ? record.title_name.replace(/^\["|"\]$/g, "") : record.title_name,
  }));

  if (error) return res.status(500).json({ message: error.message });

  res.status(200).json({
    records: cleanedRecords,
    hasMore: (cleanedRecords.length || 0) === limit,
  });
}
