#!/usr/bin/env node
/**
 * vedanta_kesari_puppeteer.js
 *
 * Scrapes Vedanta Kesari content from https://vk.rkmm.org/k using a real browser
 * (Puppeteer) because the site is client-side rendered.
 *
 * What it does:
 *  - Opens https://vk.rkmm.org/k
 *  - Navigates to a chosen year page (ex: 2023) and collects article links
 *  - For each article:
 *      - extracts title
 *      - tries to find a PDF link; if found downloads+extracts PDF text
 *      - else extracts text from the page
 *      - uses Sarvam AI to generate: summary, conclusion, tags, authors
 *      - inserts into Supabase records table
 *      - creates/links tags and authors via pivot tables
 *
 * Usage:
 *   node vedanta_kesari_puppeteer.js
 *     => years 2023 down to 1915, all months, all articles
 *
 *   node vedanta_kesari_puppeteer.js 2023 1 1
 *     => year=2023, month=1 (Jan), limit=1 article (test run)
 *
 *   node vedanta_kesari_puppeteer.js 2023
 *     => year=2023, all months, all articles
 *
 * Env required:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SARVAM_API_KEY
 */

const fs = require("fs/promises");
const path = require("path");

require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");
const { SarvamAIClient } = require("sarvamai");

// pdf-parse relies on Node builtins + canvas-like globals.
if (typeof process.getBuiltinModule !== "function") {
  const Module = require("module");
  process.getBuiltinModule = (id) => {
    if (Module.builtinModules && Module.builtinModules.includes(id)) {
      return require(id);
    }
    return undefined;
  };
}

try {
  const { DOMMatrix, ImageData, Path2D } = require("@napi-rs/canvas");
  if (typeof global.DOMMatrix === "undefined") global.DOMMatrix = DOMMatrix;
  if (typeof global.ImageData === "undefined") global.ImageData = ImageData;
  if (typeof global.Path2D === "undefined") global.Path2D = Path2D;
} catch (e) {
  console.warn("Warning: @napi-rs/canvas not available; PDF rendering may be limited.");
}

// pdf parsing
const pdfParse = require("pdf-parse");

// puppeteer (must be installed in your environment)
let puppeteer;
try {
  puppeteer = require("puppeteer");
} catch (e) {
  console.error("Missing dependency: puppeteer. Install with: npm i puppeteer\n");
  process.exit(1);
}

/* ======================= CONFIG ======================= */

const BASE = "https://vk.rkmm.org";
const PORTAL = `${BASE}/s/vkm`; // new portal root

const MAGAZINE_NAME = "Vedanta Kesari";

// env
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SARVAM_API_KEY = process.env.SARVAM_API_KEY || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!SARVAM_API_KEY) {
  console.error("Missing SARVAM_API_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const sarvamClient = new SarvamAIClient({ apiSubscriptionKey: SARVAM_API_KEY });

/* ======================= DATE HELPERS ======================= */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function issueTimestamp(year, month1to12) {
  const m = MONTHS[Math.max(1, Math.min(12, month1to12)) - 1];
  return `${m} ${year}`;
}

function issueVolume(month1to12) {
  // per your requirement: Jan -> 1, Feb -> 2, ...
  return String(month1to12);
}

/* ======================= SMALL UTIL HELPERS ======================= */

function uniqByLower(arr) {
  const seen = new Set();
  const out = [];
  for (const s of arr || []) {
    const key = String(s || "")
      .trim()
      .toLowerCase();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(String(s).trim());
  }
  return out;
}

function normalizeTags(rawText) {
  const lines = String(rawText || "")
    .split(/[\n,;]+/)
    .map((t) => t.replace(/^[-•\d.)\s]+/, "").trim())
    .filter(Boolean);

  const out = [];
  const seen = new Set();
  for (const l of lines) {
    const words = l.split(/\s+/).filter(Boolean).slice(0, 3);
    if (words.length < 2) continue;
    const tag = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= 5) break;
  }
  return out;
}

function normalizeAuthors(rawText) {
  const parts = String(rawText || "")
    .split(/[\n,;]+/)
    .map((t) => t.replace(/^[-•\d.)\s]+/, "").trim())
    .filter(Boolean);

  const out = [];
  const seen = new Set();
  for (const p of parts) {
    if (/^unknown$/i.test(p)) continue;
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= 12) break;
  }
  return out;
}

/* ======================= SARVAM AI ======================= */

function trimContext(text, maxChars) {
  const s = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  return s.slice(0, maxChars);
}

function buildMessages(mode, text, title) {
  const baseInstruction =
    "You are an expert editor for academic and magazine PDF content. Use only the provided extracted text. Do not make up facts, add disclaimers, or include pre/post text. Keep output concise and accurate.";
  const label = title || "the article";

  if (mode === "summary") {
    return [
      { role: "system", content: baseInstruction },
      {
        role: "user",
        content: `Create a short accurate summary (~300 words) of all details mentioned in ${label}. Ensure no details are false, inaccurate, or hallucinated. Avoid bullet points and introductions.\n\nExtracted text:\n${text}`,
      },
    ];
  }

  if (mode === "conclusion") {
    return [
      { role: "system", content: baseInstruction },
      {
        role: "user",
        content: `Write a short, unique and distinctive conclusion (110-140 words) from ${label}. Focus on key implications, outcomes, and significance rather than repeating summary content. Output only the conclusion paragraph.\n\nExtracted text:\n${text}`,
      },
    ];
  }

  if (mode === "tags") {
    return [
      { role: "system", content: baseInstruction },
      {
        role: "user",
        content: `Generate exactly 5 tags that best capture the essence of ${label}. Each tag must be 2-3 words, Title Case, no punctuation. Return one tag per line, no extra text.\n\nExtracted text:\n${text}`,
      },
    ];
  }

  if (mode === "authors") {
    return [
      { role: "system", content: baseInstruction },
      {
        role: "user",
        content: `Extract the author(s) of ${label} from the text. Return only author names, one per line. Use exact spellings from the text. If no author is present, return "Unknown".\n\nExtracted text:\n${text}`,
      },
    ];
  }

  throw new Error(`Unknown AI mode: ${mode}`);
}

async function sarvamGenerate(mode, extractedText, title) {
  const context =
    mode === "summary" || mode === "conclusion" ? trimContext(extractedText, 12000) : trimContext(extractedText, 8000);

  const messages = buildMessages(mode, context, title);

  const response = await sarvamClient.chat.completions({
    messages,
    temperature: mode === "tags" || mode === "authors" ? 0.1 : 0.25,
    top_p: 0.9,
    max_tokens: mode === "summary" ? 420 : mode === "conclusion" ? 220 : 96,
    n: 1,
  });

  const content = response.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error(`Sarvam returned empty for ${mode}`);

  if (mode === "tags") return normalizeTags(content);
  if (mode === "authors") return normalizeAuthors(content);

  return content;
}

/* ======================= SUPABASE HELPERS ======================= */

async function insertRecord(row) {
  const { data, error } = await supabase.from("records").insert(row).select().single();
  if (error) throw new Error(error.message);
  return data;
}

async function upsertTagByName(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return null;

  // try find (case-insensitive)
  const { data: found, error: findErr } = await supabase.from("tags").select("id,name").ilike("name", trimmed);

  if (findErr) throw new Error(findErr.message);
  if (found && found.length) return found[0];

  // create
  const { data: created, error: createErr } = await supabase.from("tags").insert({ name: trimmed }).select().single();

  if (createErr) throw new Error(createErr.message);
  return created;
}

async function upsertAuthorByName(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed || /^unknown$/i.test(trimmed)) return null;

  const { data: found, error: findErr } = await supabase.from("authors").select("id,name").ilike("name", trimmed);

  if (findErr) throw new Error(findErr.message);
  if (found && found.length) return found[0];

  const { data: created, error: createErr } = await supabase
    .from("authors")
    .insert({ name: trimmed })
    .select()
    .single();

  if (createErr) throw new Error(createErr.message);
  return created;
}

async function attachTags(recordId, tags) {
  const cleaned = uniqByLower(tags).slice(0, 10);
  for (const t of cleaned) {
    const tag = await upsertTagByName(t);
    if (!tag?.id) continue;

    const { error } = await supabase.from("record_tags").insert({
      record_id: recordId,
      tag_id: tag.id,
    });
    if (error) {
      // ignore duplicates due to primary key constraint
      if (
        !String(error.message || "")
          .toLowerCase()
          .includes("duplicate")
      ) {
        throw new Error(error.message);
      }
    }
  }
}

async function attachAuthors(recordId, authors) {
  const cleaned = uniqByLower(authors).slice(0, 12);
  for (const a of cleaned) {
    const author = await upsertAuthorByName(a);
    if (!author?.id) continue;

    const { error } = await supabase.from("record_authors").insert({
      record_id: recordId,
      author_id: author.id,
    });
    if (error) {
      if (
        !String(error.message || "")
          .toLowerCase()
          .includes("duplicate")
      ) {
        throw new Error(error.message);
      }
    }
  }
}

/* ======================= PDF / TEXT EXTRACT ======================= */

async function downloadPdfToBuffer(pdfUrl, timeoutMs = 60000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  const res = await fetch(pdfUrl, { signal: ctrl.signal });
  clearTimeout(t);

  if (!res.ok) throw new Error(`PDF download failed ${res.status} for ${pdfUrl}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

async function extractTextFromPdfUrl(pdfUrl) {
  const buf = await downloadPdfToBuffer(pdfUrl);
  const data = await pdfParse(buf);
  return (data.text || "").trim();
}

/* ======================= SCRAPING (PUPPETEER) ======================= */

/**
 * The portal’s navigation is dynamic. We do:
 *  - open PORTAL
 *  - go to /s/vkm/m/vedanta-kesari-YYYY (works on the site; dynamic rendering)
 *  - wait for links to /a/ (articles)
 *
 * Month filtering:
 *  - The year listing includes all months’ articles.
 *  - We attempt to infer month from surrounding UI text OR from article URL
 *    when present. If month cannot be inferred, we keep it and let you import
 *    without strict filter.
 */

function monthFromText(txt) {
  const t = String(txt || "").toLowerCase();
  const map = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  };

  for (const k of Object.keys(map)) {
    if (t.includes(k)) return map[k];
  }
  return null;
}

async function collectYearArticleLinks(page, year) {
  const yearUrl = `${BASE}/s/vkm/m/vedanta-kesari-${year}`;
  await page.goto(yearUrl, { waitUntil: "networkidle2" });

  // wait for at least one article link to appear
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll("a")).some((a) => (a.getAttribute("href") || "").includes("/a/")),
    { timeout: 60000 },
  );

  // grab link hrefs + visible text
  const items = await page.$$eval("a", (as) =>
    as
      .map((a) => ({
        href: a.getAttribute("href") || "",
        text: (a.textContent || "").trim(),
      }))
      .filter((x) => x.href.includes("/a/") && x.text),
  );

  // make absolute + attempt month inference from text
  const results = items.map((x) => {
    const url = x.href.startsWith("http") ? x.href : `${BASE}${x.href}`;
    const m = monthFromText(x.text) || monthFromText(x.href);
    return { url, guessMonth: m, label: x.text };
  });

  // de-dup urls
  const seen = new Set();
  const unique = [];
  for (const r of results) {
    if (seen.has(r.url)) continue;
    seen.add(r.url);
    unique.push(r);
  }
  return unique;
}

async function scrapeArticlePage(page, articleUrl) {
  await page.goto(articleUrl, { waitUntil: "networkidle2" });

  // title
  const title = await page.evaluate(() => {
    const h =
      document.querySelector(
        'div[class~="z-fs:22"][class~="z-fw:700"][class~="z-txt:grey0"][class~="z-mar-b:10"][class~="z-dis:flex"][class~="z-gap:20"]',
      ) || document.querySelector("h1,h2");
    const text = (h?.textContent || "").trim();
    const cleaned = text.replace(/\d+/g, "").replace(/\s+/g, " ").trim();
    return cleaned;
  });

  // attempt to find a PDF link (anchor ending with .pdf OR containing /pdf/)
  const pdfUrl = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll("a"));
    const a =
      anchors.find((x) => (x.getAttribute("href") || "").toLowerCase().endsWith(".pdf")) ||
      anchors.find((x) => (x.getAttribute("href") || "").toLowerCase().includes(".pdf")) ||
      anchors.find((x) => (x.getAttribute("href") || "").toLowerCase().includes("/pdf"));
    const href = a?.getAttribute("href") || "";
    if (!href) return null;
    if (href.startsWith("http")) return href;
    return new URL(href, window.location.href).toString();
  });

  // Extract article text (prefer main/article)
  const text = await page.evaluate(() => {
    const kill = (sel) => document.querySelectorAll(sel).forEach((n) => n.remove());
    kill("script");
    kill("style");
    kill("noscript");

    const root =
      document.querySelector("main") ||
      document.querySelector("article") ||
      document.querySelector('[role="main"]') ||
      document.body;

    const t = (root?.innerText || "").replace(/\s+\n/g, "\n").trim();
    return t;
  });

  return { title: title || null, pdfUrl: pdfUrl || null, pageText: text || "" };
}

/* ======================= ORCHESTRATION ======================= */

async function processOneArticle({ browser, articleUrl, year, month }) {
  const page = await browser.newPage();
  try {
    const { title, pdfUrl, pageText } = await scrapeArticlePage(page, articleUrl);

    let extractedText = "";
    let resolvedPdfUrl = pdfUrl;

    if (resolvedPdfUrl) {
      try {
        extractedText = await extractTextFromPdfUrl(resolvedPdfUrl);
      } catch (e) {
        // if PDF fails, fallback to pageText
        extractedText = pageText || "";
      }
    } else {
      extractedText = pageText || "";
    }

    extractedText = String(extractedText || "").trim();
    if (!extractedText) {
      console.warn(`Skipping (no extracted text): ${articleUrl}`);
      return null;
    }

    const ts = issueTimestamp(year, month);
    const vol = issueVolume(month);

    // AI fields
    const summary = await sarvamGenerate("summary", extractedText, title || "");
    const conclusion = await sarvamGenerate("conclusion", extractedText, title || "");
    const tags = await sarvamGenerate("tags", extractedText, title || "");
    const authors = await sarvamGenerate("authors", extractedText, title || "");

    // Insert record
    const recordRow = {
      name: MAGAZINE_NAME,
      timestamp: ts,
      summary,
      extracted_text: extractedText,
      pdf_url: resolvedPdfUrl || articleUrl, // required in schema; fall back to article url
      volume: vol,
      number: null,
      title_name: title || null,
      page_numbers: null,
      authors: Array.isArray(authors) && authors.length ? authors.join(", ") : null,
      language: "English",
      email: "dhruvshdarshansh@gmail.com",
      creator_name: "Dhruv Shah",
      conclusion,
      pdf_public_id: null,
    };

    const rec = await insertRecord(recordRow);
    const recordId = rec.id;

    // attach pivots
    if (Array.isArray(tags) && tags.length) await attachTags(recordId, tags);
    if (Array.isArray(authors) && authors.length) await attachAuthors(recordId, authors);

    console.log(`✅ Inserted record ${recordId}: ${title || articleUrl}`);
    return recordId;
  } finally {
    await page.close();
  }
}

async function run(year, month, limit) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.goto(PORTAL, { waitUntil: "networkidle2" });

    const items = await collectYearArticleLinks(page, year);

    // filter by month if possible
    let filtered = items;
    if (month) {
      filtered = items.filter((x) => !x.guessMonth || x.guessMonth === month);
    }

    if (!filtered.length) {
      console.warn("No articles found after filtering.");
      return;
    }

    const toProcess = typeof limit === "number" && limit > 0 ? filtered.slice(0, limit) : filtered;

    console.log(`Found ${items.length} total, processing ${toProcess.length} articles...`);

    // If month was not inferable for some items, they will still be processed.
    // In that case, we use the provided month if you supplied it, else try to
    // use guessed month or default to 1.
    for (const item of toProcess) {
      const resolvedMonth = month || item.guessMonth || 1;
      await processOneArticle({
        browser,
        articleUrl: item.url,
        year,
        month: resolvedMonth,
      });
    }
  } finally {
    await browser.close();
  }
}

/* ======================= CLI ======================= */

function parseCli() {
  // Accept:
  //   node vedanta_kesari_puppeteer.js 2023 1 1
  //   node vedanta_kesari_puppeteer.js 2023
  //   node vedanta_kesari_puppeteer.js
  const argv = process.argv
    .slice(2)
    .map((x) => String(x).trim())
    .filter(Boolean);
  const year = argv[0] ? parseInt(argv[0], 10) : null;
  const month = argv[1] ? parseInt(argv[1], 10) : null;
  const limit = argv[2] ? parseInt(argv[2], 10) : null;

  if (year !== null && (!year || isNaN(year))) {
    console.error("Usage: node vedanta_kesari_puppeteer.js [year] [month] [limit]");
    process.exit(1);
  }
  if (month && (month < 1 || month > 12)) {
    console.error("month must be 1-12");
    process.exit(1);
  }
  return { year, month, limit };
}

(async () => {
  const { year, month, limit } = parseCli();
  if (year) {
    console.log(`Running scrape for year=${year}, month=${month || "ALL"}, limit=${limit || "ALL"}`);
    await run(year, month, limit);
  } else {
    const startYear = 2023;
    const endYear = 1915;
    console.log(
      `Running scrape for years ${startYear} down to ${endYear}, month=${month || "ALL"}, limit=${limit || "ALL"}`,
    );
    for (let y = startYear; y >= endYear; y -= 1) {
      console.log(`\n=== Year ${y} ===`);
      await run(y, month, limit);
    }
  }
  console.log("Done.");
})().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
