import type { NextApiRequest, NextApiResponse } from "next";
import formidable, { File } from "formidable";
import fs from "fs/promises";
import path from "path";
import { runOcrForPdfBuffer } from "@/lib/ocrPipeline";

export const config = {
  api: { bodyParser: false, sizeLimit: "150mb" },
};

const OCR_LANGUAGE_OPTIONS: Record<string, string> = {
  english: "eng",
  eng: "eng",
  hindi: "hin",
  hin: "hin",
  gujarati: "guj",
  guj: "guj",
  sanskrit: "san",
  san: "san",
  marathi: "mar",
  mar: "mar",
};

function sanitizeFilenameSegment(value: string) {
  const safe = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return safe || "pdf";
}

function resolveOcrLanguage(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value;
  const normalized = String(raw || "eng")
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  return OCR_LANGUAGE_OPTIONS[normalized] || "eng";
}

async function parseForm(req: NextApiRequest): Promise<{ pdf: File; language: string }> {
  const form = formidable({ multiples: false, maxFileSize: 150 * 1024 * 1024 });
  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      const pdfAny = files.pdf as File | File[] | undefined;
      const pdf = Array.isArray(pdfAny) ? pdfAny[0] : pdfAny;
      if (!pdf?.filepath) return reject(new Error("Missing PDF file"));
      resolve({ pdf, language: resolveOcrLanguage(fields.language) });
    });
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { pdf, language } = await parseForm(req);
    const originalFilename = pdf.originalFilename || "file.pdf";
    const ext = path.extname(originalFilename) || ".pdf";
    const base = sanitizeFilenameSegment(path.basename(originalFilename, ext));
    const buffer = await fs.readFile(pdf.filepath);

    const result = await runOcrForPdfBuffer({
      pdfBuffer: buffer,
      originalFilename,
      ocrLanguages: [language],
      outputFilename: `${base}-ocr${ext}`,
      logger: console,
    });

    return res.status(200).json({
      ok: true,
      fileUrl: result.pdf_url,
      fileKey: result.pdf_public_id,
      pdf_url: result.pdf_url,
      pdf_public_id: result.pdf_public_id,
      language,
      output_filename: result.output_filename,
      compression_events: result.compression_events,
    });
  } catch (err: any) {
    const message = err?.message || "OCR failed.";
    const payload: Record<string, any> = { error: message };
    if (err?.compression_events || err?.compressionEvents) {
      payload.compression_events = err.compression_events || err.compressionEvents;
    }
    return res.status(500).json(payload);
  }
}
