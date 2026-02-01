import type { NextApiRequest, NextApiResponse } from "next";
import formidable, { File } from "formidable";
import fs from "fs/promises";
import path from "path";
import { uploadWithCompressFallback } from "@/lib/ocrPipeline";
import { ensureUploadThingToken } from "@/lib/uploadthing";

export const config = {
  api: { bodyParser: false, sizeLimit: "150mb" },
};

const LIGHTPDF_API_KEY = process.env.LIGHTPDF_API_KEY;

function ensureEnv() {
  if (!LIGHTPDF_API_KEY) throw new Error("Missing LIGHTPDF_API_KEY");
  ensureUploadThingToken();
}

function getPdfExt(originalFilename?: string | null) {
  const e = (originalFilename && path.extname(originalFilename)) || ".pdf";
  return e || ".pdf";
}

function sanitizeFilenameSegment(value: string) {
  const safe = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return safe || "pdf";
}

async function parseForm(req: NextApiRequest): Promise<{ pdf: File }> {
  const form = formidable({ multiples: false, maxFileSize: 150 * 1024 * 1024 });
  return new Promise((resolve, reject) => {
    form.parse(req, (err, _fields, files) => {
      if (err) return reject(err);
      const pdfAny = files.pdf as File | File[] | undefined;
      const pdf = Array.isArray(pdfAny) ? pdfAny[0] : pdfAny;
      if (!pdf) return reject(new Error("Missing PDF file"));
      resolve({ pdf });
    });
  });
}

async function createTask(pdfBuffer: Buffer, filename = "input.pdf") {
  const form = new FormData();
  form.append("format", "doc-repair");
  form.append("file", new Blob([new Uint8Array(pdfBuffer)], { type: "application/pdf" }), filename);

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    ensureEnv();
    const { pdf } = await parseForm(req);
    const originalFilename = pdf.originalFilename || "merged.pdf";
    const ext = getPdfExt(originalFilename);
    const base = sanitizeFilenameSegment(path.basename(originalFilename, ext));
    const fileBuffer = await fs.readFile(pdf.filepath);

    const sourceUpload = await uploadWithCompressFallback(
      fileBuffer,
      `${base || "merged"}-merged${ext}`,
      originalFilename,
      { logger: console },
    );
    const sourceUrl = sourceUpload.ufsUrl || sourceUpload.url;

    const taskId = await createTask(fileBuffer, originalFilename);
    const taskData = await pollTask(taskId);
    if (!taskData?.file) throw new Error("LightPDF returned no file URL.");
    const cleanedBuffer = await downloadResult(taskData.file);

    const cleanedUpload = await uploadWithCompressFallback(
      cleanedBuffer,
      `${base || "merged"}-clean${ext}`,
      originalFilename,
      { logger: console },
    );
    const cleanedUrl = cleanedUpload.ufsUrl || cleanedUpload.url;
    if (!cleanedUrl) throw new Error("UploadThing returned no URL for the cleaned PDF.");

    return res.status(200).json({
      source_url: sourceUrl,
      source_key: sourceUpload.key,
      cleaned_url: cleanedUrl,
      cleaned_key: cleanedUpload.key,
      compression_events: cleanedUpload.compression_events,
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
