#!/usr/bin/env node

import dotenv from "dotenv";
import * as ocrPipeline from "../lib/ocrPipeline.js";

dotenv.config();

function readRecordId() {
  const flag = process.argv.find((arg) => arg.startsWith("--id="));
  const positional = process.argv.find((arg) => /^\d+$/.test(arg));
  const value = flag ? flag.split("=")[1] : positional;
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const runOcrForRecord =
  ocrPipeline.runOcrForRecord || (ocrPipeline.default && ocrPipeline.default.runOcrForRecord);

if (!runOcrForRecord) {
  console.error("Could not load runOcrForRecord from lib/ocrPipeline.js");
  process.exit(1);
}

const recordId = readRecordId();
const deleteOld = process.argv.includes("--delete-old");
const keepExtractedText = process.argv.includes("--keep-text");

if (!recordId) {
  console.error("Usage: node scripts/ocr-ilovepdf.mjs --id=<record-id> [--delete-old] [--keep-text]");
  process.exit(1);
}

const logger = {
  info: (...args) => console.log("[ocr]", ...args),
  error: (...args) => console.error("[ocr]", ...args),
  warn: (...args) => console.warn("[ocr]", ...args),
};

runOcrForRecord({
  recordId,
  deleteOldAsset: deleteOld,
  resetExtractedText: !keepExtractedText,
  logger,
})
  .then((result) => {
    console.log("\nOCR complete:");
    console.log(`- Record ID: ${result.recordId}`);
    console.log(`- Source URL: ${result.source_url}`);
    console.log(`- UploadThing key: ${result.pdf_public_id}`);
    console.log(`- Viewer URL: ${result.pdf_url}`);
    if (result.extracted_text) {
      console.log(`- Extracted text stored (${result.extracted_text.length} chars)`);
    } else if (result.text_extraction_error) {
      console.log(`- Text extraction failed: ${result.text_extraction_error}`);
    } else {
      console.log("- Text extraction produced no content.");
    }
  })
  .catch((error) => {
    console.error("Failed to OCR record:", error?.message || error);
    process.exit(1);
  });
