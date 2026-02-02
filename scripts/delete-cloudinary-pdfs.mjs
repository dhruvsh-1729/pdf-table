#!/usr/bin/env node
/**
 * Delete all PDF files from Cloudinary.
 *
 * Usage:
 *   node --env-file=.env scripts/delete-cloudinary-pdfs.mjs --dry-run
 *   node --env-file=.env scripts/delete-cloudinary-pdfs.mjs --confirm
 *
 * Options:
 *   --resource-type=raw|image|both   Default: both
 *   --prefix=folder/path             Only delete PDFs under this prefix
 *   --max=NN                         Max PDFs to delete (default: Infinity)
 *   --concurrency=NN                 Delete batch concurrency (default: 5)
 */

import dotenv from "dotenv";
import { v2 as cloudinary } from "cloudinary";

dotenv.config();

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
  console.error(
    "Missing Cloudinary credentials. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in .env.",
  );
  process.exit(1);
}

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
  secure: true,
});

const argv = process.argv.slice(2);

function getFlag(name, fallback = null) {
  const raw = argv.find((arg) => arg.startsWith(`--${name}=`));
  if (!raw) return fallback;
  return raw.split("=").slice(1).join("=");
}

function numberFlag(name, fallback) {
  const raw = getFlag(name, null);
  if (raw === null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

const CONFIRM = argv.includes("--confirm");
const DRY_RUN = !CONFIRM || argv.includes("--dry-run");
const RESOURCE_TYPE_FLAG = (getFlag("resource-type", "both") || "both").toLowerCase();
const PREFIX = getFlag("prefix", null);
const MAX_TO_DELETE = numberFlag("max", Infinity);
const CONCURRENCY = Math.max(1, numberFlag("concurrency", 5));

let resourceTypes;
if (RESOURCE_TYPE_FLAG === "both") {
  resourceTypes = ["raw", "image"];
} else if (RESOURCE_TYPE_FLAG === "raw" || RESOURCE_TYPE_FLAG === "image") {
  resourceTypes = [RESOURCE_TYPE_FLAG];
} else {
  console.error("Invalid --resource-type. Use raw, image, or both.");
  process.exit(1);
}

if (DRY_RUN) {
  console.log("Running in dry-run mode (no deletions). Use --confirm to delete.");
}

function isPdfResource(resource) {
  const format = String(resource?.format || "").toLowerCase();
  if (format === "pdf") return true;
  const urls = `${resource?.url || ""} ${resource?.secure_url || ""}`.toLowerCase();
  if (urls.includes(".pdf")) return true;
  const original = String(resource?.original_filename || "").toLowerCase();
  if (original.endsWith(".pdf")) return true;
  return false;
}

async function listPdfResources(resourceType, limit) {
  const out = [];
  let nextCursor = undefined;

  while (out.length < limit) {
    const options = {
      resource_type: resourceType,
      type: "upload",
      max_results: 500,
    };
    if (nextCursor) options.next_cursor = nextCursor;
    if (PREFIX) options.prefix = PREFIX;

    const res = await cloudinary.api.resources(options);
    const resources = Array.isArray(res?.resources) ? res.resources : [];
    for (const r of resources) {
      if (isPdfResource(r)) {
        out.push(r);
        if (out.length >= limit) break;
      }
    }
    nextCursor = res?.next_cursor;
    if (!nextCursor) break;
  }

  return out;
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let index = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index++;
      try {
        results[current] = await fn(items[current], current);
      } catch (err) {
        results[current] = { error: err };
      }
    }
  });

  await Promise.all(workers);
  return results;
}

async function deleteBatches(resourceType, batches) {
  let deletedCount = 0;
  let notFoundCount = 0;
  let errorCount = 0;

  const results = await mapWithConcurrency(batches, CONCURRENCY, async (batch, idx) => {
    if (DRY_RUN) {
      console.log(`[dry-run] ${resourceType}: would delete batch ${idx + 1}/${batches.length} (${batch.length})`);
      return { deleted: batch.length, notFound: 0 };
    }

    const res = await cloudinary.api.delete_resources(batch, {
      resource_type: resourceType,
      type: "upload",
    });

    const statuses = res?.deleted || {};
    let batchDeleted = 0;
    let batchNotFound = 0;
    let batchError = 0;
    for (const value of Object.values(statuses)) {
      if (value === "deleted") batchDeleted += 1;
      else if (value === "not_found") batchNotFound += 1;
      else batchError += 1;
    }
    return { deleted: batchDeleted, notFound: batchNotFound, error: batchError };
  });

  for (const result of results) {
    if (result?.error) {
      errorCount += 1;
      continue;
    }
    deletedCount += result?.deleted || 0;
    notFoundCount += result?.notFound || 0;
    errorCount += result?.error || 0;
  }

  return { deletedCount, notFoundCount, errorCount };
}

async function main() {
  let remaining = MAX_TO_DELETE;
  let totalFound = 0;
  let totalDeleted = 0;
  let totalNotFound = 0;
  let totalErrors = 0;

  for (const resourceType of resourceTypes) {
    if (remaining <= 0) break;
    console.log(`\nListing PDFs in Cloudinary (resource_type=${resourceType})...`);
    const resources = await listPdfResources(resourceType, remaining);
    totalFound += resources.length;
    remaining -= resources.length;

    if (!resources.length) {
      console.log(`No PDFs found for resource_type=${resourceType}.`);
      continue;
    }

    console.log(`Found ${resources.length} PDFs for resource_type=${resourceType}.`);
    const publicIds = resources.map((r) => r.public_id).filter(Boolean);
    const batches = chunk(publicIds, 100);

    const { deletedCount, notFoundCount, errorCount } = await deleteBatches(resourceType, batches);
    totalDeleted += deletedCount;
    totalNotFound += notFoundCount;
    totalErrors += errorCount;
  }

  console.log("\nDeletion summary:");
  console.log(`- found:      ${totalFound}`);
  console.log(`- deleted:    ${totalDeleted}`);
  console.log(`- not_found:  ${totalNotFound}`);
  console.log(`- errors:     ${totalErrors}`);
  if (DRY_RUN) {
    console.log("(dry run only; no deletions were made)");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err?.message || err);
  process.exit(1);
});
