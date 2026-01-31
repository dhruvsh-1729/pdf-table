import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { v2 as cloudinary } from "cloudinary";
import { uploadWithCompressFallback } from "@/lib/ocrPipeline";

const LIGHTPDF_API_KEY = process.env.LIGHTPDF_API_KEY;
const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || "pdfs";

if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

function ensureEnv() {
  if (!LIGHTPDF_API_KEY) throw new Error("Missing LIGHTPDF_API_KEY");
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    throw new Error("Missing Cloudinary configuration.");
  }
}

function getBaseSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ||
    `http://localhost:${process.env.PORT || 3000}`
  );
}

function buildCloudinaryRawUrl(publicIdWithExt: string) {
  return cloudinary.url(publicIdWithExt, {
    resource_type: "raw",
    type: "upload",
    sign_url: true,
    secure: true,
  });
}

function resolvePdfUrl(record: any) {
  if (record?.pdf_public_id) return buildCloudinaryRawUrl(record.pdf_public_id);
  const pdfUrl = record?.pdf_url;
  if (!pdfUrl) return null;
  if (/^https?:\/\//i.test(pdfUrl)) return pdfUrl;
  try {
    return new URL(pdfUrl, getBaseSiteUrl()).toString();
  } catch {
    return pdfUrl;
  }
}

async function downloadPdfBuffer(url: string) {
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Failed to download PDF (${resp.status}): ${text || url}`);
  }
  return Buffer.from(await resp.arrayBuffer());
}

async function createTask(pdfBuffer: Buffer, filename = "input.pdf") {
  const form = new FormData();
  form.append("format", "doc-repair");
  form.append("file", new Blob([pdfBuffer], { type: "application/pdf" }), filename);

  const resp = await fetch("https://techhk.aoscdn.com/api/tasks/document/conversion", {
    method: "POST",
    headers: { "X-API-KEY": LIGHTPDF_API_KEY || "" },
    body: form,
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data?.status !== 200 || !data?.data?.task_id) {
    throw new Error(`LightPDF create task failed (${resp.status}): ${data?.message || "no task_id"}`);
  }
  return data.data.task_id as string;
}

async function pollTask(taskId: string, { intervalMs = 1000, timeoutMs = 45000 } = {}) {
  const start = Date.now();
  while (true) {
    const resp = await fetch(`https://techhk.aoscdn.com/api/tasks/document/conversion/${taskId}`, {
      method: "GET",
      headers: { "X-API-KEY": LIGHTPDF_API_KEY || "" },
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data?.status !== 200) {
      throw new Error(`LightPDF poll failed (${resp.status}): ${data?.message || "unknown error"}`);
    }

    const state = data?.data?.state;
    if (state === 1) return data.data;
    if (typeof state === "number" && state < 0) throw new Error(`LightPDF task failed (state=${state})`);
    if (Date.now() - start > timeoutMs) throw new Error("LightPDF poll timed out.");
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

async function downloadResult(fileUrl: string) {
  const resp = await fetch(fileUrl);
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Failed to download processed PDF (${resp.status}): ${text || fileUrl}`);
  }
  return Buffer.from(await resp.arrayBuffer());
}

function splitPublicIdAndExt(publicId?: string | null) {
  if (!publicId) return { base: null, ext: ".pdf" };
  const dot = publicId.lastIndexOf(".");
  if (dot === -1) return { base: publicId, ext: ".pdf" };
  return { base: publicId.slice(0, dot), ext: publicId.slice(dot) || ".pdf" };
}

function deriveCleanPublicId(record: any) {
  const { base, ext } = splitPublicIdAndExt(
    record?.pdf_public_id || `${CLOUDINARY_FOLDER}/record-${record?.id || "file"}.pdf`,
  );
  const cleanBase = base || `${CLOUDINARY_FOLDER}/record-${record?.id || "file"}`;
  const withSuffix = cleanBase.endsWith("-clean") ? cleanBase : `${cleanBase}-clean`;
  return `${withSuffix}${ext || ".pdf"}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    ensureEnv();
    const id = Number(req.body?.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid record id." });

    const { data: record, error } = await supabaseAdmin
      .from("records")
      .select("id, pdf_url, pdf_public_id")
      .eq("id", id)
      .single();

    if (error) throw new Error(`Failed to load record ${id}: ${error.message}`);
    if (!record) return res.status(404).json({ error: "Record not found." });

    const sourceUrl = resolvePdfUrl(record);
    if (!sourceUrl) return res.status(400).json({ error: "Record has no pdf_url or pdf_public_id." });

    const pdfBuffer = await downloadPdfBuffer(sourceUrl);
    const inputName = new URL(sourceUrl, "http://dummy").pathname.split("/").pop() || `record-${id}.pdf`;

    const taskId = await createTask(pdfBuffer, inputName);
    const taskData = await pollTask(taskId);
    if (!taskData?.file) throw new Error("LightPDF returned no file URL.");
    const cleanedBuffer = await downloadResult(taskData.file);

    const newPublicId = deriveCleanPublicId(record);
    const { publicIdWithExt, version, compression_events } = await uploadWithCompressFallback(
      cleanedBuffer,
      newPublicId,
      inputName,
      { logger: console },
    );
    const viewerUrl = buildCloudinaryRawUrl(publicIdWithExt);

    await supabaseAdmin
      .from("records")
      .update({ pdf_url: viewerUrl, pdf_public_id: publicIdWithExt })
      .eq("id", id)
      .throwOnError();

    const compressionCount =
      compression_events?.filter((evt) => evt?.type === "compression-start" || evt?.from_compression)?.length || 0;
    const hasCompression = compressionCount > 0;

    return res.status(200).json({
      recordId: id,
      pdf_url: viewerUrl,
      pdf_public_id: publicIdWithExt,
      source_url: sourceUrl,
      cloudinary_version: version,
      compression_events: hasCompression ? compression_events : undefined,
    });
  } catch (err: any) {
    const message = err?.message || "Watermark removal failed.";
    const payload: Record<string, any> = { error: message };
    if (err?.compression_events || err?.compressionEvents) {
      payload.compression_events = err.compression_events || err.compressionEvents;
    }
    return res.status(500).json(payload);
  }
}
