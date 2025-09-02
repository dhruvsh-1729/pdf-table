import { NextApiRequest, NextApiResponse } from "next";
import Papa from "papaparse";
import formidable from "formidable";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

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

    // Prepare data for upsert (insert or update based on name uniqueness)
    const authorsToUpsert = csvData.map((row) => ({
      // Don't include id in upsert to let database generate it for new records
      name: row.name.trim(),
      description: row.description || null,
      cover_url: row.cover_url || null,
      national: row.national || null,
      // Don't include created_at, let database handle it
    }));

    // Use upsert to handle duplicates based on name constraint
    const { data: upsertedAuthors, error: upsertError } = await supabase
      .from("authors")
      .upsert(authorsToUpsert, {
        onConflict: "name",
        ignoreDuplicates: false,
      })
      .select();

    if (upsertError) {
      console.error("Database upsert error:", upsertError);
      return res.status(500).json({
        error: "Failed to import authors",
        details: upsertError.message,
      });
    }

    // Clean up temporary file
    try {
      fs.unlinkSync(file.filepath);
    } catch (cleanupError) {
      console.warn("Failed to cleanup temp file:", cleanupError);
    }

    return res.status(200).json({
      success: true,
      message: `Successfully processed ${csvData.length} authors`,
      imported: upsertedAuthors?.length || 0,
    });
  } catch (error) {
    console.error("Import error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
