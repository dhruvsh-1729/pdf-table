import { createClient } from "@supabase/supabase-js";
import { v2 as cloudinary } from "cloudinary";
import path from "path";

// NOTE: Do NOT capture env at module load time for things that can be loaded later (dotenv/import order).
// We keep only harmless defaults here.
const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || "pdfs";
const ILOVEPDF_REGION = process.env.ILOVEPDF_REGION || "us";
const OCR_LANGUAGES = (process.env.ILOVEPDF_OCR_LANGUAGES || "eng")
  .split(",")
  .map((lang) => lang.trim())
  .filter(Boolean);

const DEFAULT_TEXT_SCAN_PAGES = Number(process.env.OCR_EXTRACT_MAX_PAGES || 5);
const DEFAULT_MIN_TEXT_CHARS = Number(process.env.OCR_EXTRACT_MIN_CHARS || 30);

// When Cloudinary rejects big files, compress then retry.
// First try "recommended", then fallback to "extreme".
const COMPRESS_LEVEL_PRIMARY = process.env.ILOVEPDF_COMPRESS_LEVEL || "recommended";
const COMPRESS_LEVEL_FALLBACK = process.env.ILOVEPDF_COMPRESS_FALLBACK_LEVEL || "extreme";
const parsedCompressAttempts = Number(process.env.ILOVEPDF_COMPRESS_MAX_ATTEMPTS);
const MAX_COMPRESS_ATTEMPTS =
  Number.isFinite(parsedCompressAttempts) && parsedCompressAttempts > 0
    ? Math.min(10, Math.floor(parsedCompressAttempts))
    : 3;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "",
  api_key: process.env.CLOUDINARY_API_KEY || "",
  api_secret: process.env.CLOUDINARY_API_SECRET || "",
  secure: true,
});

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

function ensureCloudinaryConfig() {
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    throw new Error(
      "Missing Cloudinary configuration (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET).",
    );
  }
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

function splitPublicIdAndExt(publicId) {
  if (!publicId) return { base: null, ext: ".pdf" };
  const dot = publicId.lastIndexOf(".");
  if (dot === -1) return { base: publicId, ext: ".pdf" };
  const ext = publicId.slice(dot) || ".pdf";
  const base = publicId.slice(0, dot) || null;
  return { base, ext };
}

function deriveOriginalFilename(record) {
  if (record?.pdf_public_id) {
    const fileName = record.pdf_public_id.split("/").pop();
    if (fileName) return fileName;
  }
  if (record?.pdf_url) {
    try {
      const parsed = new URL(toAbsoluteUrl(record.pdf_url));
      const base = path.posix.basename(parsed.pathname) || null;
      if (base) return base.includes(".") ? base : `${base}.pdf`;
    } catch {}
  }
  return `record-${record?.id || "unknown"}.pdf`;
}

function deriveNewPublicId(record) {
  const { base, ext } = splitPublicIdAndExt(
    record?.pdf_public_id || `${CLOUDINARY_FOLDER}/record-${record?.id || "file"}.pdf`,
  );
  const cleanBase = base || `${CLOUDINARY_FOLDER}/record-${record?.id || "file"}`;
  const withSuffix = cleanBase.endsWith("-ocr") ? cleanBase : `${cleanBase}-ocr`;
  return `${withSuffix}${ext || ".pdf"}`;
}

function buildViewerUrl(publicIdWithExt, version) {
  const params = new URLSearchParams({ id: publicIdWithExt });
  if (version) params.set("v", String(version));
  return `/api/pdf/view?${params.toString()}`;
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

function buildCloudinaryRawUrl(publicIdWithExt) {
  return cloudinary.url(publicIdWithExt, {
    resource_type: "raw",
    type: "upload",
    sign_url: true,
    secure: true,
  });
}

function resolveSourcePdfUrl(record) {
  if (record?.pdf_public_id) return buildCloudinaryRawUrl(record.pdf_public_id);
  if (record?.pdf_url) return toAbsoluteUrl(record.pdf_url);
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
 * Cloudinary upload w/ fallback compress
 * ----------------------------- */

function isCloudinarySizeError(err) {
  const msg = (err?.message || "").toLowerCase();
  // Cloudinary error messages vary by SDK/account limits; these patterns catch common ones.
  return (
    msg.includes("file size too large") ||
    msg.includes("too large") ||
    msg.includes("resource size") ||
    msg.includes("entity too large") ||
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

async function uploadPdfBufferToCloudinary(buffer, publicIdWithExt) {
  const result = await new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw",
        public_id: publicIdWithExt,
        overwrite: true,
        invalidate: true,
        access_mode: "public",
      },
      (error, res) => (error || !res ? reject(error || new Error("Unknown Cloudinary error")) : resolve(res)),
    );
    upload.end(buffer);
  });

  return { publicIdWithExt, version: result.version };
}

async function uploadWithCompressFallback(ocredBuffer, publicIdWithExt, originalFilename, options = {}) {
  const { logger = console } = options;
  const compressionPlan = buildCompressionPlan();
  const compressionEvents = [];

  const pushEvent = (event) => {
    compressionEvents.push({ ...event, timestamp: new Date().toISOString() });
  };

  let currentBuffer = ocredBuffer;
  let lastSizeError = null;

  for (let attempt = 0; attempt <= compressionPlan.length; attempt++) {
    const wasCompressed = attempt > 0;
    const levelUsed = wasCompressed ? compressionPlan[attempt - 1] : null;

    try {
      const uploadResult = await uploadPdfBufferToCloudinary(currentBuffer, publicIdWithExt);
      pushEvent({
        type: "cloudinary-upload",
        status: "success",
        attempt,
        from_compression: wasCompressed,
        level: levelUsed || undefined,
        bytes: currentBuffer?.length,
      });
      return { ...uploadResult, compression_events: compressionEvents };
    } catch (err) {
      if (!isCloudinarySizeError(err)) {
        err.compression_events = compressionEvents;
        throw err;
      }
      lastSizeError = err;

      pushEvent({
        type: "cloudinary-upload",
        status: "rejected",
        attempt,
        from_compression: wasCompressed,
        level: levelUsed || undefined,
        message: err?.message,
      });

      const nextLevel = compressionPlan[attempt];
      if (!nextLevel) break;

      const beforeBytes = currentBuffer?.length;
      logger.warn?.(
        `Cloudinary rejected PDF (size). Compressing with "${nextLevel}" and retrying (attempt ${
          attempt + 1
        }/${compressionPlan.length})...`,
      );
      pushEvent({
        type: "compression-start",
        level: nextLevel,
        attempt: attempt + 1,
        bytes_before: beforeBytes,
      });

      try {
        currentBuffer = await compressPdfWithIlove(currentBuffer, originalFilename, nextLevel, logger);
      } catch (compressErr) {
        compressErr.compression_events = compressionEvents;
        throw compressErr;
      }

      pushEvent({
        type: "compression-complete",
        level: nextLevel,
        attempt: attempt + 1,
        bytes_before: beforeBytes,
        bytes_after: currentBuffer?.length,
      });
    }
  }

  const finalError =
    lastSizeError ||
    new Error(`Cloudinary rejected PDF after ${compressionPlan.length} compression attempt(s). Too large to upload.`);
  finalError.compression_events = compressionEvents;
  throw finalError;
}

async function deleteCloudinaryAsset(publicIdWithExt) {
  try {
    await cloudinary.uploader.destroy(publicIdWithExt.replace(/\.pdf$/i, ""), {
      resource_type: "raw",
      invalidate: true,
    });
  } catch (error) {
    console.warn("Warning: failed to delete old Cloudinary asset:", error);
  }
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
  ensureCloudinaryConfig();

  logger.info?.(`Loading record ${recordId} from Supabase...`);
  const record = await fetchRecord(recordId);

  const sourceUrl = resolveSourcePdfUrl(record);
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

  const newPublicIdWithExt = deriveNewPublicId(record);

  // ✅ Upload with compress fallback on Cloudinary oversize
  const { publicIdWithExt, version, compression_events } = await uploadWithCompressFallback(
    ocredBuffer,
    newPublicIdWithExt,
    originalFilename,
    { logger },
  );

  const viewerUrl = buildViewerUrl(publicIdWithExt, version);
  logger.info?.(`Uploaded OCR PDF to Cloudinary at ${publicIdWithExt} (v${version})`);
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
    pdf_url: viewerUrl,
    pdf_public_id: publicIdWithExt,
    extracted_text: extractedText || (resetExtractedText ? null : undefined),
  };

  await ensureSupabase().from("records").update(updatePayload).eq("id", recordId).throwOnError();
  logger.info?.("Updated Supabase record with new PDF URL and public ID");

  if (deleteOldAsset && record.pdf_public_id && record.pdf_public_id !== publicIdWithExt) {
    await deleteCloudinaryAsset(record.pdf_public_id);
  }

  return {
    recordId,
    pdf_url: viewerUrl,
    pdf_public_id: publicIdWithExt,
    cloudinary_version: version,
    source_url: sourceUrl,
    extracted_text: extractedText || undefined,
    text_extraction_error: textExtractionError || undefined,
    compression_events: hasCompression ? compression_events : undefined,
  };
}
