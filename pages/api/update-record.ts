// pages/api/records/upload-update.ts
import type { NextApiRequest, NextApiResponse } from "next";
import formidable, { File } from "formidable";
import fs from "fs/promises";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { v2 as cloudinary, UploadApiResponse } from "cloudinary";
import { invalidateCache } from "./records-paginated";

export const config = {
  api: { bodyParser: false, sizeLimit: "150mb" },
};

const supabase = createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "",
  api_key: process.env.CLOUDINARY_API_KEY || "",
  api_secret: process.env.CLOUDINARY_API_SECRET || "",
  secure: true,
});

const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || "pdfs";

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
function buildViewerUrl(publicIdWithExt: string, version?: number | string) {
  const params = new URLSearchParams({ id: publicIdWithExt });
  if (version) params.set("v", String(version));
  return `/api/pdf/view?${params.toString()}`;
}
function publicIdAndExtFromUrl(url?: string | null): { pid: string | null; ext: string } {
  if (!url) return { pid: null, ext: ".pdf" };
  try {
    const u = new URL(url, "https://dummy.example"); // tolerate relative links
    const pathname = u.pathname;
    if (pathname.includes("/raw/upload/")) {
      // Cloudinary direct link form
      const parts = pathname.split("/").filter(Boolean);
      const uploadIdx = parts.findIndex((p) => p === "upload");
      if (uploadIdx === -1) return { pid: null, ext: ".pdf" };
      let rest = parts.slice(uploadIdx + 1);
      while (rest.length && !rest[0].startsWith("v") && rest[0].includes("_")) rest = rest.slice(1);
      if (rest[0]?.startsWith("v") && /^\d+$/.test(rest[0].slice(1))) rest = rest.slice(1);
      if (!rest.length) return { pid: null, ext: ".pdf" };
      const last = rest[rest.length - 1];
      const dot = last.lastIndexOf(".");
      const ext = dot >= 0 ? last.slice(dot) : ".pdf";
      const nameNoExt = dot >= 0 ? last.slice(0, dot) : last;
      const folder = rest.length > 1 ? rest.slice(0, -1).join("/") : "";
      const pid = folder ? `${folder}/${nameNoExt}` : nameNoExt;
      return { pid, ext: ext || ".pdf" };
    }
    // If it's our proxy URL already: /api/pdf/view?id=pdfs/xxx.pdf
    if (pathname.endsWith("/api/pdf/view")) {
      const id = u.searchParams.get("id");
      if (id && id.endsWith(".pdf")) return { pid: id.replace(/^\//, ""), ext: ".pdf" };
    }
    return { pid: null, ext: ".pdf" };
  } catch {
    return { pid: null, ext: ".pdf" };
  }
}

async function uploadPdfBufferToCloudinary(buffer: Buffer, baseName: string, ext: string) {
  const public_id = `${CLOUDINARY_FOLDER}/${baseName}${ext}`;
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

  const form = formidable({ multiples: true, maxFileSize: 150 * 1024 * 1024 });

  try {
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

    // If a new file is posted, upload to Cloudinary & delete old
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

      const { publicIdWithExt, version } = await uploadPdfBufferToCloudinary(fileBuffer, baseId, ext);
      pdfPublicId = publicIdWithExt; // e.g. "pdfs/foo-123.pdf"
      pdfUrl = buildViewerUrl(publicIdWithExt, version);

      // Delete old asset from Cloudinary if we can derive previous pid
      const { pid: oldPid } = publicIdAndExtFromUrl(existing?.pdf_url ?? null);
      if (oldPid) {
        try {
          await cloudinary.uploader.destroy(oldPid, { resource_type: "raw", invalidate: true });
        } catch (e) {
          console.warn("Warning: failed to delete old Cloudinary asset:", e);
        }
      }
    } else if (pdfPublicId) {
      // No new file: ensure url is our viewer
      pdfUrl = buildViewerUrl(pdfPublicId);
    }

    // Build selective update payload
    const updateFieldsRaw = {
      name: getFirstString(fields.name),
      summary: getFirstString(fields.summary),
      pdf_url: pdfUrl, // viewer URL
      pdf_public_id: pdfPublicId, // store public id with .pdf
      volume: getFirstString(fields.volume),
      number: getFirstString(fields.number),
      title_name: getFirstString(fields.title_name),
      page_numbers: getFirstString(fields.page_numbers),
      authors: getFirstString(fields.authors),
      language: getFirstString(fields.language),
      timestamp: getFirstString(fields.timestamp),
      conclusion: getFirstString(fields.conclusion),
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
