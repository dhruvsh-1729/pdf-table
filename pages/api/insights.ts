// pages/api/insights.ts
import { createClient } from "@supabase/supabase-js";
import type { NextApiRequest, NextApiResponse } from "next";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { data: records, error } = await supabase.from("records").select("title_name,authors,creator_name,language");

    if (error) throw error;

    const authorsCount: Record<string, number> = {};
    const titlesCount: Record<string, number> = {};
    const creatorsCount: Record<string, number> = {};

    (records ?? []).forEach((r: any) => {
      if (r.authors) {
        r.authors
          .split(",")
          .map((a: string) => a.trim())
          .filter(Boolean)
          .forEach((a: string) => (authorsCount[a] = (authorsCount[a] ?? 0) + 1));
      }
      if (r.title_name) titlesCount[r.title_name] = (titlesCount[r.title_name] ?? 0) + 1;
      if (r.creator_name) creatorsCount[r.creator_name] = (creatorsCount[r.creator_name] ?? 0) + 1;
    });

    const top = (obj: Record<string, number>, n = 5) =>
      Object.entries(obj)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([name, count]) => ({ name, count }));

    res.status(200).json({
      topAuthors: top(authorsCount, 5),
      topTitles: top(titlesCount, 5),
      topCreators: top(creatorsCount, 5),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}
