// pages/api/records/upload-update.ts
import type { NextApiRequest, NextApiResponse } from "next";
import formidable, { File } from "formidable";
import fs from "fs/promises";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { deleteUploadThingFile, ensureUploadThingToken, uploadPdfBuffer } from "@/lib/uploadthing";
import { invalidateCache } from "./records-paginated";

export const config = {
  api: { bodyParser: false, sizeLimit: "150mb" },
};

const supabase = createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");

const toNullIfEmpty = (v: any) => (v === "" || v === undefined ? null : v);
function getFirstString(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : undefined;
  return undefined;
}
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
async function uploadPdfBufferToUploadThing(buffer: Buffer, baseName: string, ext: string) {
  const filename = `${baseName}${ext || ".pdf"}`;
  return uploadPdfBuffer(buffer, filename);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const form = formidable({ multiples: true, maxFileSize: 150 * 1024 * 1024 });

  try {
    ensureUploadThingToken();
    const [fields, files] = await new Promise<[Record<string, unknown>, Record<string, File | File[]>]>(
      (resolve, reject) => {
        form.parse(req, (err, f, fl) => (err ? reject(err) : resolve([f, fl as Record<string, File | File[]>])));
      },
    );

    const id = getFirstString(fields.id) || (req.query.id as string | undefined);
    if (!id) return res.status(400).json({ error: "Missing record ID" });

    const { data: existing, error: fetchError } = await supabase
      .from("records")
      .select("summary, pdf_url, pdf_public_id, conclusion, title_name, name")
      .eq("id", id)
      .single();
    if (fetchError) return res.status(500).json({ error: fetchError.message });

    let pdfUrl = existing?.pdf_url ?? null;
    let pdfPublicId = existing?.pdf_public_id ?? null;
    let shouldResetExtractedText = false;

    // If a new file is posted, upload to UploadThing & delete old
    const pdfAny = files.pdf as File | File[] | undefined;
    const pdfFile = Array.isArray(pdfAny) ? pdfAny[0] : pdfAny;
    if (pdfFile?.filepath) {
      const fileBuffer = await fs.readFile(pdfFile.filepath);

      const title =
        getFirstString(fields.title_name) ||
        existing?.title_name ||
        getFirstString(fields.name) ||
        existing?.name ||
        "untitled";

      const baseId = buildBaseId(title!);
      const ext = getPdfExt(pdfFile.originalFilename);

      const uploaded = await uploadPdfBufferToUploadThing(fileBuffer, baseId, ext);
      pdfPublicId = uploaded.key;
      pdfUrl = uploaded.ufsUrl || uploaded.url;
      if (!pdfUrl) throw new Error("UploadThing returned no URL for the uploaded PDF.");
      shouldResetExtractedText = true;

      if (existing?.pdf_public_id && existing.pdf_public_id !== pdfPublicId) {
        try {
          await deleteUploadThingFile(existing.pdf_public_id);
        } catch (e) {
          console.warn("Warning: failed to delete old UploadThing file:", e);
        }
      }
    }

    // Build selective update payload
    const updateFieldsRaw = {
      name: getFirstString(fields.name),
      summary: getFirstString(fields.summary),
      pdf_url: pdfUrl, // UploadThing URL
      pdf_public_id: pdfPublicId, // UploadThing file key
      volume: getFirstString(fields.volume),
      number: getFirstString(fields.number),
      title_name: getFirstString(fields.title_name),
      page_numbers: getFirstString(fields.page_numbers),
      authors: getFirstString(fields.authors),
      language: getFirstString(fields.language),
      timestamp: getFirstString(fields.timestamp),
      conclusion: getFirstString(fields.conclusion),
      extracted_text: shouldResetExtractedText ? null : undefined,
    };
    const updateFields: Record<string, any> = {};
    for (const [k, v] of Object.entries(updateFieldsRaw)) {
      if (v !== undefined) updateFields[k] = toNullIfEmpty(v);
    }

    // History rows only if new value provided and changed
    const newSummary = getFirstString(fields.summary);
    if (newSummary !== undefined && (existing?.summary ?? null) !== newSummary) {
      const { error: insertError } = await supabase.from("summaries").insert({
        summary: existing?.summary ?? null,
        record_id: id,
        email: getFirstString(fields.email) ?? null,
        name: getFirstString(fields.creator_name) ?? null,
      });
      if (insertError) return res.status(500).json({ error: insertError.message });
    }

    const newConclusion = getFirstString(fields.conclusion);
    if (newConclusion !== undefined && (existing?.conclusion ?? null) !== newConclusion) {
      const { error: insertConclusionError } = await supabase.from("conclusions").insert({
        conclusion: existing?.conclusion ?? null,
        record_id: id,
        email: getFirstString(fields.email) ?? null,
        name: getFirstString(fields.creator_name) ?? null,
      });
      if (insertConclusionError) return res.status(500).json({ error: insertConclusionError.message });
    }

    const { error: updateError } = await supabase.from("records").update(updateFields).eq("id", id);
    if (updateError) return res.status(500).json({ error: updateError.message });

    invalidateCache();
    return res.status(200).json({ id, pdf_url: pdfUrl, pdf_public_id: pdfPublicId });
  } catch (error: any) {
    console.error("upload-update error:", error);
    return res.status(500).json({ error: error?.message || "Server error" });
  }
}
