import { createClient } from "@supabase/supabase-js";
import type { NextApiRequest, NextApiResponse } from "next";
import { getUploadThingUrl } from "@/lib/uploadthing";
import { extractLanguageDisplay, parseLanguageValues, syncRecordLanguages } from "@/lib/recordRelations";
import { detectLanguageFromText, FRANC_LATIN_CANDIDATES, isKnownLanguage, tesseractCodeFor } from "@/lib/languages";
import { invalidateRecordsCache } from "@/lib/recordsQueryCache";

export const config = {
  runtime: "nodejs",
};

const supabase = createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");

type ExtractedTextResponse =
  | { text: string; usedOcr?: boolean }
  | {
      error: string;
    };

const DEFAULT_LANG = "eng";
const MIN_VALID_LETTER_COUNT = 40;
const OCR_SCALE = 2;
const OCR_PAGE_LIMIT = 50;
const TESSDATA_URL = "https://tessdata.projectnaptha.com/4.0.0";

let canvasModulePromise: Promise<typeof import("@napi-rs/canvas")> | null = null;
let tesseractPromise: Promise<typeof import("tesseract.js")> | null = null;
let francFnPromise: Promise<(text: string, opts?: any) => string> | null = null;
let requirePromise: Promise<NodeRequire> | null = null;

async function loadCanvasModule() {
  if (!canvasModulePromise) {
    canvasModulePromise = import("@napi-rs/canvas");
  }
  return canvasModulePromise;
}

async function loadTesseract() {
  if (!tesseractPromise) {
    tesseractPromise = import("tesseract.js");
  }
  return tesseractPromise;
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
    const m: any = await import("pdfjs-dist/legacy/build/pdf.js");
    const pdfjs = m?.default || m;
    if (pdfjs?.getDocument || pdfjs?.default?.getDocument) return pdfjs;
  } catch {
    // fall through to dynamic candidates
  }

  for (const candidate of PDFJS_CANDIDATES) {
    try {
      const m: any = await import(candidate);
      const pdfjs = m?.default || m;
      if (pdfjs?.getDocument || pdfjs?.default?.getDocument) return pdfjs;
    } catch {
      // try next candidate
    }
  }

  try {
    const req = await getNodeRequire();
    for (const candidate of PDFJS_CANDIDATES) {
      try {
        const m: any = req(candidate);
        const pdfjs = m?.default || m;
        if (pdfjs?.getDocument || pdfjs?.default?.getDocument) return pdfjs;
      } catch {
        // try next candidate
      }
    }
  } catch (error) {
    console.error("Failed to load pdfjs-dist via require fallback:", error);
  }

  return null;
}

async function getFranc() {
  if (!francFnPromise) {
    francFnPromise = import("franc").then((mod) => (mod.franc || (mod as any).default) as any);
  }
  return francFnPromise;
}

async function getNodeRequire() {
  if (!requirePromise) {
    requirePromise = import("module").then((m: any) => {
      const createRequire = m?.createRequire || m?.default?.createRequire;
      if (!createRequire) {
        throw new Error("Node createRequire is unavailable in this runtime.");
      }
      return createRequire(import.meta.url);
    });
  }
  return requirePromise;
}

async function ensureGetBuiltinModule() {
  const proc: any = process;

  // If getBuiltinModule exists but doesn't return a module namespace with createRequire,
  // pdf.js will crash. So we patch in both cases (missing OR broken).
  let ok = false;
  try {
    const builtin = proc.getBuiltinModule?.("module");
    ok = typeof builtin?.createRequire === "function";
  } catch {
    ok = false;
  }

  if (ok) return;

  const imported = await import("node:module").catch(() => import("module"));
  const moduleNs: any = (imported as any).createRequire ? imported : (imported as any).default;

  if (typeof moduleNs?.createRequire !== "function") {
    throw new Error("Failed to load node:module createRequire for pdf.js compatibility.");
  }

  proc.getBuiltinModule = (name: string) => {
    if (name === "module") return moduleNs;
    // pdf.js only asks for "module" today, but this makes it safer.
    return moduleNs;
  };
}

async function ensureDomLikeGlobals() {
  const g: any = globalThis as any;
  if (g.DOMMatrix && g.Path2D && g.ImageData) return;

  try {
    const canvas = await loadCanvasModule();
    if (!g.DOMMatrix && canvas.DOMMatrix) g.DOMMatrix = canvas.DOMMatrix;
    if (!g.Path2D && canvas.Path2D) g.Path2D = canvas.Path2D;
    if (!g.ImageData && canvas.ImageData) g.ImageData = canvas.ImageData;
  } catch (error) {
    console.warn("Canvas polyfills unavailable; PDF parsing may fail.", error);
  }
}

async function loadPdfGetDocument() {
  const globalAny = globalThis as any;

  await ensureGetBuiltinModule();

  // ✅ Polyfill DOMMatrix/Path2D/ImageData before importing pdfjs
  if (!globalAny.DOMMatrix || !globalAny.Path2D || !globalAny.ImageData) {
    const canvas = await loadCanvasModule();
    if (!globalAny.DOMMatrix && canvas.DOMMatrix) globalAny.DOMMatrix = canvas.DOMMatrix;
    if (!globalAny.Path2D && canvas.Path2D) globalAny.Path2D = canvas.Path2D;
    if (!globalAny.ImageData && canvas.ImageData) globalAny.ImageData = canvas.ImageData;
  }

  // ✅ Load pdfjs with multiple fallbacks.
  const pdfjs: any = await importPdfJs();
  const getDocument = pdfjs?.getDocument || pdfjs?.default?.getDocument;
  if (!getDocument) throw new Error("PDF parser is not available in the current environment.");

  // Running with disableWorker=true, so we don't set workerSrc in Node.

  return getDocument;
}

async function loadPdfDocument(data: Uint8Array) {
  const getDocument = await loadPdfGetDocument();
  // keep disableWorker true — avoids loading worker in Node environments
  const loadingTask = getDocument({ data, disableWorker: true });
  return loadingTask.promise;
}

async function extractTextFromPdf(pdf: any): Promise<string> {
  let fullText = "";

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex++) {
    const page = await pdf.getPage(pageIndex);
    const textContent = await page.getTextContent();

    const pageText = textContent.items
      .map((item: any) => {
        const str = typeof item.str === "string" ? item.str : "";
        return item.hasEOL ? `${str}\n` : `${str} `;
      })
      .join("")
      .replace(/[ \t]+\n/g, "\n")
      .trimEnd();

    fullText += pageText;
    if (pageIndex < pdf.numPages) {
      fullText += "\n\n";
    }
    page.cleanup?.();
  }

  return fullText.replace(/\u0000/g, "").trim();
}

class NapiCanvasFactory {
  private canvas: typeof import("@napi-rs/canvas");

  constructor(canvas: typeof import("@napi-rs/canvas")) {
    this.canvas = canvas;
  }

  create(width: number, height: number) {
    const canvas = this.canvas.createCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Failed to get 2D context for OCR rendering.");
    canvas.width = width;
    canvas.height = height;
    return { canvas, context };
  }

  reset(canvasAndContext: { canvas?: any; context?: any }, width: number, height: number) {
    if (!canvasAndContext?.canvas) return;
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(canvasAndContext: { canvas?: any; context?: any }) {
    if (!canvasAndContext?.canvas) return;
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

async function renderPageToImage(page: any, canvasModule: typeof import("@napi-rs/canvas")) {
  const viewport = page.getViewport({ scale: OCR_SCALE });
  const factory = new NapiCanvasFactory(canvasModule);
  const { canvas, context } = factory.create(viewport.width, viewport.height);

  await page.render({ canvasContext: context, viewport, canvasFactory: factory }).promise;
  const buffer = canvas.toBuffer("image/png");
  factory.destroy({ canvas, context });
  return buffer;
}

/** Tesseract language string ("eng", "hin+san") for a list of canonical language names. */
function ocrLanguageFor(names: string[]): string {
  const codes = Array.from(new Set(names.map((name) => tesseractCodeFor(name)).filter(Boolean)));
  return codes.length ? codes.join("+") : DEFAULT_LANG;
}

/** Canonical language names the caller declared (e.g. the record's current languages). */
function declaredLanguages(raw?: string | null): string[] {
  return parseLanguageValues(raw || null).filter((name) => isKnownLanguage(name));
}

/**
 * Detect a text's language as a canonical name ("Hindi", "English"), or null.
 * franc is only consulted to tell Latin-script languages apart; on its own it
 * mislabels Devanagari OCR output as Magahi/Bhojpuri/Nepali.
 */
async function detectLanguage(textSample?: string | null): Promise<string | null> {
  let franc: ((text: string, opts?: any) => string) | null = null;
  try {
    franc = await getFranc();
  } catch (error) {
    console.warn("franc unavailable; assuming English for Latin-script text.", error);
  }
  return detectLanguageFromText(textSample, (sample) =>
    franc ? franc(sample, { minLength: 20, only: FRANC_LATIN_CANDIDATES }) : null,
  );
}

function hasMeaningfulText(text?: string | null) {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  const letterCount = (trimmed.match(/\p{L}/gu) || trimmed.match(/[A-Za-z]/g) || []).length;
  return letterCount >= MIN_VALID_LETTER_COUNT;
}

async function performOcrOnPdf(pdf: any, language: string) {
  const canvasModule = await loadCanvasModule();
  const tesseract = await loadTesseract();
  const req = await getNodeRequire();

  let workerPath: string | undefined;
  try {
    workerPath = req.resolve("tesseract.js/src/worker-script/node/index.js");
  } catch {
    try {
      workerPath = req.resolve("tesseract.js/dist/worker.min.js");
    } catch {
      workerPath = undefined;
    }
  }

  const pagesToProcess = Math.min(pdf.numPages, OCR_PAGE_LIMIT);
  let combined = "";

  for (let pageIndex = 1; pageIndex <= pagesToProcess; pageIndex++) {
    const page = await pdf.getPage(pageIndex);
    const imageBuffer = await renderPageToImage(page, canvasModule);

    const recognizeOpts: Record<string, any> = { langPath: TESSDATA_URL };
    if (typeof workerPath === "string" && workerPath.trim()) {
      recognizeOpts.workerPath = workerPath;
    }

    const { data } = await tesseract.recognize(imageBuffer, language, recognizeOpts);

    const pageText = (data?.text || "").replace(/\u0000/g, "").trim();
    if (pageText) combined += (combined ? "\n\n" : "") + pageText;

    page.cleanup?.();
  }

  return combined.trim();
}

function resolvePdfUrl(pdfUrl: string, req?: NextApiRequest) {
  if (!pdfUrl.startsWith("http")) {
    const forwardedProto =
      (req?.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim() ||
      (req?.headers["x-forwarded-protocol"] as string | undefined)?.split(",")[0]?.trim();
    const host = req?.headers.host;

    const envBase = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;

    const base = host ? `${forwardedProto || "https"}://${host}` : envBase || `http://localhost:3000`;

    try {
      return new URL(pdfUrl, base).toString();
    } catch {
      return pdfUrl;
    }
  }

  return pdfUrl;
}

export async function extractTextFromBytes(
  pdfBytes: Uint8Array,
  language?: string | null,
  opts?: { allowOcr?: boolean; allowEmpty?: boolean },
) {
  let pdf: any | null = null;
  let finalText = "";
  let usedOcr = false;
  const declared = declaredLanguages(language);
  let languageHint = ocrLanguageFor(declared);
  let detectedLanguage: string | null = declared.length ? declared.join(", ") : null;
  const allowOcr = opts?.allowOcr !== false;
  const allowEmpty = opts?.allowEmpty === true;

  try {
    pdf = await loadPdfDocument(pdfBytes);
    let extractedText = "";
    try {
      extractedText = await extractTextFromPdf(pdf);
    } catch (error) {
      console.warn("Primary text extraction failed; falling back to OCR.", error);
    }

    finalText = extractedText;
    if (!declared.length) {
      detectedLanguage = await detectLanguage(extractedText);
      if (detectedLanguage) languageHint = ocrLanguageFor([detectedLanguage]);
    }

    if (!hasMeaningfulText(extractedText) && allowOcr) {
      finalText = await performOcrOnPdf(pdf, languageHint);
      usedOcr = true;
      if (!declared.length) detectedLanguage = (await detectLanguage(finalText)) ?? detectedLanguage;
    }
  } finally {
    pdf?.cleanup?.();
    pdf?.destroy?.();
  }

  const sanitized = (finalText || "").replace(/\u0000/g, "").trim();
  if (!sanitized) {
    if (allowEmpty) {
      return { text: "", languageHint, detectedLanguage, usedOcr };
    }
    throw new Error(allowOcr ? "Unable to extract text from this PDF." : "No extractable text found (OCR disabled).");
  }

  return { text: sanitized, languageHint, detectedLanguage, usedOcr };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ExtractedTextResponse>) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const force = String(req.query.force || "").toLowerCase() === "true";

  try {
    const id = req.query.id;

    if (!id || Array.isArray(id)) {
      return res.status(400).json({ error: "A valid record ID is required." });
    }

    const recordId = Number(id);
    if (Number.isNaN(recordId)) {
      return res.status(400).json({ error: "Record ID must be a number." });
    }

    const { data: record, error: fetchError } = await supabase
      .from("records")
      .select(
        "id, pdf_url, pdf_public_id, extracted_text, title_name, magazines(id, name), record_languages(language_id, languages(id, name))",
      )
      .eq("id", recordId)
      .single();

    if (fetchError || !record) {
      return res.status(404).json({ error: "Record not found." });
    }

    if (!force && record.extracted_text && hasMeaningfulText(record.extracted_text)) {
      return res.status(200).json({ text: record.extracted_text });
    }

    let pdfUrl = record.pdf_url;
    if (!pdfUrl && record.pdf_public_id) {
      pdfUrl = await getUploadThingUrl(record.pdf_public_id);
    }
    if (!pdfUrl) {
      return res.status(400).json({ error: "PDF URL is missing for this record." });
    }

    const targetUrl = resolvePdfUrl(pdfUrl, req);
    const response = await fetch(targetUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch PDF from ${targetUrl} (status ${response.status})`);
    }

    const pdfBytes = new Uint8Array(await response.arrayBuffer());
    const currentLanguage = extractLanguageDisplay(record);
    const { text: sanitized, detectedLanguage, usedOcr } = await extractTextFromBytes(pdfBytes, currentLanguage);

    const updatePayload: Record<string, any> = { extracted_text: sanitized };

    await supabase.from("records").update(updatePayload).eq("id", recordId).throwOnError();
    if (!currentLanguage && detectedLanguage) {
      await syncRecordLanguages(supabase, recordId, detectedLanguage);
    }

    invalidateRecordsCache();
    return res.status(200).json({ text: sanitized, usedOcr: usedOcr || undefined });
  } catch (error) {
    console.error("Failed to extract PDF text:", error);
    return res
      .status(500)
      .json({ error: error instanceof Error ? error.message : "Unable to extract text from the requested PDF." });
  }
}
