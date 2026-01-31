#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");
const { createClient } = require("@supabase/supabase-js");
const { UTApi, UTFile } = require("uploadthing/server");
const dotenv = require("dotenv");

dotenv.config();

/* ======================= CONFIG ======================= */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const UPLOADTHING_TOKEN = process.env.UPLOADTHING_TOKEN;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing Supabase env vars.");
if (!UPLOADTHING_TOKEN) throw new Error("Missing UPLOADTHING_TOKEN.");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const utapi = new UTApi({ apiKey: UPLOADTHING_TOKEN });

/* ======================= HELPERS ======================= */
function buildBaseId(title) {
  const base = String(title || "untitled")
    .toLowerCase()
    .replace(/[^a-z0-9\-_.]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${base}-${Date.now()}`;
}

async function uploadToUploadThing(buffer, filename) {
  const file = new UTFile([buffer], filename, { type: "application/pdf" });
  const result = await utapi.uploadFiles(file, { contentDisposition: "inline" });
  const item = Array.isArray(result) ? result[0] : result;
  if (!item) throw new Error("UploadThing returned an empty response.");
  if (item.error) throw new Error(item.error.message || item.error.code || "UploadThing upload failed.");
  if (!item.data) throw new Error("UploadThing returned no data.");
  return item.data;
}

/* ======================= MAIN SCRIPT ======================= */
async function migrate() {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : Infinity;

  const csvPath = path.join(process.cwd(), "records_rows.csv");
  const rows = parse(fs.readFileSync(csvPath), { columns: true, skip_empty_lines: true });
  const candidates = rows.filter((r) => r.pdf_url);
  const toProcess = candidates.slice(0, limit);

  console.log(`Loaded ${rows.length} total rows.`);
  console.log(`Found ${candidates.length} PDFs with a url.`);
  console.log(`Processing ${toProcess.length} (limit = ${limit}).`);

  for (const [i, row] of toProcess.entries()) {
    try {
      const pdfUrl = row.pdf_url?.trim();
      if (!pdfUrl) continue;

      console.log(`\n[${i + 1}] ${row.name || row.title_name}`);
      console.log(`→ Downloading from: ${pdfUrl}`);

      const response = await fetch(pdfUrl);
      if (!response.ok) throw new Error(`Failed to fetch: ${pdfUrl}`);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const baseId = buildBaseId(row.title_name || row.name);
      const filename = `${baseId}.pdf`;
      console.log(`→ Uploading to UploadThing...`);
      const uploaded = await uploadToUploadThing(buffer, filename);

      const newPdfPublicId = uploaded.key;
      const newPdfUrl = uploaded.ufsUrl || uploaded.url;

      console.log(`→ Updating Supabase record...`);
      const { error: updateError } = await supabase
        .from("records")
        .update({
          pdf_public_id: newPdfPublicId,
          pdf_url: newPdfUrl,
        })
        .eq("id", row.id);

      if (updateError) throw updateError;
      console.log(`✅ Migration complete for: ${row.name}`);
    } catch (err) {
      console.error(`❌ Error on record ${i + 1}:`, err.message || err);
    }
  }

  console.log("\n✅ Migration finished.");
}

/* ======================= RUN ======================= */
migrate().catch((err) => console.error("Fatal error:", err));
