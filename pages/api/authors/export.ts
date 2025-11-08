// /api/authors/export.ts (Updated)
import type { NextApiRequest, NextApiResponse } from "next";
import Papa from "papaparse";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const ALLOWED_SORT_BY = new Set<"id" | "name" | "created_at" | "designation">([
  "id",
  "name",
  "created_at",
  "designation",
]); // Updated
const ALLOWED_SORT_ORDER = new Set<"asc" | "desc">(["asc", "desc"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const search = (req.query.search as string) || "";
    const dateFrom = (req.query.dateFrom as string) || "";
    const dateTo = (req.query.dateTo as string) || "";
    const national = (req.query.national as string) || "";
    const designation = (req.query.designation as string) || ""; // New filter
    const sortBy = (req.query.sortBy as string) || "created_at";
    const sortOrder = (req.query.sortOrder as string) || "desc";

    const orderBy = (ALLOWED_SORT_BY.has(sortBy as any) ? sortBy : "created_at") as
      | "id"
      | "name"
      | "created_at"
      | "designation";
    const ascending = (ALLOWED_SORT_ORDER.has(sortOrder as any) ? sortOrder : "desc") === "asc";

    // Updated columns to include new fields
    const columns = "id, name, description, cover_url, national, designation, short_name, created_at";
    const base = supabase.from("authors").select(columns);

    let q = base;

    if (search) {
      q = q.or(`name.ilike.%${search}%,description.ilike.%${search}%,designation.ilike.%${search}%`);
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
    } else if (national === "jainmonk") {
      q = q.eq("national", "jainmonk");
    } else if (national === "jainnun") {
      q = q.eq("national", "jainnun");
    } else if (national === "null") {
      q = q.is("national", null);
    }

    // New designation filter
    if (designation) {
      q = q.ilike("designation", `%${designation}%`);
    }

    q = q.order(orderBy, { ascending });

    const CHUNK = 1000;
    let offset = 0;
    const rows: any[] = [];

    while (true) {
      const { data, error } = await q.range(offset, offset + CHUNK - 1);
      if (error) throw error;

      const batch = data || [];
      rows.push(...batch);

      if (batch.length < CHUNK) break;
      offset += CHUNK;
    }

    const csv = Papa.unparse(
      rows.length
        ? rows
        : [
            {
              id: "",
              name: "",
              description: "",
              cover_url: "",
              national: "",
              designation: "", // New field
              short_name: "", // New field
              created_at: "",
            },
          ],
      {
        header: true,
        columns: ["id", "name", "description", "cover_url", "national", "designation", "short_name", "created_at"], // Updated columns
      },
    );

    const date = new Date().toISOString().split("T")[0];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="authors-export-${date}.csv"`);
    return res.status(200).send(csv);
  } catch (error) {
    console.error("Export error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
