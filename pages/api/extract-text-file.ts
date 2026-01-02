import type { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import fs from "fs/promises";
import { extractTextFromBytes } from "./records/extracted-text";

export const config = {
  api: { bodyParser: false, sizeLimit: "150mb" },
};

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

    const language = typeof fields.language === "string" ? fields.language : null;
    const pdfBytes = new Uint8Array(await fs.readFile(file.filepath));

    const { text, languageHint, usedOcr } = await extractTextFromBytes(pdfBytes, language);

    return res.status(200).json({ text, language: languageHint || language || null, usedOcr: usedOcr || undefined });
  } catch (error) {
    console.error("extract-text-file error:", error);
    return res
      .status(500)
      .json({ error: error instanceof Error ? error.message : "Unable to extract text from uploaded PDF." });
  }
}
