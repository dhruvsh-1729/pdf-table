import { createClient } from "@supabase/supabase-js";
import type { NextApiRequest, NextApiResponse } from "next";

const supabase = createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");

type ExtractedTextResponse =
  | { text: string }
  | {
      error: string;
    };

async function loadPdfGetDocument() {
  const globalAny = globalThis as any;

  // pdfjs requires DOM-like globals even in Node; provide them via @napi-rs/canvas if available.
  if (!globalAny.DOMMatrix || !globalAny.Path2D || !globalAny.ImageData) {
    try {
      const canvas = await import("@napi-rs/canvas");
      if (!globalAny.DOMMatrix && canvas.DOMMatrix) globalAny.DOMMatrix = canvas.DOMMatrix;
      if (!globalAny.Path2D && canvas.Path2D) globalAny.Path2D = canvas.Path2D;
      if (!globalAny.ImageData && canvas.ImageData) globalAny.ImageData = canvas.ImageData;
    } catch (error) {
      console.warn("Canvas polyfills unavailable; PDF text extraction may fail.", error);
    }
  }

  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const getDocument = pdfjs.getDocument || pdfjs.default?.getDocument;

  if (!getDocument) {
    throw new Error("PDF parser is not available in the current environment.");
  }

  return getDocument;
}

async function extractTextFromPdf(data: Uint8Array): Promise<string> {
  const getDocument = await loadPdfGetDocument();

  const loadingTask = getDocument({ data, disableWorker: true });
  const pdf = await loadingTask.promise;

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
  }

  return fullText.replace(/\u0000/g, "").trim();
}

function resolvePdfUrl(pdfUrl: string) {
  if (!pdfUrl.startsWith("http")) {
    const base =
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.SITE_URL ||
      process.env.NEXTAUTH_URL ||
      `http://localhost:${process.env.PORT || 3000}`;

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
      .select("id, pdf_url, extracted_text, name, title_name")
      .eq("id", recordId)
      .single();

    if (fetchError || !record) {
      return res.status(404).json({ error: "Record not found." });
    }

    if (record.extracted_text) {
      return res.status(200).json({ text: record.extracted_text });
    }

    if (!record.pdf_url) {
      return res.status(400).json({ error: "PDF URL is missing for this record." });
    }

    const targetUrl = resolvePdfUrl(record.pdf_url);
    const response = await fetch(targetUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch PDF from ${targetUrl} (status ${response.status})`);
    }

    const pdfBytes = new Uint8Array(await response.arrayBuffer());
    const extractedText = await extractTextFromPdf(pdfBytes);

    await supabase
      .from("records")
      .update({ extracted_text: extractedText })
      .eq("id", recordId)
      .throwOnError();

    return res.status(200).json({ text: extractedText });
  } catch (error) {
    console.error("Failed to extract PDF text:", error);
    return res
      .status(500)
      .json({ error: error instanceof Error ? error.message : "Unable to extract text from the requested PDF." });
  }
}
