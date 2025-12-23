#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

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

async function extractTextFromPdf(buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.js");
  const getDocument = pdfjs.getDocument || pdfjs.default?.getDocument;

  if (!getDocument) {
    throw new Error("PDF parser is not available in this environment.");
  }

  const loadingTask = getDocument({ data: buffer, disableWorker: true });
  const pdf = await loadingTask.promise;
  let fullText = "";

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex++) {
    const page = await pdf.getPage(pageIndex);
    const textContent = await page.getTextContent();

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

  return fullText.replace(/\u0000/g, "").trim();
}

function resolvePdfUrl(pdfUrl) {
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

async function fetchAllRecords() {
  const records = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("records")
      .select("id, pdf_url, extracted_text")
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

    if (!record.pdf_url) {
      console.warn(`Skipping record ${record.id}: missing pdf_url`);
      failed++;
      continue;
    }

    try {
      const pdfUrl = resolvePdfUrl(record.pdf_url);
      const response = await fetch(pdfUrl);
      if (!response.ok) throw new Error(`Failed to fetch PDF: ${response.status}`);

      const buffer = Buffer.from(await response.arrayBuffer());
      const text = await extractTextFromPdf(buffer);

      await supabase.from("records").update({ extracted_text: text }).eq("id", record.id).throwOnError();
      processed++;
      console.log(`✅ Stored extracted text for record ${record.id}`);
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
