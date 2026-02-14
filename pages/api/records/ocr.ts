import type { NextApiRequest, NextApiResponse } from "next";
import { runOcrForRecord } from "@/lib/ocrPipeline";

export const config = {
  runtime: "nodejs",
};

const SUPPORTED_OCR_LANGUAGES = new Set(["eng", "hin", "sans", "guj"]);

function toBool(value: any) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
}

function parseId(value: any) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseOcrLanguage(value: any) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const idInput = (req.body && (req.body.id ?? req.body.recordId)) || (req.query.id as string | undefined);
  const recordId = parseId(idInput);
  if (!recordId) return res.status(400).json({ error: "Missing or invalid record id" });

  const deleteOld = toBool(req.body?.deleteOld ?? req.query.deleteOld);
  const keepExtractedText = toBool(req.body?.keepExtractedText ?? req.query.keepExtractedText);
  const requestedLanguage = parseOcrLanguage(req.body?.ocrLanguage ?? req.query.ocrLanguage);
  const ocrLanguage = requestedLanguage || "eng";
  if (!SUPPORTED_OCR_LANGUAGES.has(ocrLanguage)) {
    return res.status(400).json({
      error: `Unsupported OCR language "${ocrLanguage}". Supported values: eng, hin, sans, guj.`,
    });
  }

  try {
    const result = await runOcrForRecord({
      recordId,
      deleteOldAsset: deleteOld,
      resetExtractedText: !keepExtractedText,
      ocrLanguages: [ocrLanguage],
      logger: console,
    });
    return res.status(200).json({ success: true, ocr_language: ocrLanguage, ...result });
  } catch (error: any) {
    console.error("[api/records/ocr]", error?.message || error);
    const payload: Record<string, any> = { error: error?.message || "Failed to OCR PDF for record." };
    if (error?.compression_events || error?.compressionEvents) {
      payload.compression_events = error.compression_events || error.compressionEvents;
    }
    return res.status(500).json(payload);
  }
}
