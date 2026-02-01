import path from "path";
import { UTApi, UTFile } from "uploadthing/server";

const DEFAULT_PDF_NAME = "file.pdf";
let cachedUtapi = null;

export function ensureUploadThingToken() {
  if (!process.env.UPLOADTHING_TOKEN) {
    throw new Error("Missing UPLOADTHING_TOKEN environment variable.");
  }
}

function getUtApi() {
  ensureUploadThingToken();
  if (!cachedUtapi) {
    cachedUtapi = new UTApi({ apiKey: process.env.UPLOADTHING_TOKEN });
  }
  return cachedUtapi;
}

function normalizeFilename(filename, fallback = DEFAULT_PDF_NAME) {
  const trimmed = (filename || "").trim();
  let name = trimmed || fallback;
  const ext = path.extname(name);
  if (!ext) name = `${name}.pdf`;
  return name;
}

function unwrapUploadResult(result, context) {
  const item = Array.isArray(result) ? result[0] : result;
  if (!item) {
    throw new Error(`${context} failed: empty response.`);
  }
  if (item.error) {
    const code = item.error.code;
    const message = item.error.message || code || "UploadThing error";
    const err = new Error(`${context} failed: ${message}`);
    err.code = code;
    err.data = item.error.data;
    throw err;
  }
  if (!item.data) {
    throw new Error(`${context} failed: missing data.`);
  }
  return item.data;
}

export function buildPdfFile(buffer, filename, options = {}) {
  const name = normalizeFilename(filename);
  return new UTFile([buffer], name, {
    type: "application/pdf",
    customId: options.customId,
  });
}

export async function uploadPdfBuffer(buffer, filename, options = {}) {
  const { customId, ...uploadOpts } = options;
  const utapi = getUtApi();
  const file = buildPdfFile(buffer, filename, { customId });
  const result = await utapi.uploadFiles(file, { contentDisposition: "inline", ...uploadOpts });
  return unwrapUploadResult(result, "UploadThing upload");
}

export async function uploadPdfFromUrl(url, filename, options = {}) {
  const { customId, ...uploadOpts } = options;
  const utapi = getUtApi();
  const target = filename
    ? { url, name: normalizeFilename(filename), customId }
    : { url, customId };
  const result = await utapi.uploadFilesFromUrl(target, { contentDisposition: "inline", ...uploadOpts });
  return unwrapUploadResult(result, "UploadThing uploadFromUrl");
}

export async function getUploadThingUrl(key) {
  if (!key) return null;
  const utapi = getUtApi();
  const res = await utapi.getFileUrls(key);
  const url = res?.data?.[0]?.url;
  return url || null;
}

export async function deleteUploadThingFile(key) {
  if (!key) return { success: false, deletedCount: 0 };
  const utapi = getUtApi();
  return utapi.deleteFiles(key);
}
