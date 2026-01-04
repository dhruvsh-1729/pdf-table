import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { SarvamAIClient } from "sarvamai";
import { v2 as cloudinary } from "cloudinary";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SARVAM_API_KEY = process.env.SARVAM_API_KEY || "";
const CRON_SECRET = process.env.CRON_SECRET || "";
const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || "pdfs";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const sarvamClient = SARVAM_API_KEY ? new SarvamAIClient({ apiSubscriptionKey: SARVAM_API_KEY.trim() }) : null;

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

function getBaseSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ||
    `http://localhost:${process.env.PORT || 3000}`
  );
}

function buildCloudinaryRawUrl(publicIdWithExt: string) {
  return cloudinary.url(publicIdWithExt, {
    resource_type: "raw",
    type: "upload",
    sign_url: true,
    secure: true,
  });
}

function resolvePdfUrl(record: any) {
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

async function downloadPdf(url: string) {
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Failed to fetch PDF (${resp.status}): ${text || url}`);
  }
  return new Uint8Array(await resp.arrayBuffer());
}

async function loadPdfGetDocument() {
  const globalAny = globalThis as any;
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
  const getDocument = (pdfjs as any).getDocument || (pdfjs as any).default?.getDocument;
  if (!getDocument) throw new Error("PDF parser unavailable.");
  return getDocument;
}

async function extractText(buffer: Uint8Array) {
  const getDocument = await loadPdfGetDocument();
  const loadingTask = getDocument({ data: buffer, disableWorker: true });
  const pdf = await loadingTask.promise;
  await new Promise((resolve) => setTimeout(resolve, 500));

  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: any) => {
        const str = typeof item.str === "string" ? item.str : "";
        return item.hasEOL ? `${str}\n` : `${str} `;
      })
      .join("")
      .replace(/[ \t]+\n/g, "\n")
      .trimEnd();
    text += pageText;
    if (i < pdf.numPages) text += "\n\n";
  }
  const cleaned = text.replace(/\u0000/g, "").trim();
  if (!cleaned) return null;
  const norm = cleaned.replace(/\s+/g, "");
  if (!/[\p{L}\p{N}]/u.test(norm) || norm.length < 16) return null;
  return cleaned;
}

function trimContext(text: string, maxChars: number) {
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

function buildMessages(mode: "summary" | "conclusion", text: string, title?: string | null, name?: string | null) {
  const baseInstruction =
    "You are an expert editor for academic PDF content. Use only the provided extracted text. Do not make up facts, add disclaimers, or include pre/post text. Keep output concise and accurate.";
  const label = title || name || "the article";
  if (mode === "summary") {
    return [
      { role: "system" as const, content: baseInstruction },
      {
        role: "user" as const,
        content: `Create a short accurate summary (~300 words) of all details mentioned in ${label}. Ensure no details are false, inaccurate, or hallucinated. After generating, review the summary against the PDF content to correct any mistakes, inaccuracies, or discrepancies. Use appropriate language for regular readers and research scholars - keep it sharp and concise without extra words. You may add relevant post-publication updates in brackets if applicable. Verify all information carefully before summarizing. Avoid bullet points and introductions like "Sure" or "Summary:".\n\nExtracted text:\n${text}`,
      },
    ];
  }
  return [
    { role: "system" as const, content: baseInstruction },
    {
      role: "user" as const,
      content: `Write a short, unique and distinctive conclusion (110-140 words) from ${label}. Focus on key implications, outcomes, and significance rather than repeating summary content. Ensure the conclusion is specific to this document's findings and contributions. Output only the conclusion paragraph.\n\nExtracted text:\n${text}`,
    },
  ];
}

async function generateAI(mode: "summary" | "conclusion", text: string, title?: string | null, name?: string | null) {
  if (!sarvamClient) throw new Error("SARVAM_API_KEY not configured.");
  const messages = buildMessages(mode, trimContext(text, mode === "summary" ? 9000 : 6000), title, name);
  const response = await sarvamClient.chat.completions({
    messages,
    temperature: 0.25,
    top_p: 0.9,
    max_tokens: mode === "summary" ? 360 : 220,
    n: 1,
  });
  const content = response.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error(`AI returned empty ${mode}.`);
  return content;
}

function isBlank(value: any) {
  return value === null || value === undefined || String(value).trim() === "";
}

async function fetchBatch(limit: number) {
  const { data, error } = await supabase
    .from("records")
    .select("id, pdf_url, pdf_public_id, summary, conclusion, extracted_text, name, title_name")
    .order("id", { ascending: true })
    .limit(limit * 2); // fetch extra to filter in-app
  if (error) throw error;
  return (data || []).filter((r) => isBlank(r.summary) && isBlank(r.conclusion));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const isCron = req.headers["x-vercel-cron"] === "1";
  if (CRON_SECRET) {
    const provided = (req.headers["x-cron-secret"] as string) || (req.query.cron_secret as string) || "";
    if (provided !== CRON_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }
  if (!isCron && req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const perRunLimit = Number(req.query.limit ?? 5);
    if (!Number.isFinite(perRunLimit) || perRunLimit <= 0) {
      return res.status(400).json({ error: "Invalid limit" });
    }

    const batch = await fetchBatch(perRunLimit);
    const targets = batch.slice(0, perRunLimit);

    let processed = 0;
    const results: any[] = [];

    for (const record of targets) {
      try {
        const pdfUrl = resolvePdfUrl(record);
        if (!pdfUrl) throw new Error("No pdf_url or pdf_public_id");

        const pdfBytes = await downloadPdf(pdfUrl);
        const extractedText =
          !isBlank(record.extracted_text) && record.extracted_text
            ? record.extracted_text
            : await extractText(pdfBytes);
        if (!extractedText) throw new Error("Extraction produced no text");

        const summary = await generateAI("summary", extractedText, record.title_name, record.name);
        const conclusion = await generateAI("conclusion", extractedText, record.title_name, record.name);

        await supabase
          .from("records")
          .update({ extracted_text: extractedText, summary, conclusion })
          .eq("id", record.id)
          .throwOnError();

        results.push({ id: record.id, status: "updated" });
        processed++;
      } catch (err: any) {
        results.push({ id: record.id, status: "error", error: err?.message || String(err) });
      }
    }

    return res.status(200).json({ processed, results });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Cron run failed" });
  }
}
