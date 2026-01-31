#!/usr/bin/env node

/**
 * Migrate existing Cloudinary PDFs to UploadThing.
 *
 * Usage:
 *   node --env-file=.env scripts/migrate-cloudinary-to-uploadthing.mjs [--limit=100] [--start-id=0] [--dry-run] [--force]
 */

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { UTApi } from "uploadthing/server";

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const UPLOADTHING_TOKEN = process.env.UPLOADTHING_TOKEN;
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!UPLOADTHING_TOKEN) {
  console.error("Missing UPLOADTHING_TOKEN.");
  process.exit(1);
}
if (!CLOUDINARY_CLOUD_NAME) {
  console.error("Missing CLOUDINARY_CLOUD_NAME (used to fetch existing Cloudinary files).");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const utapi = new UTApi({ apiKey: UPLOADTHING_TOKEN });

function numberFlag(name, fallback) {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (!raw) return fallback;
  const n = Number(raw.split("=")[1]);
  return Number.isFinite(n) ? n : fallback;
}

const START_ID = numberFlag("start-id", 0);
const LIMIT = numberFlag("limit", Infinity);
const CONCURRENCY = numberFlag("concurrency", 5);
const DRY_RUN = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");

function buildCloudinaryRawUrl(publicIdWithExt) {
  const clean = String(publicIdWithExt || "").replace(/^\//, "");
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/raw/upload/${clean}`;
}

function sanitizeFilenameSegment(value) {
  const safe = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return safe || "record";
}

function buildFilename(record) {
  const baseLabel = record?.title_name || record?.name || `record-${record?.id || "file"}`;
  const base = sanitizeFilenameSegment(baseLabel);
  return `${base}.pdf`;
}

function isUploadThingUrl(url) {
  return /utfs\.io|ufs\.sh|uploadthing\.com/i.test(url || "");
}

async function fetchRecordsPage(from, pageSize) {
  const { data, error } = await supabase
    .from("records")
    .select("id, pdf_url, pdf_public_id, name, title_name")
    .order("id", { ascending: true })
    .range(from, from + pageSize - 1);
  if (error) throw error;
  return data || [];
}

async function uploadFromCloudinary(record) {
  if (!record?.pdf_public_id) throw new Error("Missing pdf_public_id");
  const cloudUrl = buildCloudinaryRawUrl(record.pdf_public_id);
  const filename = buildFilename(record);

  const result = await utapi.uploadFilesFromUrl({ url: cloudUrl, name: filename }, { contentDisposition: "inline" });
  const item = Array.isArray(result) ? result[0] : result;
  if (!item) throw new Error("UploadThing returned an empty response.");
  if (item.error) throw new Error(item.error.message || item.error.code || "UploadThing upload failed.");
  if (!item.data) throw new Error("UploadThing returned no data.");
  return item.data;
}

async function migrateRecord(record, index) {
  try {
    console.log(`\n[${index}] Migrating record ${record.id}`);
    const uploaded = await uploadFromCloudinary(record);

    if (!DRY_RUN) {
      const { error: updateError } = await supabase
        .from("records")
        .update({
          pdf_public_id: uploaded.key,
          pdf_url: uploaded.ufsUrl || uploaded.url,
        })
        .eq("id", record.id);

      if (updateError) throw updateError;
    }

    console.log(`✅ Migrated record ${record.id}`);
    return { success: true, record };
  } catch (err) {
    console.error(`❌ Failed record ${record.id}:`, err?.message || err);
    return { success: false, record, error: err };
  }
}

async function processBatch(records, startIndex) {
  const promises = records.map((record, idx) => migrateRecord(record, startIndex + idx));
  return await Promise.all(promises);
}

async function main() {
  let processed = 0;
  let skipped = 0;
  let failed = 0;
  let from = 0;
  const pageSize = 500;

  while (true) {
    const records = await fetchRecordsPage(from, pageSize);
    if (!records.length) break;

    const toMigrate = [];
    for (const record of records) {
      if (record.id < START_ID) continue;
      if (processed + toMigrate.length >= LIMIT) break;

      const alreadyUploadThing = isUploadThingUrl(record.pdf_url);
      if (!FORCE && alreadyUploadThing) {
        skipped++;
        continue;
      }
      if (!record.pdf_public_id) {
        skipped++;
        continue;
      }

      toMigrate.push(record);
    }

    // Process in batches with concurrency limit
    for (let i = 0; i < toMigrate.length; i += CONCURRENCY) {
      const batch = toMigrate.slice(i, i + CONCURRENCY);
      const results = await processBatch(batch, processed + 1);
      
      for (const result of results) {
        if (result.success) {
          processed++;
        } else {
          failed++;
        }
      }

      if (processed >= LIMIT) break;
    }

    if (processed >= LIMIT) break;
    if (records.length < pageSize) break;
    from += pageSize;
  }

  console.log("\nMigration summary:");
  console.log(`- processed: ${processed}`);
  console.log(`- skipped:   ${skipped}`);
  console.log(`- failed:    ${failed}`);
  if (DRY_RUN) {
    console.log("(dry run only; no database updates were made)");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err?.message || err);
  process.exit(1);
});
