#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { getUploadThingUrl } from "../lib/uploadthing.js";
import dotenv from "dotenv";

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
if (!process.env.UPLOADTHING_TOKEN) {
  console.warn("UPLOADTHING_TOKEN missing; will fall back to pdf_url only when possible.");
}

async function runSql(statement) {
  const endpoints = [
    `${SUPABASE_URL}/rest/v1/rpc/execute_sql`,
    `${SUPABASE_URL}/rest/v1/rpc/exec_sql`,
    `${SUPABASE_URL}/rest/v1/rpc/sql`,
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "tx=commit",
        },
        body: JSON.stringify({ query: statement, sql: statement }),
      });

      if (response.ok) {
        console.log(`Executed SQL via ${endpoint}`);
        return true;
      }

      const text = await response.text();
      console.warn(`SQL endpoint ${endpoint} responded with ${response.status}: ${text}`);
    } catch (error) {
      console.warn(`Failed to call SQL endpoint ${endpoint}:`, error.message);
    }
  }

  return false;
}

async function ensureColumnExists() {
  const sql = `
    alter table if exists public.records
    add column if not exists extracted_text text;
  `;

  const success = await runSql(sql);

  if (!success) {
    console.warn(
      "Could not verify column creation via HTTP SQL endpoint. If this fails, create the column manually with:\n" +
        sql.trim(),
    );
  }
}

async function loadPdfGetDocument() {
  const globalAny = globalThis;

  if (!globalAny.DOMMatrix || !globalAny.Path2D || !globalAny.ImageData) {
    try {
      const canvas = await import("@napi-rs/canvas");
      if (!globalAny.DOMMatrix && canvas.DOMMatrix) globalAny.DOMMatrix = canvas.DOMMatrix;
      if (!globalAny.Path2D && canvas.Path2D) globalAny.Path2D = canvas.Path2D;
      if (!globalAny.ImageData && canvas.ImageData) globalAny.ImageData = canvas.ImageData;
    } catch (error) {
      console.warn("Canvas polyfills unavailable; PDF text extraction may fail.", error);
    }
  }

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const getDocument = pdfjs.getDocument || pdfjs.default?.getDocument;

  if (!getDocument) {
    throw new Error("PDF parser is not available in this environment.");
  }

  return getDocument;
}

async function extractTextFromPdf(data) {
  const getDocument = await loadPdfGetDocument();

  const loadingTask = getDocument({ data, disableWorker: true });
  const pdf = await loadingTask.promise;
  await new Promise((resolve) => setTimeout(resolve, 4000)); // allow load/render to settle
  let fullText = "";
  let glyphCount = 0;

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex++) {
    const page = await pdf.getPage(pageIndex);
    const textContent = await page.getTextContent();
    glyphCount += textContent.items?.length || 0;

    const pageText = textContent.items
      .map((item) => {
        const str = typeof item.str === "string" ? item.str : "";
        return item.hasEOL ? `${str}\n` : `${str} `;
      })
      .join("")
      .replace(/[ \t]+\n/g, "\n")
      .trimEnd();

    fullText += pageText;
    if (pageIndex < pdf.numPages) {
      fullText += "\n\n";
    }
  }

  return {
    text: fullText.replace(/\u0000/g, "").trim(),
    glyphCount,
  };
}

async function resolvePdfUrl(record) {
  const pdfUrl = record?.pdf_url;
  if (pdfUrl) {
    if (!pdfUrl.startsWith("http")) {
      const base =
        process.env.NEXT_PUBLIC_SITE_URL ||
        process.env.SITE_URL ||
        process.env.NEXTAUTH_URL ||
        `http://localhost:${process.env.PORT || 3000}`;

      try {
        return new URL(pdfUrl, base).toString();
      } catch {
        return pdfUrl;
      }
    }

    return pdfUrl;
  }

  if (record?.pdf_public_id && process.env.UPLOADTHING_TOKEN) {
    return await getUploadThingUrl(record.pdf_public_id);
  }

  return null;
}

async function fetchAllRecords() {
  const records = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("records")
      .select("id, pdf_url, pdf_public_id, extracted_text")
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    records.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return records;
}

async function main() {
  const force = process.argv.includes("--force");
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : Infinity;
  const verbose = process.argv.includes("--verbose");

  await ensureColumnExists();

  const records = await fetchAllRecords();
  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const record of records) {
    if (processed >= limit) break;
    if (!force && record.extracted_text) {
      skipped++;
      continue;
    }

    const pdfUrl = await resolvePdfUrl(record);
    if (!pdfUrl) {
      console.warn(`Skipping record ${record.id}: missing pdf url/public id`);
      failed++;
      continue;
    }

    try {
      const response = await fetch(pdfUrl);
      if (!response.ok) throw new Error(`Failed to fetch PDF: ${response.status}`);

      const pdfBytes = new Uint8Array(await response.arrayBuffer());
      const { text, glyphCount } = await extractTextFromPdf(pdfBytes);

      if (verbose) {
        console.log("\n--- Extracted text for record", record.id, "---");
        console.log(text ? text.slice(0, 2000) : "[no text]");
        console.log("--- end excerpt ---");
      }

      const { error: updateError } = await supabase
        .from("records")
        .update({ extracted_text: text })
        .eq("id", record.id);
      if (updateError) throw updateError;

      processed++;
      console.log(
        `✅ Stored extracted text for record ${record.id} (chars=${text?.length || 0}, glyphs=${glyphCount})`,
      );
    } catch (error) {
      failed++;
      console.error(`❌ Failed to process record ${record.id}:`, error.message || error);
    }
  }

  console.log(
    `\nFinished. Updated ${processed} record(s), skipped ${skipped} with existing text, ${failed} failed. (limit: ${
      Number.isFinite(limit) ? limit : "none"
    })`,
  );
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
