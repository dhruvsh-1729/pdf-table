#!/usr/bin/env node

/**
 * Fetch a PDF for a Supabase record by id and remove its watermark via LightPDF.
 *
 * Usage:
 *   node --env-file=.env scripts/watermark-remove.mjs --id=123 [--out=output.pdf] [--key=YOUR_KEY]
 *
 * Requirements:
 * - LIGHTPDF_API_KEY env var (or pass --key).
 * - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to fetch the record.
 * - If the record has pdf_public_id and no pdf_url, the script will resolve it via UploadThing.
 * - Saves the processed PDF next to this script by default.
 */

import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { getUploadThingUrl } from "../lib/uploadthing.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_BASE = "https://techhk.aoscdn.com";
const CREATE_URL = `${API_BASE}/api/tasks/document/conversion`;
const STATE_DONE = 1;

/* -----------------------------
 * CLI args
 * ----------------------------- */

function getArg(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

function parseArgs() {
  const idArg = getArg("id") || getArg("record") || getArg("record-id");
  const recordId = idArg ? Number(idArg) : NaN;
  if (!Number.isFinite(recordId)) throw new Error("Please provide a numeric record id via --id=<record-id>.");

  const out = getArg("out");
  const apiKey = getArg("key") || process.env.LIGHTPDF_API_KEY;
  if (!apiKey) throw new Error("Missing LIGHTPDF_API_KEY (set env or pass --key=...).");

  return { recordId, out, apiKey };
}

/* -----------------------------
 * Supabase helpers
 * ----------------------------- */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });


function getBaseSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ||
    `http://localhost:${process.env.PORT || 3000}`
  );
}

async function resolvePdfUrl(record) {
  const pdfUrl = record?.pdf_url;
  if (pdfUrl) {
    if (/^https?:\/\//i.test(pdfUrl)) return pdfUrl;
    try {
      return new URL(pdfUrl, getBaseSiteUrl()).toString();
    } catch {
      return pdfUrl;
    }
  }

  if (record?.pdf_public_id && process.env.UPLOADTHING_TOKEN) {
    return await getUploadThingUrl(record.pdf_public_id);
  }

  return null;
}

async function fetchRecord(recordId) {
  const { data, error } = await supabase
    .from("records")
    .select("id, pdf_url, pdf_public_id")
    .eq("id", recordId)
    .single();

  if (error) throw new Error(`Failed to load record ${recordId}: ${error.message}`);
  if (!data) throw new Error(`Record ${recordId} not found`);
  return data;
}

/* -----------------------------
 * LightPDF helpers
 * ----------------------------- */

async function downloadPdf(url) {
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Failed to download PDF (${resp.status}): ${text || url}`);
  }
  const buffer = Buffer.from(await resp.arrayBuffer());
  if (!buffer.length) throw new Error("Downloaded PDF is empty.");
  return buffer;
}

async function createTask(pdfBuffer, apiKey, filename = "input.pdf") {
  const form = new FormData();
  form.append("format", "doc-repair"); // documented format for watermark removal
  form.append("file", new Blob([pdfBuffer], { type: "application/pdf" }), filename);

  const resp = await fetch(CREATE_URL, {
    method: "POST",
    headers: { "X-API-KEY": apiKey },
    body: form,
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data?.status !== 200 || !data?.data?.task_id) {
    throw new Error(`LightPDF create task failed (${resp.status}): ${data?.message || "no task_id"}`);
  }
  return data.data.task_id;
}

async function pollTask(taskId, apiKey, { intervalMs = 1000, timeoutMs = 45000 } = {}) {
  const start = Date.now();
  while (true) {
    const resp = await fetch(`${CREATE_URL}/${taskId}`, {
      method: "GET",
      headers: { "X-API-KEY": apiKey },
    });
    const data = await resp.json().catch(() => ({}));

    if (!resp.ok || data?.status !== 200) {
      throw new Error(`LightPDF poll failed (${resp.status}): ${data?.message || "unknown error"}`);
    }

    const state = data?.data?.state;
    if (state === STATE_DONE) return data.data;
    if (typeof state === "number" && state < 0) {
      throw new Error(`LightPDF task failed (state=${state})`);
    }

    if (Date.now() - start > timeoutMs) {
      throw new Error("LightPDF poll timed out.");
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

async function downloadResult(fileUrl) {
  const resp = await fetch(fileUrl);
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Failed to download processed PDF (${resp.status}): ${text || fileUrl}`);
  }
  const buffer = Buffer.from(await resp.arrayBuffer());
  if (!buffer.length) throw new Error("Processed PDF is empty.");
  return buffer;
}

/* -----------------------------
 * Main
 * ----------------------------- */

async function main() {
  try {
    const { recordId, out, apiKey } = parseArgs();

    console.log(`Loading record ${recordId} from Supabase...`);
    const record = await fetchRecord(recordId);

    const pdfUrl = await resolvePdfUrl(record);
    if (!pdfUrl) throw new Error("Record has no pdf_url or pdf_public_id.");

    const inputName = new URL(pdfUrl, "http://dummy").pathname.split("/").pop() || `record-${recordId}.pdf`;
    const outputPath = path.resolve(out || path.join(__dirname, `watermark-removed-${Date.now()}.pdf`));

    console.log(`Downloading PDF from ${pdfUrl} ...`);
    const pdfBuffer = await downloadPdf(pdfUrl);
    console.log(`Downloaded ${pdfBuffer.length.toLocaleString()} bytes.`);

    console.log("Creating LightPDF task (watermark removal)...");
    const taskId = await createTask(pdfBuffer, apiKey, inputName);
    console.log(`Task ID: ${taskId}. Polling for completion...`);

    const taskData = await pollTask(taskId, apiKey);
    if (!taskData?.file) throw new Error("LightPDF returned no file URL.");
    console.log("Task completed. Downloading cleaned PDF...");

    const cleanedBuffer = await downloadResult(taskData.file);
    await fs.writeFile(outputPath, cleanedBuffer);

    console.log(`Done. Saved cleaned PDF to: ${outputPath}`);
  } catch (err) {
    console.error("Error:", err?.message || err);
    process.exit(1);
  }
}

main();
