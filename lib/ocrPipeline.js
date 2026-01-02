import { createClient } from "@supabase/supabase-js";
import { v2 as cloudinary } from "cloudinary";
import path from "path";

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || "pdfs";
const ILOVEPDF_PUBLIC_KEY = process.env.ILOVEPDF_PUBLIC_KEY;
const ILOVEPDF_SECRET_KEY = process.env.ILOVEPDF_SECRET_KEY;
const ILOVEPDF_REGION = process.env.ILOVEPDF_REGION || "us";
const OCR_LANGUAGES = (process.env.ILOVEPDF_OCR_LANGUAGES || "eng")
  .split(",")
  .map((lang) => lang.trim())
  .filter(Boolean);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "",
  api_key: process.env.CLOUDINARY_API_KEY || "",
  api_secret: process.env.CLOUDINARY_API_SECRET || "",
  secure: true,
});

const supabase = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } }) : null;

function ensureSupabase() {
  if (!supabase) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
  return supabase;
}

function ensureCloudinaryConfig() {
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    throw new Error("Missing Cloudinary configuration (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET).");
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

function toAbsoluteUrl(possiblyRelative) {
  if (!possiblyRelative) return possiblyRelative;
  if (/^https?:\/\//i.test(possiblyRelative)) return possiblyRelative;
  try {
    return new URL(possiblyRelative, getBaseSiteUrl()).toString();
  } catch {
    return possiblyRelative;
  }
}

function splitPublicIdAndExt(publicId) {
  if (!publicId) return { base: null, ext: ".pdf" };
  const dot = publicId.lastIndexOf(".");
  if (dot === -1) return { base: publicId, ext: ".pdf" };
  const ext = publicId.slice(dot) || ".pdf";
  const base = publicId.slice(0, dot) || null;
  return { base, ext };
}

function deriveOriginalFilename(record) {
  if (record?.pdf_public_id) {
    const fileName = record.pdf_public_id.split("/").pop();
    if (fileName) return fileName;
  }
  if (record?.pdf_url) {
    try {
      const parsed = new URL(toAbsoluteUrl(record.pdf_url));
      const base = path.posix.basename(parsed.pathname) || null;
      if (base) return base.includes(".") ? base : `${base}.pdf`;
    } catch {
      // ignore
    }
  }
  return `record-${record?.id || "unknown"}.pdf`;
}

function deriveNewPublicId(record) {
  const { base, ext } = splitPublicIdAndExt(record?.pdf_public_id || `${CLOUDINARY_FOLDER}/record-${record?.id || "file"}.pdf`);
  const cleanBase = base || `${CLOUDINARY_FOLDER}/record-${record?.id || "file"}`;
  const withSuffix = cleanBase.endsWith("-ocr") ? cleanBase : `${cleanBase}-ocr`;
  return `${withSuffix}${ext || ".pdf"}`;
}

function buildViewerUrl(publicIdWithExt, version) {
  const params = new URLSearchParams({ id: publicIdWithExt });
  if (version) params.set("v", String(version));
  return `/api/pdf/view?${params.toString()}`;
}

async function fetchRecord(recordId) {
  const { data, error } = await ensureSupabase()
    .from("records")
    .select("id, pdf_url, pdf_public_id, title_name, name")
    .eq("id", recordId)
    .single();
  if (error) throw new Error(`Failed to load record ${recordId}: ${error.message}`);
  if (!data) throw new Error(`Record ${recordId} not found`);
  return data;
}

function buildCloudinaryRawUrl(publicIdWithExt) {
  return cloudinary.url(publicIdWithExt, {
    resource_type: "raw",
    type: "upload",
    sign_url: true,
    secure: true,
  });
}

function resolveSourcePdfUrl(record) {
  if (record?.pdf_public_id) return buildCloudinaryRawUrl(record.pdf_public_id);
  if (record?.pdf_url) return toAbsoluteUrl(record.pdf_url);
  throw new Error("Record has no pdf_url or pdf_public_id to fetch the PDF.");
}

async function downloadPdfBuffer(url) {
  const resp = await fetch(url);
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Failed to download PDF (${resp.status}): ${body || url}`);
  }
  return Buffer.from(await resp.arrayBuffer());
}

async function authenticateIlove() {
  if (!ILOVEPDF_PUBLIC_KEY || !ILOVEPDF_SECRET_KEY) {
    throw new Error("Missing ILOVEPDF_PUBLIC_KEY or ILOVEPDF_SECRET_KEY.");
  }

  const response = await fetch("https://api.ilovepdf.com/v1/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ public_key: ILOVEPDF_PUBLIC_KEY, secret_key: ILOVEPDF_SECRET_KEY }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.token) {
    throw new Error(`iLovePDF auth failed (${response.status}): ${data?.error || data?.message || "no token"}`);
  }
  return data.token;
}

async function startIloveTask(authToken) {
  const response = await fetch(`https://api.ilovepdf.com/v1/start/pdfocr/${ILOVEPDF_REGION}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${authToken}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.server || !data.task) {
    throw new Error(`iLovePDF start failed (${response.status}): ${data?.error || data?.message || "missing server/task"}`);
  }
  return { server: data.server, task: data.task };
}

async function uploadPdfToIlove(authToken, server, task, pdfBuffer, filename) {
  const form = new FormData();
  form.append("task", task);
  form.append("file", new Blob([pdfBuffer], { type: "application/pdf" }), filename || "file.pdf");

  const response = await fetch(`https://${server}/v1/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken}` },
    body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.server_filename) {
    throw new Error(`iLovePDF upload failed (${response.status}): ${data?.error || data?.message || "no server_filename"}`);
  }
  return data.server_filename;
}

async function processIloveTask(authToken, server, task, serverFilename, recordId, originalFilename) {
  const payload = {
    task,
    tool: "pdfocr",
    files: [
      {
        server_filename: serverFilename,
        filename: originalFilename || serverFilename,
      },
    ],
    ocr_languages: OCR_LANGUAGES,
    ignore_errors: true,
    try_pdf_repair: true,
    try_image_repair: true,
    output_filename: `record-${recordId}-ocr.pdf`,
  };

  const response = await fetch(`https://${server}/v1/process`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`iLovePDF process failed (${response.status}): ${data?.error || data?.message || "unknown error"}`);
  }
  return data;
}

async function downloadIloveResult(authToken, server, task) {
  const response = await fetch(`https://${server}/v1/download/${task}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`iLovePDF download failed (${response.status}): ${text || "no body"}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function uploadPdfBufferToCloudinary(buffer, publicIdWithExt) {
  const result = await new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw",
        public_id: publicIdWithExt,
        overwrite: true,
        invalidate: true,
        access_mode: "public",
      },
      (error, res) => (error || !res ? reject(error || new Error("Unknown Cloudinary error")) : resolve(res)),
    );
    upload.end(buffer);
  });

  return { publicIdWithExt, version: result.version };
}

async function deleteCloudinaryAsset(publicIdWithExt) {
  try {
    await cloudinary.uploader.destroy(publicIdWithExt.replace(/\.pdf$/i, ""), {
      resource_type: "raw",
      invalidate: true,
    });
  } catch (error) {
    console.warn("Warning: failed to delete old Cloudinary asset:", error);
  }
}

export async function runOcrForRecord({ recordId, deleteOldAsset = false, resetExtractedText = true, logger = console }) {
  if (!recordId) throw new Error("recordId is required");
  ensureCloudinaryConfig();

  logger.info?.(`Loading record ${recordId} from Supabase...`);
  const record = await fetchRecord(recordId);

  const sourceUrl = resolveSourcePdfUrl(record);
  logger.info?.(`Downloading PDF from ${sourceUrl}`);
  const pdfBuffer = await downloadPdfBuffer(sourceUrl);

  const authToken = await authenticateIlove();
  const { server, task } = await startIloveTask(authToken);
  logger.info?.(`Started iLovePDF task ${task} on ${server}`);

  const originalFilename = deriveOriginalFilename(record);
  const serverFilename = await uploadPdfToIlove(authToken, server, task, pdfBuffer, originalFilename);
  logger.info?.(`Uploaded to iLovePDF as ${serverFilename}`);

  await processIloveTask(authToken, server, task, serverFilename, recordId, originalFilename);
  logger.info?.("Processing on iLovePDF (OCR)...");

  const ocredBuffer = await downloadIloveResult(authToken, server, task);
  logger.info?.("Downloaded OCR result");

  const newPublicIdWithExt = deriveNewPublicId(record);
  const { publicIdWithExt, version } = await uploadPdfBufferToCloudinary(ocredBuffer, newPublicIdWithExt);
  const viewerUrl = buildViewerUrl(publicIdWithExt, version);
  logger.info?.(`Uploaded OCR PDF to Cloudinary at ${publicIdWithExt} (v${version})`);

  const updatePayload = {
    pdf_url: viewerUrl,
    pdf_public_id: publicIdWithExt,
    extracted_text: resetExtractedText ? null : undefined,
  };
  await ensureSupabase().from("records").update(updatePayload).eq("id", recordId).throwOnError();
  logger.info?.("Updated Supabase record with new PDF URL and public ID");

  if (deleteOldAsset && record.pdf_public_id && record.pdf_public_id !== publicIdWithExt) {
    await deleteCloudinaryAsset(record.pdf_public_id);
  }

  return {
    recordId,
    pdf_url: viewerUrl,
    pdf_public_id: publicIdWithExt,
    cloudinary_version: version,
    source_url: sourceUrl,
  };
}
