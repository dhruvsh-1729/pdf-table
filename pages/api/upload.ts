// pages/api/upload.ts
import type { NextApiRequest, NextApiResponse } from "next";
import formidable, { File } from "formidable";
import fs from "fs/promises";
import path from "path";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { v2 as cloudinary } from "cloudinary";
import { UploadApiResponse } from "cloudinary";

export const config = {
  api: { bodyParser: false, sizeLimit: "150mb" },
};

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
  pdf_url?: string | null; // viewer URL we store
  pdf_public_id?: string | null; // cloudinary public id with .pdf
};

const toNullIfEmpty = (v: any) => (v === "" || v === undefined ? null : v);
function safeParseJSON<T>(maybeJson: unknown, fallback: T): T {
  if (typeof maybeJson !== "string") return fallback;
  const s = maybeJson.trim();
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "",
  api_key: process.env.CLOUDINARY_API_KEY || "",
  api_secret: process.env.CLOUDINARY_API_SECRET || "",
  secure: true,
});
const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || "pdfs";

function getPdfExt(originalFilename?: string | null) {
  const e = (originalFilename && path.extname(originalFilename)) || ".pdf";
  return e || ".pdf";
}
function buildBaseId(title: string) {
  const base = String(title)
    .toLowerCase()
    .replace(/[^a-z0-9\-_.]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${base}-${Date.now()}`;
}
function buildViewerUrl(publicIdWithExt: string, version?: number | string) {
  const params = new URLSearchParams({ id: publicIdWithExt });
  if (version) params.set("v", String(version));
  return `/api/pdf/view?${params.toString()}`;
}

async function parseForm(req: NextApiRequest): Promise<{ row: RecordRow; pdf: File }> {
  const form = formidable({ multiples: false, maxFileSize: 150 * 1024 * 1024 });
  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      try {
        const jsonField = Array.isArray(fields.json) ? fields.json[0] : (fields.json as string | undefined);
        const fromJson = safeParseJSON<RecordRow>(jsonField, {} as RecordRow);
        const getStr = (k: keyof RecordRow): string | null => {
          const v = (fields as any)[k];
          return typeof v === "string" ? v : Array.isArray(v) ? (v[0] ?? null) : null;
        };

        const row: RecordRow = {
          name: fromJson.name ?? getStr("name") ?? "",
          timestamp: fromJson.timestamp ?? toNullIfEmpty(getStr("timestamp")),
          summary: fromJson.summary ?? toNullIfEmpty(getStr("summary")),
          volume: fromJson.volume ?? toNullIfEmpty(getStr("volume")),
          number: fromJson.number ?? toNullIfEmpty(getStr("number")),
          title_name: fromJson.title_name ?? toNullIfEmpty(getStr("title_name")),
          page_numbers: fromJson.page_numbers ?? toNullIfEmpty(getStr("page_numbers")),
          authors: fromJson.authors ?? toNullIfEmpty(getStr("authors")),
          language: fromJson.language ?? toNullIfEmpty(getStr("language")),
          email: fromJson.email ?? toNullIfEmpty(getStr("email")),
          creator_name: fromJson.creator_name ?? toNullIfEmpty(getStr("creator_name")),
          conclusion: fromJson.conclusion ?? toNullIfEmpty(getStr("conclusion")),
        };

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

async function uploadPdfBufferToCloudinary(buffer: Buffer, publicIdBase: string, ext: string) {
  const public_id = `${CLOUDINARY_FOLDER}/${publicIdBase}${ext}`;
  const result = await new Promise<UploadApiResponse>((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw",
        public_id,
        overwrite: false,
        access_mode: "public",
      },
      (error, res) => (error || !res ? reject(error ?? new Error("Unknown Cloudinary error")) : resolve(res)),
    );
    upload.end(buffer);
  });
  return { publicIdWithExt: public_id, version: result.version };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { row, pdf } = await parseForm(req);
    if (!row.name || !row.name.trim()) return res.status(400).json({ error: "Field 'name' is required." });

    const title = row.title_name || row.name || "untitled";
    const baseId = buildBaseId(title);
    const ext = getPdfExt(pdf.originalFilename);

    const fileBuffer = await fs.readFile(pdf.filepath);
    const { publicIdWithExt, version } = await uploadPdfBufferToCloudinary(fileBuffer, baseId, ext);

    const payload: RecordRow = {
      name: row.name,
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
      pdf_public_id: publicIdWithExt,
      pdf_url: buildViewerUrl(publicIdWithExt, version), // <- proxy viewer
    };

    const { data, error } = await supabaseAdmin.from("records").insert([payload]).select();
    if (error) return res.status(500).json({ error: `Insert failed: ${error.message}` });

    return res.status(200).json({ ok: true, record: data?.[0] || null });
  } catch (e: any) {
    console.error("upload error:", e);
    return res.status(500).json({ error: e?.message || "Unknown error" });
  }
}
