#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");
const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
dotenv.config();

/* ======================= CONFIG ======================= */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_BUCKET = "pdfs";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing Supabase env vars.");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/* ======================= MAIN SCRIPT ======================= */
async function removeOldFiles() {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : Infinity;

  const csvPath = path.join(process.cwd(), "records_rows.csv");
  const rows = parse(fs.readFileSync(csvPath), { columns: true, skip_empty_lines: true });
  const candidates = rows.filter((r) => r.pdf_url?.includes("supabase"));
  const toProcess = candidates.slice(0, limit);

  console.log(`Loaded ${rows.length} total rows.`);
  console.log(`Found ${candidates.length} Supabase PDFs to delete.`);
  console.log(`Processing ${toProcess.length} (limit = ${limit}).`);

  for (const [i, row] of toProcess.entries()) {
    try {
      const pdfUrl = row.pdf_url?.trim();
      const fileName = pdfUrl.split("/").pop();
      console.log(`\n[${i + 1}] Deleting ${fileName}...`);
      const { error: deleteError } = await supabase.storage.from(SUPABASE_BUCKET).remove([fileName]);
      if (deleteError) throw deleteError;
      console.log(`✅ Deleted ${fileName}`);
    } catch (err) {
      console.error(`❌ Error on record ${i + 1}:`, err.message);
    }
  }

  console.log("\n✅ Deletion finished.");
}

/* ======================= RUN ======================= */
removeOldFiles().catch((err) => console.error("Fatal error:", err));
