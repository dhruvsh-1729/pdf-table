import type { NextApiRequest, NextApiResponse } from "next";
import { runOcrForRecord } from "@/lib/ocrPipeline";

const logger = {
  info: (...args: any[]) => console.log("[api/records/ocr]", ...args),
  error: (...args: any[]) => console.error("[api/records/ocr]", ...args),
  warn: (...args: any[]) => console.warn("[api/records/ocr]", ...args),
};

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const idInput = (req.body && (req.body.id ?? req.body.recordId)) || (req.query.id as string | undefined);
  const recordId = parseId(idInput);
  if (!recordId) return res.status(400).json({ error: "Missing or invalid record id" });

  const deleteOld = toBool(req.body?.deleteOld ?? req.query.deleteOld);
  const keepExtractedText = toBool(req.body?.keepExtractedText ?? req.query.keepExtractedText);

  try {
    const result = await runOcrForRecord({
      recordId,
      deleteOldAsset: deleteOld,
      resetExtractedText: !keepExtractedText,
      logger,
    });
    return res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    logger.error(error?.message || error);
    return res.status(500).json({ error: error?.message || "Failed to OCR PDF for record." });
  }
}
