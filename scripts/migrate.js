#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");
const { createClient } = require("@supabase/supabase-js");
const { v2: cloudinary } = require("cloudinary");
const dotenv = require("dotenv");
dotenv.config();

/* ======================= CONFIG ======================= */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || "pdfs";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing Supabase env vars.");
if (!process.env.CLOUDINARY_CLOUD_NAME) throw new Error("Missing Cloudinary env vars.");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

/* ======================= HELPERS ======================= */
function buildBaseId(title) {
  const base = String(title || "untitled")
    .toLowerCase()
    .replace(/[^a-z0-9\-_.]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${base}-${Date.now()}`;
}

function buildViewerUrl(publicIdWithExt, version) {
  const params = new URLSearchParams({ id: publicIdWithExt });
  if (version) params.set("v", String(version));
  return `/api/pdf/view?${params.toString()}`;
}

async function uploadToCloudinary(buffer, baseId, ext = ".pdf") {
  const public_id = `${CLOUDINARY_FOLDER}/${baseId}${ext}`;
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw",
        public_id,
        overwrite: false,
        access_mode: "public",
      },
      (err, res) => (err || !res ? reject(err) : resolve(res)),
    );
    stream.end(buffer);
  });
}

/* ======================= MAIN SCRIPT ======================= */
async function migrate() {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : Infinity;

  const csvPath = path.join(process.cwd(), "records_rows.csv");
  const rows = parse(fs.readFileSync(csvPath), { columns: true, skip_empty_lines: true });
  const candidates = rows.filter((r) => r.pdf_url?.includes("supabase"));
  const toProcess = candidates.slice(0, limit);

  console.log(`Loaded ${rows.length} total rows.`);
  console.log(`Found ${candidates.length} Supabase PDFs.`);
  console.log(`Processing ${toProcess.length} (limit = ${limit}).`);

  for (const [i, row] of toProcess.entries()) {
    try {
      const pdfUrl = row.pdf_url?.trim();
      console.log(`\n[${i + 1}] ${row.name || row.title_name}`);
      console.log(`→ Downloading from: ${pdfUrl}`);

      const response = await fetch(pdfUrl);
      if (!response.ok) throw new Error(`Failed to fetch: ${pdfUrl}`);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const baseId = buildBaseId(row.title_name || row.name);
      console.log(`→ Uploading to Cloudinary...`);
      const uploaded = await uploadToCloudinary(buffer, baseId, ".pdf");

      const newPdfPublicId = uploaded.public_id;
      const newPdfUrl = buildViewerUrl(newPdfPublicId, uploaded.version);

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
      console.error(`❌ Error on record ${i + 1}:`, err.message);
    }
  }

  console.log("\n✅ Migration finished.");
}

/* ======================= RUN ======================= */
migrate().catch((err) => console.error("Fatal error:", err));
