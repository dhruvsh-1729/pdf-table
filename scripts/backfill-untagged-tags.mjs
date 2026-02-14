#!/usr/bin/env node

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { SarvamAIClient } from "sarvamai";
import { getUploadThingUrl } from "../lib/uploadthing.js";

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SARVAM_API_KEY = process.env.SARVAM_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!SARVAM_API_KEY || !SARVAM_API_KEY.trim()) {
  console.error("Missing SARVAM_API_KEY.");
  process.exit(1);
}

if (!process.env.UPLOADTHING_TOKEN) {
  console.warn("UPLOADTHING_TOKEN missing; script will only use existing absolute/relative pdf_url values.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const sarvamClient = new SarvamAIClient({ apiSubscriptionKey: SARVAM_API_KEY.trim() });

function numberFlag(name, fallback) {
  const arg = process.argv.find((entry) => entry.startsWith(`--${name}=`));
  if (!arg) return fallback;
  const value = Number(arg.split("=")[1]);
  return Number.isFinite(value) ? value : fallback;
}

const START_ID = Math.max(0, Math.floor(numberFlag("start-id", 0)));
const parsedLimit = numberFlag("limit", Infinity);
const LIMIT = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : Infinity;
const parsedPageSize = numberFlag("page-size", 200);
const PAGE_SIZE = Math.min(1000, Math.max(50, Math.floor(parsedPageSize)));
const parsedConcurrency = numberFlag("concurrency", 2);
const CONCURRENCY = Math.max(1, Math.min(32, Math.floor(parsedConcurrency)));
const DRY_RUN = process.argv.includes("--dry-run");
const VERBOSE = process.argv.includes("--verbose");

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

function hasUsableText(value) {
  if (isBlank(value)) return false;
  const normalized = String(value).replace(/\s+/g, "");
  if (!/[\p{L}\p{N}]/u.test(normalized)) return false;
  return normalized.length >= 24;
}

function getBaseSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ||
    `http://localhost:${process.env.PORT || 3000}`
  );
}

function toAbsoluteUrl(possiblyRelative) {
  if (!possiblyRelative) return possiblyRelative;
  if (/^https?:\/\//i.test(possiblyRelative)) return possiblyRelative;
  try {
    return new URL(possiblyRelative, getBaseSiteUrl()).toString();
  } catch {
    return possiblyRelative;
  }
}

async function resolvePdfUrl(record) {
  if (record?.pdf_url) return toAbsoluteUrl(record.pdf_url);
  if (record?.pdf_public_id && process.env.UPLOADTHING_TOKEN) {
    return await getUploadThingUrl(record.pdf_public_id);
  }
  return null;
}

async function withRetry(task, attempts, label) {
  let lastError = null;
  const maxAttempts = Math.max(1, attempts);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts) break;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[retry] ${label} failed (attempt ${attempt}/${maxAttempts}): ${message}`);
      const backoffMs = Math.min(5000, 400 * attempt);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  throw lastError || new Error(`${label} failed`);
}

async function downloadPdfBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Failed to fetch PDF (${response.status}): ${body || url}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

const PDFJS_CANDIDATES = [
  "pdfjs-dist/legacy/build/pdf.js",
  "pdfjs-dist/legacy/build/pdf.mjs",
  "pdfjs-dist/legacy/build/pdf",
  "pdfjs-dist/build/pdf.js",
  "pdfjs-dist/build/pdf.mjs",
  "pdfjs-dist/build/pdf",
];

async function importPdfJs() {
  try {
    const module = await import("pdfjs-dist/legacy/build/pdf.js");
    const pdfjs = module?.default || module;
    if (pdfjs?.getDocument || pdfjs?.default?.getDocument) return pdfjs;
  } catch {
    // continue through candidates
  }

  for (const candidate of PDFJS_CANDIDATES) {
    try {
      const module = await import(candidate);
      const pdfjs = module?.default || module;
      if (pdfjs?.getDocument || pdfjs?.default?.getDocument) return pdfjs;
    } catch {
      // continue
    }
  }

  try {
    const moduleNs = await import("node:module").catch(() => import("module"));
    const createRequire = moduleNs?.createRequire || moduleNs?.default?.createRequire;
    if (typeof createRequire === "function") {
      const req = createRequire(import.meta.url);
      for (const candidate of PDFJS_CANDIDATES) {
        try {
          const module = req(candidate);
          const pdfjs = module?.default || module;
          if (pdfjs?.getDocument || pdfjs?.default?.getDocument) return pdfjs;
        } catch {
          // continue
        }
      }
    }
  } catch {
    // continue
  }

  return null;
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
      // best-effort polyfill
    }
  }

  const pdfjs = await importPdfJs();
  const getDocument = pdfjs?.getDocument || pdfjs?.default?.getDocument;
  if (!getDocument) {
    throw new Error("PDF parser is not available in this environment.");
  }
  return getDocument;
}

async function extractTextFromPdf(pdfBytes) {
  const getDocument = await loadPdfGetDocument();
  const previousWarn = console.warn;
  console.warn = (...args) => {
    const joined = args.map((part) => String(part ?? "")).join(" ");
    if (joined.includes("fetchStandardFontData") || joined.includes("standardFontDataUrl")) return;
    previousWarn(...args);
  };

  try {
    const loadingTask = getDocument({ data: pdfBytes, disableWorker: true, verbosity: 0 });
    const pdf = await loadingTask.promise;
    await new Promise((resolve) => setTimeout(resolve, 1000));

    let fullText = "";
    for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
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
    return hasUsableText(cleaned) ? cleaned : null;
  } finally {
    console.warn = previousWarn;
  }
}

function trimContext(text, maxChars = 6000) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, maxChars);
}

function buildTagMessages(text, title, name) {
  const baseInstruction =
    "You are an expert editor for academic PDF content. Use only the provided extracted text. Do not make up facts, add disclaimers, or include pre/post text. Keep output concise and accurate.";

  const label = title || name || "the article";
  return [
    { role: "system", content: baseInstruction },
    {
      role: "user",
      content: `Generate exactly 5 tags that best capture the essence of ${label}. Each tag must be exactly 3 words, Title Case, and directly relevant to the PDF content only. Use only proper English letters (A-Z, a-z) and spaces - absolutely no special characters, symbols, asterisks, dashes, dots, or any punctuation marks in the tags. Avoid generic words (article, pdf, document). Return exactly 5 tags, one per line, with no additional text, explanations, or formatting.\n\nExtracted text:\n${text}`,
    },
  ];
}

function normalizeTag(raw) {
  const stripped = String(raw || "")
    .replace(/^[-•\d.)\s]+/, "")
    .replace(/[^A-Za-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return null;

  const words = stripped.split(" ").filter(Boolean).slice(0, 3);
  if (words.length === 0) return null;

  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" ");
}

function parseTags(content) {
  const rawTags = String(content || "")
    .split(/[\n,;]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);

  const tags = [];
  const seen = new Set();

  for (const raw of rawTags) {
    const normalized = normalizeTag(raw);
    if (!normalized) continue;

    const words = normalized.split(/\s+/).filter(Boolean);
    if (words.length < 1 || words.length > 3) continue;

    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(normalized);
    if (tags.length >= 8) break;
  }

  return tags;
}

async function generateTagsFromText(text, title, name) {
  const messages = buildTagMessages(trimContext(text, 6000), title, name);
  const response = await withRetry(
    () =>
      sarvamClient.chat.completions({
        messages,
        temperature: 0.1,
        top_p: 0.9,
        max_tokens: 96,
        n: 1,
      }),
    3,
    "Sarvam tag generation",
  );

  const content = response.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("AI returned empty tag response.");

  const tags = parseTags(content);
  if (tags.length === 0) {
    throw new Error("AI response did not produce usable tags.");
  }
  return tags;
}

function isDuplicateError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("duplicate") || message.includes("unique") || message.includes("already exists");
}

const tagCache = new Map();

function getCachedTag(cacheKey, resolver) {
  if (tagCache.has(cacheKey)) return tagCache.get(cacheKey);

  const pending = Promise.resolve()
    .then(resolver)
    .catch((error) => {
      tagCache.delete(cacheKey);
      throw error;
    });

  tagCache.set(cacheKey, pending);
  return pending;
}

async function findTagByName(name) {
  const { data, error } = await supabase.from("tags").select("id,name").ilike("name", name).order("id").limit(1);
  if (error) throw new Error(error.message);
  return data?.[0] || null;
}

async function getOrCreateTag(name, dryRun = false) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return { tag: null, created: false };

  const cacheKey = trimmed.toLowerCase();
  return getCachedTag(cacheKey, async () => {
    const found = await findTagByName(trimmed);
    if (found) return { tag: found, created: false };

    if (dryRun) return { tag: { id: null, name: trimmed }, created: true };

    const { data: createdTag, error: createError } = await supabase
      .from("tags")
      .insert({ name: trimmed })
      .select("id,name")
      .single();

    if (!createError) return { tag: createdTag, created: true };

    if (isDuplicateError(createError)) {
      const raceWinner = await findTagByName(trimmed);
      if (raceWinner) return { tag: raceWinner, created: false };
    }

    throw new Error(createError.message);
  });
}

function uniqCaseInsensitive(values) {
  const out = [];
  const seen = new Set();
  for (const value of values || []) {
    const normalized = String(value || "").trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

async function attachTags(recordId, tagNames, dryRun = false) {
  const tags = uniqCaseInsensitive(tagNames).slice(0, 10);
  let createdTags = 0;
  let linkedTags = 0;

  for (const name of tags) {
    const { tag, created } = await getOrCreateTag(name, dryRun);
    if (!tag) continue;
    if (created) createdTags += 1;

    if (dryRun) {
      linkedTags += 1;
      continue;
    }

    const { error } = await supabase.from("record_tags").insert({ record_id: recordId, tag_id: tag.id });
    if (error) {
      if (isDuplicateError(error)) continue;
      throw new Error(error.message);
    }
    linkedTags += 1;
  }

  return { createdTags, linkedTags };
}

async function fetchRecordsPage(from, pageSize, startId) {
  const { data, error } = await supabase
    .from("records")
    .select("id,name,title_name,pdf_url,pdf_public_id,extracted_text,language")
    .gte("id", startId)
    .order("id", { ascending: true })
    .range(from, from + pageSize - 1);

  if (error) throw new Error(error.message);
  return data || [];
}

async function fetchTaggedRecordIds(recordIds) {
  if (!recordIds.length) return new Set();

  const tagged = new Set();
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("record_tags")
      .select("record_id")
      .in("record_id", recordIds)
      .order("record_id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    for (const row of data) {
      tagged.add(Number(row.record_id));
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return tagged;
}

async function collectUntaggedRecords() {
  let from = 0;
  let scanned = 0;
  const untagged = [];

  while (true) {
    const page = await fetchRecordsPage(from, PAGE_SIZE, START_ID);
    if (!page.length) break;

    const ids = page.map((record) => Number(record.id));
    const taggedIds = await fetchTaggedRecordIds(ids);
    const pageUntagged = page.filter((record) => !taggedIds.has(Number(record.id)));

    scanned += page.length;
    untagged.push(...pageUntagged);

    const maxId = page[page.length - 1]?.id;
    console.log(`[collect] scanned=${scanned} untagged=${untagged.length} last_id=${maxId}`);

    if (Number.isFinite(LIMIT) && untagged.length >= LIMIT) {
      break;
    }
    if (page.length < PAGE_SIZE) break;

    from += page.length;
  }

  const finalList = Number.isFinite(LIMIT) ? untagged.slice(0, LIMIT) : untagged;
  return { records: finalList, scanned };
}

async function ensureExtractedText(record, dryRun = false) {
  if (hasUsableText(record.extracted_text)) {
    return { text: String(record.extracted_text).trim(), source: "existing" };
  }

  const pdfUrl = await resolvePdfUrl(record);
  if (!pdfUrl) {
    return { text: null, source: "missing_pdf" };
  }

  const pdfBytes = await withRetry(() => downloadPdfBuffer(pdfUrl), 2, `Download PDF for record ${record.id}`);
  const extractedText = await extractTextFromPdf(pdfBytes);
  if (!extractedText) {
    return { text: null, source: "empty_after_extraction" };
  }

  if (!dryRun) {
    const { error } = await supabase.from("records").update({ extracted_text: extractedText }).eq("id", record.id);
    if (error) throw new Error(error.message);
  }

  return { text: extractedText, source: "fresh_extraction" };
}

function createLimiter(maxConcurrent) {
  let active = 0;
  const queue = [];

  function runNext() {
    if (active >= maxConcurrent) return;
    const next = queue.shift();
    if (!next) return;

    active += 1;
    Promise.resolve()
      .then(next.task)
      .then(next.resolve, next.reject)
      .finally(() => {
        active -= 1;
        runNext();
      });
  }

  return (task) =>
    new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      runNext();
    });
}

async function runWithConcurrency(items, maxConcurrent, worker) {
  const input = Array.isArray(items) ? items : [];
  if (!input.length) return [];

  const results = new Array(input.length);
  let cursor = 0;

  async function workerLoop() {
    while (true) {
      const idx = cursor;
      cursor += 1;
      if (idx >= input.length) return;
      results[idx] = await worker(input[idx], idx);
    }
  }

  const poolSize = Math.min(input.length, Math.max(1, maxConcurrent));
  await Promise.all(Array.from({ length: poolSize }, () => workerLoop()));
  return results;
}

const runTagLinkTask = createLimiter(8);

async function processRecord(record) {
  const label = record.title_name || record.name || `record-${record.id}`;
  const extraction = await ensureExtractedText(record, DRY_RUN);
  if (!extraction.text) {
    return { status: "no_text", source: extraction.source, tags: [], linkedTags: 0, createdTags: 0, label };
  }

  const tags = await generateTagsFromText(extraction.text, record.title_name, record.name);
  const { linkedTags, createdTags } = await runTagLinkTask(() => attachTags(record.id, tags, DRY_RUN));
  return { status: "updated", source: extraction.source, tags, linkedTags, createdTags, label };
}

async function main() {
  console.log(
    `Backfill untagged records starting... startId=${START_ID} limit=${Number.isFinite(LIMIT) ? LIMIT : "none"} pageSize=${PAGE_SIZE} concurrency=${CONCURRENCY} dryRun=${DRY_RUN}`,
  );

  const { records, scanned } = await collectUntaggedRecords();
  if (!records.length) {
    console.log(`No untagged records found. Scanned=${scanned}`);
    return;
  }

  console.log(`Found ${records.length} untagged records. Starting extraction + tag generation...`);

  const stats = {
    processed: 0,
    updated: 0,
    failed: 0,
    noText: 0,
    extractedNow: 0,
    reusedText: 0,
    linkedTags: 0,
    createdTags: 0,
  };

  await runWithConcurrency(records, CONCURRENCY, async (record, idx) => {
    try {
      const result = await processRecord(record);
      stats.processed += 1;

      if (result.status === "updated") {
        stats.updated += 1;
        stats.linkedTags += result.linkedTags;
        stats.createdTags += result.createdTags;
        if (result.source === "fresh_extraction") stats.extractedNow += 1;
        if (result.source === "existing") stats.reusedText += 1;
      } else {
        stats.noText += 1;
      }

      if (VERBOSE || result.status !== "updated") {
        const tagPreview = result.tags?.length ? ` tags=[${result.tags.join(" | ")}]` : "";
        console.log(
          `[${idx + 1}/${records.length}] record=${record.id} status=${result.status} source=${result.source}${tagPreview}`,
        );
      } else {
        console.log(
          `[${idx + 1}/${records.length}] record=${record.id} status=${result.status} linked=${result.linkedTags} created_tags=${result.createdTags}`,
        );
      }
    } catch (error) {
      stats.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.log(`[${idx + 1}/${records.length}] record=${record.id} status=error message=${message}`);
    }
  });

  console.log(
    `Done. scanned=${scanned} target_untagged=${records.length} processed=${stats.processed} updated=${stats.updated} failed=${stats.failed} no_text=${stats.noText} extracted_now=${stats.extractedNow} reused_text=${stats.reusedText} linked_tags=${stats.linkedTags} created_tags=${stats.createdTags} dryRun=${DRY_RUN}`,
  );
}

main().catch((error) => {
  console.error("Fatal:", error instanceof Error ? error.message : error);
  process.exit(1);
});
