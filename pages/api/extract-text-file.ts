import type { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import fs from "fs/promises";
import { extractTextFromBytes, type ExtractionRedactionsByPage } from "./records/extracted-text";

export const config = {
  api: { bodyParser: false, sizeLimit: "150mb" },
};

function getFirstFieldValue(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

function parseRedactions(value: unknown): ExtractionRedactionsByPage | undefined {
  const raw = getFirstFieldValue(value);
  if (typeof raw !== "string" || !raw.trim()) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid redactions payload.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;

  const redactions: ExtractionRedactionsByPage = {};
  for (const [pageKey, rects] of Object.entries(parsed as Record<string, unknown>)) {
    const pageNumber = Number(pageKey);
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || !Array.isArray(rects)) continue;

    const normalized = rects
      .map((rect: any) => ({
        x: Number(rect?.x),
        y: Number(rect?.y),
        width: Number(rect?.width),
        height: Number(rect?.height),
      }))
      .filter(
        (rect) =>
          Number.isFinite(rect.x) &&
          Number.isFinite(rect.y) &&
          Number.isFinite(rect.width) &&
          Number.isFinite(rect.height) &&
          rect.width > 0 &&
          rect.height > 0,
      );

    if (normalized.length) redactions[pageNumber] = normalized;
  }

  return Object.keys(redactions).length ? redactions : undefined;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const form = formidable({ multiples: false, maxFileSize: 150 * 1024 * 1024 });

  try {
    const [fields, files] = await new Promise<[Record<string, unknown>, Record<string, formidable.File | formidable.File[]>]>(
      (resolve, reject) => {
        form.parse(req, (err, f, fl) => (err ? reject(err) : resolve([f, fl as Record<string, formidable.File | formidable.File[]>])));
      },
    );

    const fileAny = files.pdf || files.file;
    const file = Array.isArray(fileAny) ? fileAny[0] : fileAny;
    if (!file?.filepath) {
      return res.status(400).json({ error: "PDF file is required (field name 'pdf' or 'file')." });
    }

    const languageValue = getFirstFieldValue(fields.language);
    const language = typeof languageValue === "string" ? languageValue : null;
    const allowOcrValue = getFirstFieldValue(fields.allowOcr);
    const disableOcrValue = getFirstFieldValue(fields.disableOcr);
    const allowOcrFlag = typeof allowOcrValue === "string" ? allowOcrValue : "";
    const disableOcrFlag = typeof disableOcrValue === "string" ? disableOcrValue : "";
    const allowOcr =
      (allowOcrFlag || "").toString().toLowerCase() === "true" ||
      (allowOcrFlag || "").toString().toLowerCase() === "1";
    const disableOcr = (disableOcrFlag || "").toString().toLowerCase() === "true";
    const resolvedAllowOcr = disableOcr ? false : allowOcr;
    const redactionsByPage = parseRedactions(fields.redactions);
    const pdfBytes = new Uint8Array(await fs.readFile(file.filepath));

    const { text, languageHint, usedOcr } = await extractTextFromBytes(pdfBytes, language, {
      allowOcr: resolvedAllowOcr,
      allowEmpty: true,
      redactionsByPage,
    });

    return res.status(200).json({
      text,
      language: languageHint || language || null,
      usedOcr: usedOcr || undefined,
      ocrDisabled: !resolvedAllowOcr || undefined,
    });
  } catch (error) {
    console.error("extract-text-file error:", error);
    return res
      .status(500)
      .json({ error: error instanceof Error ? error.message : "Unable to extract text from uploaded PDF." });
  }
}
