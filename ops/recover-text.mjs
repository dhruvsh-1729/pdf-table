// ops/recover-text.mjs — fill records.extracted_text where it is missing or garbled.
//
// For each target record: download its PDF, try the embedded text layer
// (pdftotext); if that fails the quality check, OCR page images with Tesseract.
// Writes only when the new text passes the quality check and beats the old one.
// Needs poppler-utils (pdftotext, pdftoppm, pdfinfo) and tesseract with eng/hin/guj.
//
//   node --env-file=../.env recover-text.mjs [--limit=N] [--concurrency=6] [--ids=1,2] [--dry-run]
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { db, trackRun, waitForHealthySite } from "./lib.mjs";
import { textQuality } from "./pipeline/quality.mjs";

const run = promisify(execFile);
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const LIMIT = Number(args.limit ?? 100000);
const CONCURRENCY = Number(args.concurrency ?? 6);
const MAX_OCR_PAGES = Number(args["max-pages"] ?? 80);
const DRY = Boolean(args["dry-run"]);

const RANK = { missing: 0, garbled: 1, partial: 2, good: 3 };

function tesseractLangs(languageLegacy) {
  const l = (languageLegacy ?? "").toLowerCase();
  const langs = new Set();
  if (/english/.test(l) || !l) langs.add("eng");
  if (/hindi|sanskrit|prakrit|marathi|apabhra/.test(l)) langs.add("hin");
  if (/gujarati/.test(l)) langs.add("guj");
  if (!langs.size) langs.add("eng");
  return [...langs].join("+");
}

async function extract(record) {
  const dir = await mkdtemp(path.join(tmpdir(), `rec-${record.id}-`));
  try {
    const res = await fetch(record.pdf_url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`download ${res.status}`);
    const pdf = path.join(dir, "in.pdf");
    await writeFile(pdf, Buffer.from(await res.arrayBuffer()));

    // 1. Embedded text layer.
    const { stdout: layer } = await run("pdftotext", ["-enc", "UTF-8", pdf, "-"], { maxBuffer: 64 << 20 }).catch(() => ({ stdout: "" }));
    const layerText = layer.replace(/\f/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
    if (textQuality(layerText) === "good" || textQuality(layerText) === "partial") {
      return { text: layerText, source: "pdf_text_layer" };
    }

    // 2. OCR.
    const { stdout: info } = await run("pdfinfo", [pdf]);
    const pages = Number(info.match(/Pages:\s+(\d+)/)?.[1] ?? 0);
    const last = Math.min(pages, MAX_OCR_PAGES);
    if (!last) throw new Error("no pages");
    await run("pdftoppm", ["-r", "200", "-gray", "-png", "-f", "1", "-l", String(last), pdf, path.join(dir, "p")], {
      timeout: 600_000,
    });
    const images = (await readdir(dir)).filter((f) => f.startsWith("p") && f.endsWith(".png")).sort();
    const langs = tesseractLangs(record.language_legacy);
    const parts = [];
    for (const img of images) {
      const { stdout } = await run("tesseract", [path.join(dir, img), "-", "-l", langs, "--psm", "3"], {
        env: { ...process.env, OMP_THREAD_LIMIT: "1" },
        maxBuffer: 16 << 20,
        timeout: 180_000,
      });
      parts.push(stdout.trim());
    }
    return { text: parts.join("\n\n").trim(), source: "ocr_tesseract", pages, ocrPages: images.length, langs };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  let query = db
    .from("records")
    .select("id, pdf_url, language_legacy, extracted_text, text_quality, magazine_id, magazines!inner(is_active)")
    .in("text_quality", ["missing", "garbled"])
    .eq("magazines.is_active", true)
    .like("pdf_url", "http%")
    .order("id")
    .limit(LIMIT);
  if (args.ids) query = query.in("id", String(args.ids).split(",").map(Number));
  const { data: targets, error } = await query;
  if (error) throw error;
  console.log(`[recover-text] ${targets.length} targets, concurrency ${CONCURRENCY}${DRY ? " (dry run)" : ""}`);

  const stats = { improved: 0, unchanged: 0, failed: 0, bySource: {}, byQuality: {} };
  let cursor = 0;
  async function worker() {
    while (cursor < targets.length) {
      await waitForHealthySite();
      const record = targets[cursor++];
      try {
        const out = await extract(record);
        const q = textQuality(out.text);
        if (RANK[q] > RANK[record.text_quality ?? "missing"]) {
          if (!DRY) {
            const { error: upErr } = await db
              .from("records")
              .update({ extracted_text: out.text, text_quality: q, text_source: out.source })
              .eq("id", record.id);
            if (upErr) throw upErr;
          }
          stats.improved += 1;
          stats.bySource[out.source] = (stats.bySource[out.source] ?? 0) + 1;
          stats.byQuality[q] = (stats.byQuality[q] ?? 0) + 1;
          console.log(`#${record.id} ${record.text_quality} -> ${q} via ${out.source} (${out.text.length} chars${out.langs ? `, ${out.langs}` : ""})`);
        } else {
          stats.unchanged += 1;
          console.log(`#${record.id} unchanged (${q} via ${out.source}, ${out.text.length} chars)`);
        }
      } catch (err) {
        stats.failed += 1;
        console.log(`#${record.id} FAILED: ${err.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return { summary: `${stats.improved} improved, ${stats.unchanged} unchanged, ${stats.failed} failed of ${targets.length}`, details: stats };
}

trackRun("recover-text", main, { actor: process.env.OPS_ACTOR || "manual" })
  .then((r) => console.log(`[recover-text] ${r.summary}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
