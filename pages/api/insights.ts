// pages/api/insights.ts
import { createClient } from "@supabase/supabase-js";
import type { NextApiRequest, NextApiResponse } from "next";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function buildTopFromCounts(rows: { value: string | null; count: number }[], limit = 5) {
  return rows
    .filter((row) => row.value && row.value.trim() !== "")
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((row) => ({ name: row.value as string, count: row.count }));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { data, error } = await supabase.from("records").select("authors, title_name, creator_name");
    if (error) throw error;

    const authorsCount = new Map<string, number>();
    const titlesCount = new Map<string, number>();
    const creatorsCount = new Map<string, number>();

    (data || []).forEach((row: any) => {
      if (row.authors) {
        String(row.authors)
          .split(",")
          .map((a: string) => a.trim())
          .filter(Boolean)
          .forEach((a: string) => authorsCount.set(a, (authorsCount.get(a) || 0) + 1));
      }
      if (row.title_name) {
        const title = String(row.title_name).trim();
        if (title) titlesCount.set(title, (titlesCount.get(title) || 0) + 1);
      }
      if (row.creator_name) {
        const creator = String(row.creator_name).trim();
        if (creator) creatorsCount.set(creator, (creatorsCount.get(creator) || 0) + 1);
      }
    });

    const topAuthors = buildTopFromCounts(
      Array.from(authorsCount.entries()).map(([value, count]) => ({ value, count })),
      5,
    );
    const topTitles = buildTopFromCounts(
      Array.from(titlesCount.entries()).map(([value, count]) => ({ value, count })),
      5,
    );
    const topCreators = buildTopFromCounts(
      Array.from(creatorsCount.entries()).map(([value, count]) => ({ value, count })),
      5,
    );

    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
    res.status(200).json({ topAuthors, topTitles, topCreators });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}
