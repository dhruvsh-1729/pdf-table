import type { NextApiRequest, NextApiResponse } from "next";
import formidable, { File } from "formidable";
import fs from "fs/promises";
import path from "path";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { slugify } from "@/lib/slugify";

export const config = {
  api: { bodyParser: false }, // we will parse multipart ourselves
};

// Shape we expect from the client; extend if you add columns
export type RecordRow = {
  name: string;
  timestamp?: string | null;
  summary?: string | null;
  volume?: string | null;
  number?: string | null;
  title_name?: string | null;
  page_numbers?: string | null;
  authors?: string | null;
  language?: string | null;
  email?: string | null;
  creator_name?: string | null;
  conclusion?: string | null;
  pdf_url?: string | null; // filled on server after upload
};

function toNullIfEmpty(v: any) {
  return v === "" || v === undefined ? null : v;
}

async function parseForm(req: NextApiRequest): Promise<{ row: RecordRow; pdf: File }> {
  const form = formidable({
    multiples: false,
    maxFileSize: 100 * 1024 * 1024, // 100MB
  });

  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      try {
        const json = Array.isArray(fields.json) ? fields.json[0] : (fields.json ?? ("" as string));
        const row = JSON.parse(json) as RecordRow;
        const pdfAny = files.pdf as File | File[] | undefined;
        const pdf = Array.isArray(pdfAny) ? pdfAny[0] : pdfAny;
        if (!pdf) return reject(new Error("Missing PDF file"));
        resolve({ row, pdf });
      } catch (e) {
        reject(e);
      }
    });
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { row, pdf } = await parseForm(req);

    const title = row.title_name || row.name || "untitled";
    const baseSlug = slugify(title);
    const fileExt = path.extname(pdf.originalFilename || ".pdf") || ".pdf";
    const fileName = `${baseSlug}-${Date.now()}${fileExt}`;

    // Read the uploaded temp file into a Buffer for Supabase Storage
    const fileBuffer = await fs.readFile(pdf.filepath);

    const bucket = process.env.SUPABASE_STORAGE_BUCKET || "pdfs";
    const { error: uploadError } = await supabaseAdmin.storage
      .from(bucket)
      .upload(fileName, fileBuffer, { contentType: "application/pdf" });

    if (uploadError) {
      return res.status(500).json({ error: `Upload failed: ${uploadError.message}` });
    }

    // Public URL
    const { data: pub } = supabaseAdmin.storage.from(bucket).getPublicUrl(fileName);
    const pdf_url = pub?.publicUrl || null;

    // Normalize empty strings → nulls for cleaner DB
    const payload: RecordRow = {
      name: toNullIfEmpty(row.name)!,
      timestamp: toNullIfEmpty(row.timestamp),
      summary: toNullIfEmpty(row.summary),
      volume: toNullIfEmpty(row.volume),
      number: toNullIfEmpty(row.number),
      title_name: toNullIfEmpty(row.title_name),
      page_numbers: toNullIfEmpty(row.page_numbers),
      authors: toNullIfEmpty(row.authors),
      language: toNullIfEmpty(row.language),
      email: toNullIfEmpty(row.email),
      creator_name: toNullIfEmpty(row.creator_name),
      conclusion: toNullIfEmpty(row.conclusion),
      pdf_url,
    };

    // Insert row
    const { data, error } = await supabaseAdmin.from("records").insert([payload]).select();
    if (error) return res.status(500).json({ error: `Insert failed: ${error.message}` });

    return res.status(200).json({ ok: true, record: data?.[0] || null });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Unknown error" });
  }
}
