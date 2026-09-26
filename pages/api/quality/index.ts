// pages/api/quality/index.ts — data-quality overview for /quality.
// Auth: middleware requires a portal session for every /api route.
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const TTL_MS = 5 * 60 * 1000;
let cache: { at: number; body: unknown } | null = null;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }
  const fresh = req.query.refresh === "1";
  if (!fresh && cache && Date.now() - cache.at < TTL_MS) {
    return res.status(200).json(cache.body);
  }
  try {
    const [{ data: rows, error }, { data: runs }] = await Promise.all([
      supabaseAdmin.rpc("quality_overview"),
      supabaseAdmin
        .from("ops_runs")
        .select("id, job, status, started_at, finished_at, summary")
        .order("started_at", { ascending: false })
        .limit(12),
    ]);
    if (error) throw error;
    const body = { generatedAt: new Date().toISOString(), magazines: rows ?? [], runs: runs ?? [] };
    cache = { at: Date.now(), body };
    return res.status(200).json(body);
  } catch (err) {
    console.error("quality overview failed:", err);
    return res.status(500).json({ error: "Could not load the quality overview." });
  }
}
