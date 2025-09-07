import { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/**
 * Counts DISTINCT tag_id from record_tags without RPC.
 * Streams tag_id in pages and dedupes in memory.
 */
async function countDistinctUsedTags(pageSize = 2000): Promise<number> {
  const used = new Set<number>();
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("record_tags")
      .select("tag_id") // only fetch what we need
      .not("tag_id", "is", null) // ignore nulls
      .range(offset, offset + pageSize - 1);

    if (error) throw error;

    const rows = (data ?? []) as Array<{ tag_id: number | null }>;
    for (const row of rows) {
      if (row.tag_id != null) used.add(row.tag_id);
    }

    if (rows.length < pageSize) break; // last page
    offset += pageSize;
  }

  return used.size;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ message: "Method not allowed" });

  try {
    // Run independent counts in parallel for speed.
    const thirtyDaysAgoIso = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return d.toISOString();
    })();

    const [
      totalTagsResp,
      recentTagsResp,
      importantTagsResp,
      usedTagsCount, // computed via pagination
    ] = await Promise.all([
      supabase.from("tags").select("*", { count: "exact", head: true }),
      supabase.from("tags").select("*", { count: "exact", head: true }).gte("created_at", thirtyDaysAgoIso),
      supabase.from("tags").select("*", { count: "exact", head: true }).eq("important", true),
      countDistinctUsedTags(), // no RPC, paginated fetch + Set
    ]);

    if (totalTagsResp.error) throw totalTagsResp.error;
    if (recentTagsResp.error) throw recentTagsResp.error;
    if (importantTagsResp.error) throw importantTagsResp.error;

    const stats = {
      totalTags: totalTagsResp.count ?? 0,
      recentTags: recentTagsResp.count ?? 0,
      importantTags: importantTagsResp.count ?? 0,
      usedTags: usedTagsCount,
    };

    return res.status(200).json(stats);
  } catch (error) {
    console.error("Error fetching tag stats:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}
