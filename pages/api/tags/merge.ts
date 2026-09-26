// POST /api/tags/merge { keepId, mergeIds } — fold duplicate tags into one
// (migration 032, merge_tags): links move to the survivor, duplicates are deleted.
import { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { invalidateRecordsCache } from "@/lib/recordsQueryCache";
import { invalidateRelationSnapshot } from "@/lib/recordRelationSnapshot";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });

  const keepId = Number(req.body?.keepId);
  const mergeIds: number[] = Array.isArray(req.body?.mergeIds)
    ? Array.from(new Set<number>(req.body.mergeIds.map(Number))).filter((id) => Number.isInteger(id) && id > 0 && id !== keepId)
    : [];
  if (!Number.isInteger(keepId) || keepId <= 0 || mergeIds.length === 0 || mergeIds.length > 50) {
    return res.status(400).json({ message: "Choose the tag to keep and 1–50 tags to merge into it" });
  }

  const { data, error } = await supabase.rpc("merge_tags", { p_keep: keepId, p_merge: mergeIds });
  if (error) {
    const status = error.code === "P0002" || error.code === "22023" ? 400 : 500;
    return res.status(status).json({ message: error.message });
  }
  invalidateRecordsCache();
  invalidateRelationSnapshot();
  return res.status(200).json({ merged: mergeIds.length, records: data });
}
