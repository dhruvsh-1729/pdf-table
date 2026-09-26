import { NextApiRequest, NextApiResponse } from "next";
import Papa from "papaparse";
import formidable from "formidable";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { cleanEntityName, findByEntityName } from "@/lib/entityNames";

// Disable body parser for file upload
export const config = {
  api: {
    bodyParser: false,
  },
};

interface AuthorData {
  id?: string;
  name: string;
  description?: string;
  cover_url?: string;
  national?: string;
  created_at?: string;
}

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Parse the uploaded file
    const form = formidable({
      maxFileSize: 10 * 1024 * 1024, // 10MB limit
    });

    const [fields, files] = await form.parse(req);
    const file = Array.isArray(files.file) ? files.file[0] : files.file;

    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Check file type
    if (!file.originalFilename?.endsWith(".csv")) {
      return res.status(400).json({ error: "Only CSV files are allowed" });
    }

    // Read file content
    const fileContent = fs.readFileSync(file.filepath, "utf8");

    // Parse CSV
    const parseResult = Papa.parse(fileContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.toLowerCase().trim(),
    });

    if (parseResult.errors.length > 0) {
      console.error("CSV parse errors:", parseResult.errors);
      return res.status(400).json({
        error: "CSV parsing failed",
        details: parseResult.errors.map((e) => e.message),
      });
    }

    const csvData = parseResult.data as AuthorData[];

    if (csvData.length === 0) {
      return res.status(400).json({ error: "CSV file is empty" });
    }

    // Validate required fields
    const invalidRows: number[] = [];
    csvData.forEach((row, index) => {
      if (!row.name || row.name.trim() === "") {
        invalidRows.push(index + 1);
      }
    });

    if (invalidRows.length > 0) {
      return res.status(400).json({
        error: "Invalid data found",
        details: `Rows with missing name field: ${invalidRows.join(", ")}`,
      });
    }

    // Insert new authors; update the profile of ones that already exist
    // (matched case-insensitively, like the authors_name_key_unique index).
    let created = 0;
    let updated = 0;
    const failures: string[] = [];
    for (const row of csvData) {
      const name = cleanEntityName(row.name);
      const fields = {
        description: row.description || null,
        cover_url: row.cover_url || null,
        national: row.national || null,
      };
      try {
        const existing = await findByEntityName(supabase, "authors", name);
        if (existing) {
          const { error } = await supabase.from("authors").update(fields).eq("id", existing.id);
          if (error) throw error;
          updated += 1;
        } else {
          const { error } = await supabase.from("authors").insert([{ name, ...fields }]);
          if (error) throw error;
          created += 1;
        }
      } catch (rowError: any) {
        failures.push(`${name}: ${rowError?.message || rowError}`);
      }
    }

    if (failures.length > 0 && created + updated === 0) {
      return res.status(500).json({ error: "Failed to import authors", details: failures.slice(0, 20) });
    }

    // Clean up temporary file
    try {
      fs.unlinkSync(file.filepath);
    } catch (cleanupError) {
      console.warn("Failed to cleanup temp file:", cleanupError);
    }

    return res.status(200).json({
      success: true,
      message: `Processed ${csvData.length} authors: ${created} created, ${updated} updated, ${failures.length} failed`,
      imported: created + updated,
      created,
      updated,
      failures: failures.slice(0, 20),
    });
  } catch (error) {
    console.error("Import error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
