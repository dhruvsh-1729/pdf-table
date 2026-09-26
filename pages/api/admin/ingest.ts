import type { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import fs from "fs/promises";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureUploadThingToken, uploadPdfBuffer } from "@/lib/uploadthing";
import { requireSuperAdmin } from "@/lib/auth/server";

// Queue a whole magazine issue for automatic ingestion (ops/ingest-issue.mjs, run by the ops-cron service).
// GET  -> recent ingest jobs
// POST -> multipart: file (issue PDF), magazine_id, volume, number, date, langs
export const config = { api: { bodyParser: false } };

const LANGS = new Set(["eng", "hin", "guj", "eng+hin", "eng+guj", "hin+guj", "eng+hin+guj"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = await requireSuperAdmin(req, res);
  if (!admin) return;
  res.setHeader("Cache-Control", "private, no-store");

  if (req.method === "GET") {
    const { data, error } = await supabaseAdmin
      .from("jobs")
      .select("id, status, payload, attempts, last_error, result, created_at, updated_at")
      .eq("type", "ingest_issue")
      .order("id", { ascending: false })
      .limit(30);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ jobs: data });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const form = formidable({ maxFileSize: 250 * 1024 * 1024, maxFiles: 1 });
  let fields: formidable.Fields, files: formidable.Files;
  try {
    [fields, files] = await form.parse(req);
  } catch (err: any) {
    return res.status(400).json({ error: `Upload failed: ${err?.message ?? err}` });
  }
  const one = (v: string[] | undefined) => (v?.[0] ?? "").trim();
  const magazineId = Number(one(fields.magazine_id));
  const date = one(fields.date);
  const langs = one(fields.langs) || "eng";
  const file = files.file?.[0];
  if (!file) return res.status(400).json({ error: "Choose the issue PDF" });
  if (!Number.isInteger(magazineId)) return res.status(400).json({ error: "Choose a magazine" });
  if (!date) return res.status(400).json({ error: "Issue date is required, e.g. 'July 1976'" });
  if (!LANGS.has(langs)) return res.status(400).json({ error: "Invalid OCR language" });

  const { data: magazine } = await supabaseAdmin.from("magazines").select("id, name").eq("id", magazineId).maybeSingle();
  if (!magazine) return res.status(400).json({ error: "Unknown magazine" });

  try {
    ensureUploadThingToken();
    const buffer = await fs.readFile(file.filepath);
    if (buffer.subarray(0, 5).toString() !== "%PDF-") return res.status(400).json({ error: "That file is not a PDF" });
    const upload = await uploadPdfBuffer(buffer, `issue_${magazine.id}_${Date.now()}.pdf`);
    const payload = {
      pdf_url: upload.ufsUrl ?? upload.url,
      pdf_key: upload.key,
      magazine_id: magazine.id,
      magazine_name: magazine.name,
      volume: one(fields.volume) || null,
      number: one(fields.number) || null,
      date,
      langs,
      original_filename: file.originalFilename,
      queued_by: admin.email,
    };
    const { data: job, error } = await supabaseAdmin
      .from("jobs")
      .insert({
        type: "ingest_issue",
        payload,
        dedupe_key: `ingest:${magazine.id}:${payload.volume ?? ""}:${payload.number ?? ""}:${date}`.toLowerCase(),
      })
      .select("id")
      .single();
    if (error) {
      const dup = error.code === "23505";
      return res.status(dup ? 409 : 500).json({ error: dup ? "This issue is already queued or ingested." : error.message });
    }
    return res.status(201).json({ success: true, jobId: job.id });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "Failed to queue issue" });
  } finally {
    await fs.unlink(file.filepath).catch(() => undefined);
  }
}
