import { createClient } from "@supabase/supabase-js";
import path from "path";
import {
  deleteUploadThingFile,
  ensureUploadThingToken,
  getUploadThingUrl,
  uploadPdfBuffer,
} from "./uploadthing.js";

// NOTE: Do NOT capture env at module load time for things that can be loaded later (dotenv/import order).
// We keep only harmless defaults here.
const ILOVEPDF_REGION = process.env.ILOVEPDF_REGION || "us";
const OCR_LANGUAGES = (process.env.ILOVEPDF_OCR_LANGUAGES || "eng")
  .split(",")
  .map((lang) => lang.trim())
  .filter(Boolean);

const DEFAULT_TEXT_SCAN_PAGES = Number(process.env.OCR_EXTRACT_MAX_PAGES || 5);
const DEFAULT_MIN_TEXT_CHARS = Number(process.env.OCR_EXTRACT_MIN_CHARS || 30);

// When storage rejects big files, compress then retry.
// First try "recommended", then fallback to "extreme".
const COMPRESS_LEVEL_PRIMARY = process.env.ILOVEPDF_COMPRESS_LEVEL || "recommended";
const COMPRESS_LEVEL_FALLBACK = process.env.ILOVEPDF_COMPRESS_FALLBACK_LEVEL || "extreme";
const parsedCompressAttempts = Number(process.env.ILOVEPDF_COMPRESS_MAX_ATTEMPTS);
const MAX_COMPRESS_ATTEMPTS =
  Number.isFinite(parsedCompressAttempts) && parsedCompressAttempts > 0
    ? Math.min(10, Math.floor(parsedCompressAttempts))
    : 3;
const DEFAULT_MAX_PDF_BYTES = 10 * 1024 * 1024;

// Lazy Supabase client (fixes env import-order issues)
let supabaseClient = null;

function ensureSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
  }
  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
  }
  return supabaseClient;
}

function resolveMaxPdfBytes() {
  const raw =
    process.env.UPLOADTHING_PDF_MAX_BYTES ||
    process.env.PDF_MAX_BYTES ||
    process.env.MAX_PDF_BYTES ||
    process.env.CLOUDINARY_PDF_MAX_BYTES ||
    undefined;
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return DEFAULT_MAX_PDF_BYTES;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "unknown size";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
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
      // best-effort
    }
  }

  const pdfjs = await importPdfJs();
  const getDocument = pdfjs?.getDocument || pdfjs?.default?.getDocument;
  if (!getDocument) throw new Error("PDF parser is not available in this environment.");
  return getDocument;
}

const PDFJS_CANDIDATES = [
  "pdfjs-dist/legacy/build/pdf.mjs",
  "pdfjs-dist/legacy/build/pdf.js",
  "pdfjs-dist/legacy/build/pdf",
  "pdfjs-dist/build/pdf.mjs",
  "pdfjs-dist/build/pdf.js",
  "pdfjs-dist/build/pdf",
];

async function importPdfJs() {
  // Use a static import first so Vercel file tracing bundles pdfjs in production.
  try {
    const mod = await import("pdfjs-dist/legacy/build/pdf.js");
    const pdfjs = mod?.default || mod;
    if (pdfjs?.getDocument || pdfjs?.default?.getDocument) return pdfjs;
  } catch {
    // fall through to dynamic candidates
  }

  for (const candidate of PDFJS_CANDIDATES) {
    try {
      const mod = await import(candidate);
      const pdfjs = mod?.default || mod;
      if (pdfjs?.getDocument || pdfjs?.default?.getDocument) return pdfjs;
    } catch {
      // try next candidate
    }
  }

  try {
    const moduleNs = await import("node:module").catch(() => import("module"));
    const createRequire = moduleNs?.createRequire || moduleNs?.default?.createRequire;
    if (typeof createRequire === "function") {
      const req = createRequire(import.meta.url);
      for (const candidate of PDFJS_CANDIDATES) {
        try {
          const mod = req(candidate);
          const pdfjs = mod?.default || mod;
          if (pdfjs?.getDocument || pdfjs?.default?.getDocument) return pdfjs;
        } catch {
          // try next candidate
        }
      }
    }
  } catch (error) {
    console.error("Failed to load pdfjs-dist via require fallback:", error);
  }

  return null;
}

async function extractTextFromBuffer(
  buffer,
  { maxPages = DEFAULT_TEXT_SCAN_PAGES, minChars = DEFAULT_MIN_TEXT_CHARS } = {},
) {
  const getDocument = await loadPdfGetDocument();
  const loadingTask = getDocument({ data: buffer, disableWorker: true });
  const pdf = await loadingTask.promise;

  await new Promise((resolve) => setTimeout(resolve, 1000));

  let fullText = "";
  const pagesToScan = Math.min(pdf.numPages, Math.max(1, maxPages));
  for (let pageIndex = 1; pageIndex <= pagesToScan; pageIndex++) {
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
    if (pageIndex < pagesToScan) fullText += "\n\n";
  }

  const cleaned = fullText.replace(/\u0000/g, "").trim();
  if (!cleaned) return null;

  const normalized = cleaned.replace(/\s+/g, "");
  // ✅ Unicode-aware: accept any letters/numbers (not just A-Z)
  const hasChars = /[\p{L}\p{N}]/u.test(normalized);
  if (!hasChars) return null;

  const minAllowed = Math.min(16, minChars);
  if (normalized.length < minAllowed) return null;

  return cleaned;
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

function deriveOriginalFilename(record) {
  if (record?.pdf_url) {
    try {
      const parsed = new URL(toAbsoluteUrl(record.pdf_url));
      const base = path.posix.basename(parsed.pathname) || null;
      if (base) return base.includes(".") ? base : `${base}.pdf`;
    } catch {}
  }
  if (record?.pdf_public_id) {
    const fileName = String(record.pdf_public_id).split("/").pop();
    if (fileName) return fileName.includes(".") ? fileName : `${fileName}.pdf`;
  }
  return `record-${record?.id || "unknown"}.pdf`;
}

function sanitizeFilenameSegment(value) {
  const safe = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return safe || "record";
}

function deriveOutputFilename(record, suffix) {
  const baseLabel = record?.title_name || record?.name || `record-${record?.id || "file"}`;
  const base = sanitizeFilenameSegment(baseLabel);
  const tag = suffix ? `-${suffix}` : "";
  return `${base}${tag}.pdf`;
}

async function fetchRecord(recordId) {
  const { data, error } = await ensureSupabase()
    .from("records")
    .select("id, pdf_url, pdf_public_id, title_name, name")
    .eq("id", recordId)
    .single();
  if (error) throw new Error(`Failed to load record ${recordId}: ${error.message}`);
  if (!data) throw new Error(`Record ${recordId} not found`);
  return data;
}

async function resolveSourcePdfUrl(record) {
  if (record?.pdf_url) return toAbsoluteUrl(record.pdf_url);
  if (record?.pdf_public_id) {
    const url = await getUploadThingUrl(record.pdf_public_id);
    if (url) return url;
  }
  throw new Error("Record has no pdf_url or pdf_public_id to fetch the PDF.");
}

async function downloadPdfBuffer(url) {
  const resp = await fetch(url);
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Failed to download PDF (${resp.status}): ${body || url}`);
  }
  return Buffer.from(await resp.arrayBuffer());
}

/* -----------------------------
 * iLovePDF helpers (lazy keys)
 * ----------------------------- */

function getIloveKeys() {
  const pub = process.env.ILOVEPDF_PUBLIC_KEY;
  const sec = process.env.ILOVEPDF_SECRET_KEY;
  if (!pub || !sec) throw new Error("Missing ILOVEPDF_PUBLIC_KEY or ILOVEPDF_SECRET_KEY.");
  return { pub, sec };
}

async function authenticateIlove() {
  const { pub, sec } = getIloveKeys();

  const response = await fetch("https://api.ilovepdf.com/v1/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ public_key: pub, secret_key: sec }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.token) {
    throw new Error(`iLovePDF auth failed (${response.status}): ${data?.error || data?.message || "no token"}`);
  }
  return data.token;
}

async function startIloveTask(authToken, tool) {
  const response = await fetch(`https://api.ilovepdf.com/v1/start/${tool}/${ILOVEPDF_REGION}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${authToken}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.server || !data.task) {
    throw new Error(
      `iLovePDF start failed (${response.status}): ${data?.error || data?.message || "missing server/task"}`,
    );
  }
  return { server: data.server, task: data.task };
}

async function uploadPdfToIlove(authToken, server, task, pdfBuffer, filename) {
  const form = new FormData();
  form.append("task", task);
  form.append("file", new Blob([pdfBuffer], { type: "application/pdf" }), filename || "file.pdf");

  const response = await fetch(`https://${server}/v1/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken}` },
    body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.server_filename) {
    throw new Error(
      `iLovePDF upload failed (${response.status}): ${data?.error || data?.message || "no server_filename"}`,
    );
  }
  return data.server_filename;
}

async function processIloveTask(authToken, server, payload) {
  const response = await fetch(`https://${server}/v1/process`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`iLovePDF process failed (${response.status}): ${data?.error || data?.message || "unknown error"}`);
  }
  return data;
}

async function downloadIloveResult(authToken, server, task) {
  const response = await fetch(`https://${server}/v1/download/${task}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`iLovePDF download failed (${response.status}): ${text || "no body"}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function compressPdfWithIlove(pdfBuffer, originalFilename, compressionLevel, logger = console) {
  const authToken = await authenticateIlove();
  const { server, task } = await startIloveTask(authToken, "compress");
  logger.info?.(`Started iLovePDF task ${task} on ${server} (compress:${compressionLevel})`);

  const serverFilename = await uploadPdfToIlove(authToken, server, task, pdfBuffer, originalFilename);
  logger.info?.(`Uploaded to iLovePDF as ${serverFilename} (compress)`);

  await processIloveTask(authToken, server, {
    task,
    tool: "compress",
    files: [{ server_filename: serverFilename, filename: originalFilename || serverFilename }],
    compression_level: compressionLevel, // extreme | recommended | low
    ignore_errors: true,
    try_pdf_repair: true,
    output_filename: `compressed-${originalFilename || "file.pdf"}`,
  });

  logger.info?.("Processing on iLovePDF (compress)...");
  const compressed = await downloadIloveResult(authToken, server, task);
  logger.info?.(`Downloaded compressed result (${compressed.length} bytes)`);
  return compressed;
}

/* -----------------------------
 * UploadThing upload w/ fallback compress
 * ----------------------------- */

function isStorageSizeError(err) {
  const msg = (err?.message || "").toLowerCase();
  const code = (err?.code || "").toLowerCase();
  return (
    code.includes("size") ||
    msg.includes("file size") ||
    msg.includes("too large") ||
    msg.includes("entity too large") ||
    msg.includes("payload too large") ||
    msg.includes("413")
  );
}

function buildCompressionPlan() {
  const plan = [];
  const primary = COMPRESS_LEVEL_PRIMARY || "recommended";
  if (primary) plan.push(primary);
  if (COMPRESS_LEVEL_FALLBACK) {
    if (!plan.length || plan[plan.length - 1] !== COMPRESS_LEVEL_FALLBACK) {
      plan.push(COMPRESS_LEVEL_FALLBACK);
    }
  }
  while (plan.length < MAX_COMPRESS_ATTEMPTS) {
    const last = plan[plan.length - 1] || primary || "extreme";
    plan.push(last);
  }
  return plan.slice(0, MAX_COMPRESS_ATTEMPTS);
}

export async function uploadWithCompressFallback(ocredBuffer, outputFilename, originalFilename, options = {}) {
  const { logger = console, maxBytes = resolveMaxPdfBytes() } = options;
  const compressionPlan = buildCompressionPlan();
  const compressionEvents = [];
  const resolvedMaxBytes = Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : null;

  const pushEvent = (event) => {
    compressionEvents.push({ ...event, timestamp: new Date().toISOString() });
  };

  let currentBuffer = ocredBuffer;
  let compressionCount = 0;
  let uploadAttempt = 0;
  let lastSizeError = null;

  const compressWithLevel = async (level, reason) => {
    const beforeBytes = currentBuffer?.length;
    pushEvent({
      type: "compression-start",
      level,
      attempt: compressionCount + 1,
      bytes_before: beforeBytes,
      reason,
      max_bytes: resolvedMaxBytes || undefined,
    });

    try {
      currentBuffer = await compressPdfWithIlove(currentBuffer, originalFilename, level, logger);
    } catch (compressErr) {
      compressErr.compression_events = compressionEvents;
      throw compressErr;
    }

    compressionCount += 1;
    pushEvent({
      type: "compression-complete",
      level,
      attempt: compressionCount,
      bytes_before: beforeBytes,
      bytes_after: currentBuffer?.length,
      reason,
      max_bytes: resolvedMaxBytes || undefined,
    });
  };

  const ensureWithinLimit = async () => {
    if (!resolvedMaxBytes) return;
    while (currentBuffer?.length > resolvedMaxBytes) {
      const nextLevel = compressionPlan[compressionCount];
      if (!nextLevel) {
        const finalError = new Error(
          `PDF size ${formatBytes(currentBuffer?.length)} exceeds ${formatBytes(
            resolvedMaxBytes,
          )} limit after ${compressionCount} compression attempt(s).`,
        );
        finalError.compression_events = compressionEvents;
        throw finalError;
      }

      logger.warn?.(
        `PDF exceeds ${formatBytes(resolvedMaxBytes)}. Compressing with \"${nextLevel}\" (attempt ${
          compressionCount + 1
        }/${compressionPlan.length})...`,
      );
      await compressWithLevel(nextLevel, "max-bytes");
    }
  };

  await ensureWithinLimit();

  while (true) {
    const wasCompressed = compressionCount > 0;
    const levelUsed = wasCompressed ? compressionPlan[compressionCount - 1] : null;

    try {
      const uploadResult = await uploadPdfBuffer(currentBuffer, outputFilename);
      pushEvent({
        type: "storage-upload",
        status: "success",
        attempt: uploadAttempt,
        from_compression: wasCompressed,
        level: levelUsed || undefined,
        bytes: currentBuffer?.length,
        max_bytes: resolvedMaxBytes || undefined,
      });
      return { ...uploadResult, compression_events: compressionEvents };
    } catch (err) {
      if (!isStorageSizeError(err)) {
        err.compression_events = compressionEvents;
        throw err;
      }
      lastSizeError = err;

      pushEvent({
        type: "storage-upload",
        status: "rejected",
        attempt: uploadAttempt,
        from_compression: wasCompressed,
        level: levelUsed || undefined,
        message: err?.message,
        max_bytes: resolvedMaxBytes || undefined,
      });
      uploadAttempt += 1;

      const nextLevel = compressionPlan[compressionCount];
      if (!nextLevel) break;

      logger.warn?.(
        `UploadThing rejected PDF (size). Compressing with \"${nextLevel}\" and retrying (attempt ${
          compressionCount + 1
        }/${compressionPlan.length})...`,
      );
      await compressWithLevel(nextLevel, "storage-size");
      await ensureWithinLimit();
    }
  }

  const finalError =
    lastSizeError ||
    new Error(`UploadThing rejected PDF after ${compressionPlan.length} compression attempt(s). Too large to upload.`);
  finalError.compression_events = compressionEvents;
  throw finalError;
}

/* -----------------------------
 * Main pipeline function
 * ----------------------------- */

export async function runOcrForRecord({
  recordId,
  deleteOldAsset = false,
  resetExtractedText = true,
  logger = console,
}) {
  if (!recordId) throw new Error("recordId is required");
  ensureUploadThingToken();

  logger.info?.(`Loading record ${recordId} from Supabase...`);
  const record = await fetchRecord(recordId);

  const sourceUrl = await resolveSourcePdfUrl(record);
  logger.info?.(`Downloading PDF from ${sourceUrl}`);
  const pdfBuffer = await downloadPdfBuffer(sourceUrl);

  const authToken = await authenticateIlove();
  const { server, task } = await startIloveTask(authToken, "pdfocr");
  logger.info?.(`Started iLovePDF task ${task} on ${server} (pdfocr)`);

  const originalFilename = deriveOriginalFilename(record);
  const serverFilename = await uploadPdfToIlove(authToken, server, task, pdfBuffer, originalFilename);
  logger.info?.(`Uploaded to iLovePDF as ${serverFilename}`);

  await processIloveTask(authToken, server, {
    task,
    tool: "pdfocr",
    files: [{ server_filename: serverFilename, filename: originalFilename || serverFilename }],
    ocr_languages: OCR_LANGUAGES,
    ignore_errors: true,
    try_pdf_repair: true,
    try_image_repair: true,
    output_filename: `record-${recordId}-ocr.pdf`,
  });

  logger.info?.("Processing on iLovePDF (OCR)...");
  const ocredBuffer = await downloadIloveResult(authToken, server, task);
  logger.info?.(`Downloaded OCR result (${ocredBuffer.length} bytes)`);

  const outputFilename = deriveOutputFilename(record, "ocr");

  // ✅ Upload with compress fallback on size limit
  const { key, ufsUrl, url, compression_events } = await uploadWithCompressFallback(
    ocredBuffer,
    outputFilename,
    originalFilename,
    { logger },
  );

  const finalUrl = ufsUrl || url;
  if (!finalUrl) throw new Error("UploadThing returned no URL for the OCR PDF.");
  logger.info?.(`Uploaded OCR PDF to UploadThing (${key}).`);
  const compressionCount =
    compression_events?.filter((evt) => evt?.type === "compression-start" || evt?.from_compression)?.length || 0;
  const hasCompression = compressionCount > 0;
  if (hasCompression) {
    logger.info?.(`Compression attempts before upload: ${compressionCount}`);
  }

  let extractedText = null;
  let textExtractionError = null;
  try {
    extractedText = await extractTextFromBuffer(new Uint8Array(ocredBuffer));
    if (extractedText) logger.info?.("Extracted text from OCR'd PDF and will store it.");
    else logger.warn?.("No meaningful text detected in OCR'd PDF; extracted_text will not be updated.");
  } catch (error) {
    textExtractionError = error?.message || String(error);
    logger.warn?.("Failed to extract text from OCR'd PDF:", textExtractionError);
  }

  const updatePayload = {
    pdf_url: finalUrl,
    pdf_public_id: key,
    extracted_text: extractedText || (resetExtractedText ? null : undefined),
  };

  await ensureSupabase().from("records").update(updatePayload).eq("id", recordId).throwOnError();
  logger.info?.("Updated Supabase record with new PDF URL and UploadThing key");

  if (deleteOldAsset && record.pdf_public_id && record.pdf_public_id !== key) {
    await deleteUploadThingFile(record.pdf_public_id);
  }

  return {
    recordId,
    pdf_url: finalUrl,
    pdf_public_id: key,
    source_url: sourceUrl,
    extracted_text: extractedText || undefined,
    text_extraction_error: textExtractionError || undefined,
    compression_events: hasCompression ? compression_events : undefined,
  };
}
