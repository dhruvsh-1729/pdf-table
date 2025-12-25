import { createClient } from "@supabase/supabase-js";
import type { NextApiRequest, NextApiResponse } from "next";
import { pathToFileURL } from "node:url";

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
const PDFJS_VERSION = "5.3.31";

const LANGUAGE_ALIASES: Record<string, string> = {
  en: "eng",
  eng: "eng",
  english: "eng",
  es: "spa",
  spa: "spa",
  spanish: "spa",
  sp: "spa",
  fr: "fra",
  fra: "fra",
  fre: "fra",
  french: "fra",
  de: "deu",
  deu: "deu",
  ger: "deu",
  german: "deu",
  pt: "por",
  por: "por",
  portuguese: "por",
  it: "ita",
  ita: "ita",
  italian: "ita",
  hi: "hin",
  hin: "hin",
  hindi: "hin",
  mr: "mar",
  mar: "mar",
  marathi: "mar",
  bn: "ben",
  ben: "ben",
  bengali: "ben",
  ta: "tam",
  tam: "tam",
  tamil: "tam",
  te: "tel",
  tel: "tel",
  telugu: "tel",
  gu: "guj",
  guj: "guj",
  gujarati: "guj",
  ur: "urd",
  urd: "urd",
  urdu: "urd",
  ar: "ara",
  ara: "ara",
  arabic: "ara",
};

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

async function importPdfJs() {
  try {
    const m: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
    return m?.default || m;
  } catch (error) {
    console.error("Failed to import pdfjs-dist:", error);
  }
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

  // ✅ Use the legacy ESM build (with a simple build fallback)
  const imported: any = await importPdfJs();
  const pdfjs: any = imported?.default || imported;

  const getDocument = pdfjs.getDocument || pdfjs?.default?.getDocument;
  if (!getDocument) throw new Error("PDF parser is not available in the current environment.");

  // ✅ Prefer local worker file; fall back to a minimal data URL to avoid https: errors in Node ESM
  const workerSrc = await (async () => {
    try {
      const req = await getNodeRequire();
      try {
        const workerPath = req.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
        if (workerPath) return pathToFileURL(workerPath).href;
      } catch {
        // ignore and try min version
      }
      try {
        const workerPath = req.resolve("pdfjs-dist/legacy/build/pdf.worker.min.mjs");
        if (workerPath) return pathToFileURL(workerPath).href;
      } catch {
        // ignore and fall through
      }
    } catch {
      // ignore and fall through
    }
    if (process.env.PDFJS_WORKER_SRC) return process.env.PDFJS_WORKER_SRC;
    const stub = `export default {};`;
    const encoded = Buffer.from(stub, "utf8").toString("base64");
    return `data:application/javascript;base64,${encoded}`;
  })();

  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  return getDocument;
}

async function loadPdfDocument(data: Uint8Array) {
  const getDocument = await loadPdfGetDocument();
  // keep disableWorker true — it still uses fake worker, but now workerSrc is correct
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

function sanitizeLanguage(raw?: string | null) {
  if (!raw) return null;
  const lowered = raw.toLowerCase();
  const candidates = lowered
    .split(/[,/|;]+/g)
    .flatMap((part) => part.split(/\s+/g))
    .map((part) => part.trim())
    .filter(Boolean);

  for (const piece of candidates) {
    const normalized = piece.replace(/[^a-z]/g, "");
    if (!normalized) continue;
    if (LANGUAGE_ALIASES[normalized]) return LANGUAGE_ALIASES[normalized];
    if (/^[a-z]{3}$/i.test(normalized)) return normalized;
  }

  const fallback = lowered.replace(/[^a-z]/g, "");
  if (LANGUAGE_ALIASES[fallback]) return LANGUAGE_ALIASES[fallback];
  if (/^[a-z]{3}$/i.test(fallback)) return fallback;
  return null;
}

async function detectLanguageHint(recordLanguage?: string | null, textSample?: string): Promise<string> {
  const fromRecord = sanitizeLanguage(recordLanguage);
  if (fromRecord) return fromRecord;

  const sample = (textSample || "").replace(/\s+/g, " ").trim();
  if (sample.length >= 30) {
    try {
      const franc = await getFranc();
      const guessed = franc(sample, { minLength: 20 });
      const normalized = sanitizeLanguage(guessed);
      if (normalized) return normalized;
    } catch (error) {
      console.warn("Language detection failed; falling back to default.", error);
    }
  }

  return DEFAULT_LANG;
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

  // Use the Node worker implementation so we don't rely on browser-style globals in Node runtimes.
  const workerPath = req.resolve("tesseract.js/src/worker-script/node/index.js");

  const pagesToProcess = Math.min(pdf.numPages, OCR_PAGE_LIMIT);
  let combined = "";

  for (let pageIndex = 1; pageIndex <= pagesToProcess; pageIndex++) {
    const page = await pdf.getPage(pageIndex);
    const imageBuffer = await renderPageToImage(page, canvasModule);

    const { data } = await tesseract.recognize(imageBuffer, language, {
      langPath: TESSDATA_URL,
      workerPath,
    });

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

export default async function handler(req: NextApiRequest, res: NextApiResponse<ExtractedTextResponse>) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

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
      .select("id, pdf_url, extracted_text, name, title_name, language")
      .eq("id", recordId)
      .single();

    if (fetchError || !record) {
      return res.status(404).json({ error: "Record not found." });
    }

    if (record.extracted_text && hasMeaningfulText(record.extracted_text)) {
      return res.status(200).json({ text: record.extracted_text });
    }

    if (!record.pdf_url) {
      return res.status(400).json({ error: "PDF URL is missing for this record." });
    }

    const targetUrl = resolvePdfUrl(record.pdf_url, req);
    const response = await fetch(targetUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch PDF from ${targetUrl} (status ${response.status})`);
    }

    const pdfBytes = new Uint8Array(await response.arrayBuffer());
    let pdf: any | null = null;
    let finalText = "";
    let usedOcr = false;
    let languageHint = record.language || DEFAULT_LANG;

    try {
      pdf = await loadPdfDocument(pdfBytes);
      let extractedText = "";
      try {
        extractedText = await extractTextFromPdf(pdf);
      } catch (error) {
        console.warn("Primary text extraction failed; falling back to OCR.", error);
      }

      languageHint = await detectLanguageHint(record.language, extractedText);
      finalText = extractedText;

      if (!hasMeaningfulText(extractedText)) {
        finalText = await performOcrOnPdf(pdf, languageHint);
        usedOcr = true;
        languageHint = await detectLanguageHint(record.language, finalText);
      }
    } finally {
      pdf?.cleanup?.();
      pdf?.destroy?.();
    }

    const sanitized = (finalText || "").replace(/\u0000/g, "").trim();

    if (!sanitized) {
      return res.status(500).json({ error: "Unable to extract text from this PDF." });
    }

    const updatePayload: Record<string, any> = { extracted_text: sanitized };
    if (!record.language && languageHint) updatePayload.language = languageHint;

    await supabase.from("records").update(updatePayload).eq("id", recordId).throwOnError();

    return res.status(200).json({ text: sanitized, usedOcr: usedOcr || undefined });
  } catch (error) {
    console.error("Failed to extract PDF text:", error);
    return res
      .status(500)
      .json({ error: error instanceof Error ? error.message : "Unable to extract text from the requested PDF." });
  }
}
