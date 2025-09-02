import { NextApiRequest, NextApiResponse } from "next";
import Papa from "papaparse";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Fetch all authors from the database
    const { data: authors, error } = await supabase
      .from("authors")
      .select("id, name, description, cover_url, national, created_at")
      .order("id", { ascending: true });

    if (error) {
      console.error("Database error:", error);
      return res.status(500).json({ error: "Failed to fetch authors" });
    }

    if (!authors || authors.length === 0) {
      // Return empty CSV with headers
      const csvHeaders = "id,name,description,cover_url,national,created_at\n";
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="authors-export-${new Date().toISOString().split("T")[0]}.csv"`,
      );
      return res.status(200).send(csvHeaders);
    }

    // Convert to CSV format
    const csvData = Papa.unparse(authors, {
      header: true,
      columns: ["id", "name", "description", "cover_url", "national", "created_at"],
    });

    // Set response headers for CSV download
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="authors-export-${new Date().toISOString().split("T")[0]}.csv"`,
    );

    return res.status(200).send(csvData);
  } catch (error) {
    console.error("Export error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
