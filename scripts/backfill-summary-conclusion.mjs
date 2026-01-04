#!/usr/bin/env node

/**
 * Fill summary + conclusion for records that have both empty/null, using extracted text.
 * Steps:
 *   1) For each record missing summary AND conclusion, ensure extracted_text is present
 *      (download PDF -> extract text with pdfjs).
 *   2) Generate summary + conclusion via Sarvam AI (same prompts as API).
 *   3) Update records table with extracted_text, summary, and conclusion.
 *
 * Usage:
 *   node --env-file=.env scripts/backfill-summary-conclusion.mjs [--start-id=0] [--limit=100] [--dry-run]
 */

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { v2 as cloudinary } from "cloudinary";
import { SarvamAIClient } from "sarvamai";

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SARVAM_API_KEY = process.env.SARVAM_API_KEY;
const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || "pdfs";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!SARVAM_API_KEY) {
  console.error("Missing SARVAM_API_KEY.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const sarvamClient = new SarvamAIClient({ apiSubscriptionKey: SARVAM_API_KEY.trim() });

const hasCloudinary =
  process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET;
if (hasCloudinary) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

function numberFlag(name, fallback) {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (!raw) return fallback;
  const n = Number(raw.split("=")[1]);
  return Number.isFinite(n) ? n : fallback;
}
const START_ID = numberFlag("start-id", 0);
const LIMIT = numberFlag("limit", Infinity);
const DRY_RUN = process.argv.includes("--dry-run");

function getBaseSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ||
    `http://localhost:${process.env.PORT || 3000}`
  );
}

function buildCloudinaryRawUrl(publicIdWithExt) {
  return cloudinary.url(publicIdWithExt, {
    resource_type: "raw",
    type: "upload",
    sign_url: true,
    secure: true,
  });
}

function resolvePdfUrl(record) {
  if (record?.pdf_public_id && hasCloudinary) return buildCloudinaryRawUrl(record.pdf_public_id);
  const pdfUrl = record?.pdf_url;
  if (!pdfUrl) return null;
  if (/^https?:\/\//i.test(pdfUrl)) return pdfUrl;
  try {
    return new URL(pdfUrl, getBaseSiteUrl()).toString();
  } catch {
    return pdfUrl;
  }
}

async function downloadPdfBuffer(url) {
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Failed to fetch PDF (${resp.status}): ${text || url}`);
  }
  return new Uint8Array(await resp.arrayBuffer());
}

async function loadPdfGetDocument() {
  const globalAny = globalThis;
  if (!globalAny.DOMMatrix || !globalAny.Path2D || !globalAny.ImageData) {
    try {
      const canvas = await import("@napi-rs/canvas");
      if (!globalAny.DOMMatrix && canvas.DOMMatrix) globalAny.DOMMatrix = canvas.DOMMatrix;
      if (!globalAny.Path2D && canvas.Path2D) globalAny.Path2D = canvas.Path2D;
      if (!globalAny.ImageData && canvas.ImageData) globalAny.ImageData = canvas.ImageData;
    } catch {
      // best effort
    }
  }
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const getDocument = pdfjs.getDocument || pdfjs.default?.getDocument;
  if (!getDocument) throw new Error("PDF parser unavailable.");
  return getDocument;
}

async function extractTextFromPdf(data) {
  const getDocument = await loadPdfGetDocument();
  const loadingTask = getDocument({ data, disableWorker: true });
  const pdf = await loadingTask.promise;
  await new Promise((resolve) => setTimeout(resolve, 1000));
  let fullText = "";

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex++) {
    const page = await pdf.getPage(pageIndex);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => {
        const str = typeof item.str === "string" ? item.str : "";
        return item.hasEOL ? `${str}\n` : `${str} `;
      })
      .join("")
      .replace(/[ \t]+\n/g, "\n")
      .trimEnd();
    fullText += pageText;
    if (pageIndex < pdf.numPages) fullText += "\n\n";
  }

  const cleaned = fullText.replace(/\u0000/g, "").trim();
  if (!cleaned) return null;
  const normalized = cleaned.replace(/\s+/g, "");
  const hasChars = /[\p{L}\p{N}]/u.test(normalized);
  if (!hasChars || normalized.length < 16) return null;
  return cleaned;
}

function trimContext(text, maxChars = 9000) {
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

function buildMessages(mode, text, title, name) {
  const baseInstruction =
    "You are an expert editor for academic PDF content. Use only the provided extracted text. Do not make up facts, add disclaimers, or include pre/post text. Keep output concise and accurate.";
  const label = title || name || "the article";
  if (mode === "summary") {
    return [
      { role: "system", content: baseInstruction },
      {
        role: "user",
        content: `Create a short accurate summary (~300 words) of all details mentioned in ${label}. Ensure no details are false, inaccurate, or hallucinated. After generating, review the summary against the PDF content to correct any mistakes, inaccuracies, or discrepancies. Use appropriate language for regular readers and research scholars - keep it sharp and concise without extra words. You may add relevant post-publication updates in brackets if applicable. Verify all information carefully before summarizing. Avoid bullet points and introductions like "Sure" or "Summary:".\n\nExtracted text:\n${text}`,
      },
    ];
  }
  return [
    { role: "system", content: baseInstruction },
    {
      role: "user",
      content: `Write a short, unique and distinctive conclusion (110-140 words) from ${label}. Focus on key implications, outcomes, and significance rather than repeating summary content. Ensure the conclusion is specific to this document's findings and contributions. Output only the conclusion paragraph.\n\nExtracted text:\n${text}`,
    },
  ];
}

async function generateText(mode, text, title, name) {
  const messages = buildMessages(mode, trimContext(text, mode === "summary" ? 9000 : 6000), title, name);
  const response = await sarvamClient.chat.completions({
    messages,
    temperature: mode === "summary" ? 0.25 : 0.25,
    top_p: 0.9,
    max_tokens: mode === "summary" ? 360 : 220,
    n: 1,
  });
  const content = response.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error(`AI returned empty ${mode}.`);
  return content;
}

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

async function fetchRecordsPage(from, pageSize) {
  const { data, error } = await supabase
    .from("records")
    .select("id, pdf_url, pdf_public_id, summary, conclusion, extracted_text, name, title_name")
    .order("id", { ascending: true })
    .range(from, from + pageSize - 1);
  if (error) throw error;
  return data || [];
}

async function processRecord(record) {
  const pdfUrl = resolvePdfUrl(record);
  if (!pdfUrl) {
    console.log(`${record.id}: NO_PDF`);
    return { status: "no_pdf" };
  }

  let extractedText = isBlank(record.extracted_text) ? null : record.extracted_text;

  if (!extractedText) {
    const pdfBuffer = await downloadPdfBuffer(pdfUrl);
    extractedText = await extractTextFromPdf(pdfBuffer);
    if (!extractedText) throw new Error("Extraction produced no text.");

    if (!DRY_RUN) {
      await supabase.from("records").update({ extracted_text: extractedText }).eq("id", record.id).throwOnError();
    }
  }

  const summary = await generateText("summary", extractedText, record.title_name, record.name);
  const conclusion = await generateText("conclusion", extractedText, record.title_name, record.name);

  if (!DRY_RUN) {
    await supabase
      .from("records")
      .update({ summary, conclusion, extracted_text: extractedText })
      .eq("id", record.id)
      .throwOnError();
  }

  console.log(`${record.id}: UPDATED (summary+conclusion)`);
  return { status: "updated" };
}

async function main() {
  console.log(
    `Backfill summary/conclusion starting... startId=${START_ID} limit=${Number.isFinite(LIMIT) ? LIMIT : "none"} dryRun=${DRY_RUN}`,
  );

  const pageSize = 100;
  let from = 0;
  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  let noPdf = 0;
  let failed = 0;

  while (true) {
    const page = await fetchRecordsPage(from, pageSize);
    if (!page.length) break;

    for (const record of page) {
      if (record.id < START_ID) continue;
      if (scanned >= LIMIT) break;
      scanned++;

      if (!isBlank(record.summary) || !isBlank(record.conclusion)) {
        skipped++;
        continue;
      }

      try {
        const res = await processRecord(record);
        if (res.status === "updated") updated++;
        else if (res.status === "no_pdf") noPdf++;
        else skipped++;
      } catch (err) {
        failed++;
        console.log(`${record.id}: ERROR ${err?.message || err}`);
      }
    }

    if (scanned >= LIMIT) break;
    from += pageSize;
  }

  console.log(
    `Done. Scanned=${scanned} Updated=${updated} Skipped=${skipped} NoPDF=${noPdf} Failed=${failed} (dryRun=${DRY_RUN})`,
  );
}

main().catch((err) => {
  console.error("Fatal:", err?.message || err);
  process.exit(1);
});
