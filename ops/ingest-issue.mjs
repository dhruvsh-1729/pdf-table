// ops/ingest-issue.mjs — ingest a full magazine issue PDF with no human in the loop.
//
//   pages -> segment (article boundaries) -> split -> per piece: metadata, summary, conclusion,
//   audit (re-write once if it fails), subjects -> publish (UploadThing + one DB transaction)
//
// Front/back matter (covers, contents, adverts) is not published. Pieces already present for the same
// magazine/volume/number/title are skipped, so re-running an issue is safe.
//
//   node --env-file=../.env ingest-issue.mjs --pdf=<path|url> --magazine-id=1 --volume=XI --number=1 --date="July 1976"
//        [--langs=eng|eng+hin|hin|guj] [--dry-run] [--out=<dir>] [--budget-inr=40] [--include-front-matter]
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { db, trackRun } from "./lib.mjs";
import { AI_MODEL, BudgetExceeded, createAi } from "./ai.mjs";
import { extractPages } from "./pipeline/pages.mjs";
import { segmentIssue } from "./pipeline/segment.mjs";
import { classifySubjects, extractMeta, writeConclusion, writeSummary } from "./pipeline/enrich.mjs";
import { closeSql } from "./pipeline/sql.mjs";
import { textQuality } from "./pipeline/quality.mjs";

process.env.AUDIT_NO_MAIN = "1";
const { auditOne } = await import("./audit-summaries.mjs");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.length ? v.join("=") : true];
  }),
);
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

async function loadPdf(src) {
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src, { signal: AbortSignal.timeout(300_000) });
    if (!res.ok) throw new Error(`download ${res.status}`);
    const file = path.join(tmpdir(), `issue-${Date.now()}.pdf`);
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
    return file;
  }
  return src;
}

async function splitPages(srcDoc, from, to) {
  const out = await PDFDocument.create();
  const idx = Array.from({ length: to - from + 1 }, (_, i) => from - 1 + i);
  const copied = await out.copyPages(srcDoc, idx);
  copied.forEach((p) => out.addPage(p));
  return Buffer.from(await out.save());
}

/**
 * opts: { pdf, magazineId, volume, number, date, langs, dryRun, out, budgetInr, includeFrontMatter }
 * Returns { summary, details } (shape used by trackRun).
 */
export async function ingestIssue(opts) {
  const args = {
    pdf: opts.pdf,
    "magazine-id": opts.magazineId,
    volume: opts.volume ?? undefined,
    number: opts.number ?? undefined,
    date: opts.date,
    langs: opts.langs,
    out: opts.out,
    "budget-inr": opts.budgetInr,
    "include-front-matter": opts.includeFrontMatter,
  };
  const DRY = Boolean(opts.dryRun);
  for (const k of ["pdf", "magazine-id", "date"]) if (!args[k]) throw new Error(`${k} is required`);
  const { data: magazine, error: magErr } = await db.from("magazines").select("id, name").eq("id", Number(args["magazine-id"])).single();
  if (magErr) throw magErr;
  const { data: subRows } = await db.from("subsubjects").select("id, name, subject_areas(name)").order("id");
  const subs = subRows.map((s) => ({ id: s.id, name: s.name, area: s.subject_areas.name }));

  const ai = createAi({ budgetInr: Number(args["budget-inr"] ?? 40) });
  const pdfPath = await loadPdf(args.pdf);
  const issueDate = String(args.date);
  const year = Number(issueDate.match(/(1[89]\d\d|20[0-2]\d)/)?.[1]) || null;
  const month = MONTHS.indexOf(issueDate.trim().slice(0, 3).toLowerCase()) + 1 || null;
  const outDir = args.out ?? path.join(tmpdir(), `ingest-${magazine.id}-${Date.now()}`);
  await mkdir(outDir, { recursive: true });

  const pages = await extractPages(pdfPath, { langs: args.langs ?? "eng" });
  const pieces = await segmentIssue(ai, pages, {
    journal: magazine.name,
    issueLabel: [args.volume && `Vol. ${args.volume}`, args.number && `No. ${args.number}`, issueDate].filter(Boolean).join(", "),
  });
  const srcDoc = await PDFDocument.load(await readFile(pdfPath), { ignoreEncryption: true });
  const report = [];
  const { findExisting, publishRecord } = DRY ? {} : await import("./pipeline/publish.mjs");

  for (const [i, piece] of pieces.entries()) {
    const entry = { ...piece, status: "pending" };
    report.push(entry);
    try {
      if (piece.type === "front_back_matter" && !args["include-front-matter"]) {
        entry.status = "skipped: front/back matter";
        continue;
      }
      const pageTexts = pages.slice(piece.start_page - 1, piece.end_page);
      const text = pageTexts.map((p) => p.text).join("\n\n").trim();
      const tq = textQuality(text);
      const meta = await extractMeta(ai, text, { hintTitle: piece.title, hintAuthors: piece.authors });
      entry.title = meta.title;
      entry.authors = meta.authors;

      if (!DRY) {
        const existing = await findExisting({ magazineId: magazine.id, volume: args.volume ?? null, number: args.number ?? null, title: meta.title });
        if (existing) {
          entry.status = `skipped: already exists (#${existing})`;
          continue;
        }
      }

      let summary = null, conclusion = null, audit = null, checkStatus = "unchecked";
      if (tq === "good" || tq === "partial") {
        for (let attempt = 1; attempt <= 2; attempt++) {
          summary = await writeSummary(ai, text, meta.title);
          audit = await auditOne({ title_name: meta.title, timestamp: issueDate, summary, extracted_text: text, text_quality: tq, magazines: { name: magazine.name } });
          if (audit.status === "ai_audited") break;
        }
        checkStatus = audit.status === "ai_audited" ? "ai_audited" : tq === "good" ? "flagged" : "unchecked";
        conclusion = await writeConclusion(ai, text, meta.title);
      }
      const subsubjectIds = summary ? await classifySubjects(ai, subs, { title: meta.title, summary, journal: magazine.name }) : [];

      const buffer = await splitPages(srcDoc, piece.start_page, piece.end_page);
      const fname = `${String(i + 1).padStart(2, "0")}_${meta.title.replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 60)}.pdf`;
      const record = {
        magazineId: magazine.id,
        magazineName: magazine.name,
        issueDate,
        volume: args.volume ?? null,
        number: args.number ?? null,
        pageNumbers: null, // printed page numbers are not known reliably; PDF range is in pdfPages
        pdfPages: `${piece.start_page}-${piece.end_page}`,
        title: meta.title,
        authors: meta.authors,
        languages: meta.languages,
        summary,
        conclusion,
        text,
        textQuality: tq,
        textSource: pageTexts.some((p) => p.source === "ocr_tesseract") ? "ocr_tesseract" : "pdf_text_layer",
        recordType: meta.type,
        publicationYear: year,
        publicationMonth: month,
        checkStatus,
        audit: audit ? { score: audit.score, notes: audit.notes, model: AI_MODEL } : null,
        subsubjectIds,
      };

      if (DRY) {
        await writeFile(path.join(outDir, fname), buffer);
        await writeFile(path.join(outDir, fname.replace(/\.pdf$/, ".json")), JSON.stringify({ ...record, text: `${text.slice(0, 500)}…` }, null, 2));
        entry.status = `dry-run: ${checkStatus}`;
      } else {
        const res = await publishRecord(record, buffer, fname);
        entry.status = `published #${res.id} (${checkStatus})`;
        entry.recordId = res.id;
      }
    } catch (err) {
      entry.status = `FAILED: ${err.message}`;
      if (err instanceof BudgetExceeded) break;
    } finally {
      console.log(`${String(entry.start_page).padStart(3)}-${String(entry.end_page).padEnd(3)} ${entry.type.padEnd(17)} ${entry.status.padEnd(28)} ${String(entry.title).slice(0, 60)}`);
    }
  }
  await writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
  await closeSql();
  const published = report.filter((r) => r.status.startsWith("published")).length;
  return {
    summary: `${magazine.name} ${issueDate}: ${pieces.length} pieces, ${published} published${DRY ? " (dry run)" : ""}; ₹${ai.usage.costInr.toFixed(2)}; out ${outDir}`,
    details: { report, usage: ai.usage, outDir },
  };
}

const isCli = import.meta.url === `file://${process.argv[1]}`;
if (isCli)
  trackRun(
    "ingest-issue",
    () =>
      ingestIssue({
        pdf: args.pdf,
        magazineId: args["magazine-id"],
        volume: args.volume,
        number: args.number,
        date: args.date,
        langs: args.langs,
        dryRun: Boolean(args["dry-run"]),
        out: args.out,
        budgetInr: args["budget-inr"],
        includeFrontMatter: Boolean(args["include-front-matter"]),
      }),
    { actor: process.env.OPS_ACTOR || "manual" },
  )
  .then((r) => console.log(`[ingest] ${r.summary}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
