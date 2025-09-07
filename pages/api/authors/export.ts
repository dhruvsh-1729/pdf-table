// pages/api/authors/export.ts
import type { NextApiRequest, NextApiResponse } from "next";
import Papa from "papaparse";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Keep this list narrow to avoid arbitrary column ordering/SQL injection-y names
const ALLOWED_SORT_BY = new Set<"id" | "name" | "created_at">(["id", "name", "created_at"]);
const ALLOWED_SORT_ORDER = new Set<"asc" | "desc">(["asc", "desc"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    // ---- Parse & sanitize filters from query ----
    const search = (req.query.search as string) || "";
    const dateFrom = (req.query.dateFrom as string) || ""; // yyyy-mm-dd
    const dateTo = (req.query.dateTo as string) || ""; // yyyy-mm-dd
    const national = (req.query.national as string) || ""; // "national" | "international" | "null" | ""
    const sortBy = (req.query.sortBy as string) || "created_at";
    const sortOrder = (req.query.sortOrder as string) || "desc";

    const orderBy = (ALLOWED_SORT_BY.has(sortBy as any) ? sortBy : "created_at") as "id" | "name" | "created_at";
    const ascending = (ALLOWED_SORT_ORDER.has(sortOrder as any) ? sortOrder : "desc") === "asc";

    // ---- Build filtered query (no pagination) ----
    // We'll pull in CHUNKS to avoid response limits.
    const columns = "id, name, description, cover_url, national, created_at";
    const base = supabase.from("authors").select(columns);

    let q = base;

    if (search) {
      // matches name OR description
      q = q.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    if (dateFrom) {
      q = q.gte("created_at", `${dateFrom}T00:00:00.000Z`);
    }
    if (dateTo) {
      q = q.lte("created_at", `${dateTo}T23:59:59.999Z`);
    }

    if (national === "national") {
      q = q.eq("national", "national");
    } else if (national === "international") {
      q = q.eq("national", "international");
    } else if (national === "null") {
      q = q.is("national", null);
    }
    // order
    q = q.order(orderBy, { ascending });

    // ---- Fetch in chunks to include ALL matching rows ----
    const CHUNK = 1000;
    let offset = 0;
    const rows: any[] = [];

    // We must create a new query object for each range; Supabase query builders are immutable-ish, but
    // range() returns a new builder, so we reapply filters via 'q' each time.
    // Easiest: call range() on 'q' in the loop.
    while (true) {
      const { data, error } = await q.range(offset, offset + CHUNK - 1);
      if (error) throw error;

      const batch = data || [];
      rows.push(...batch);

      if (batch.length < CHUNK) break; // last page
      offset += CHUNK;
    }

    // ---- Convert to CSV ----
    const csv = Papa.unparse(
      rows.length ? rows : [{ id: "", name: "", description: "", cover_url: "", national: "", created_at: "" }],
      {
        header: true,
        columns: ["id", "name", "description", "cover_url", "national", "created_at"],
      },
    );

    // ---- Send CSV ----
    const date = new Date().toISOString().split("T")[0];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="authors-export-${date}.csv"`);
    return res.status(200).send(csv);
  } catch (error) {
    console.error("Export error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
