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
 *   node vedanta_kesari_puppeteer.js 2023 1 50 6
 *     => year=2023, month=1, limit=50 articles, article-concurrency=6
 *
 *   node vedanta_kesari_puppeteer.js 2023
 *     => year=2023, all months, all articles
 *
 * Env required:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SARVAM_API_KEY
 *
 * Optional env:
 *   SCRAPER_CONCURRENCY
 *   SCRAPER_AI_CONCURRENCY
 *   SCRAPER_RELATION_CONCURRENCY
 *   SCRAPER_TIMEOUT_LOG_PATH
 *   SCRAPER_YEAR_TIMEOUT_RETRIES
 *   SCRAPER_ARTICLE_TIMEOUT_RETRIES
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

function parsePositiveInt(value, fallback) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

const ARTICLE_CONCURRENCY = Math.min(32, parsePositiveInt(process.env.SCRAPER_CONCURRENCY, 4));
const AI_CONCURRENCY = Math.min(
  64,
  parsePositiveInt(process.env.SCRAPER_AI_CONCURRENCY, Math.max(6, ARTICLE_CONCURRENCY * 2)),
);
const RELATION_CONCURRENCY = Math.min(64, parsePositiveInt(process.env.SCRAPER_RELATION_CONCURRENCY, 8));
const TIMEOUT_LOG_PATH =
  process.env.SCRAPER_TIMEOUT_LOG_PATH || path.join(process.cwd(), "logs", "scraper-timeouts.log");
const YEAR_TIMEOUT_RETRIES = Math.max(1, Math.min(5, parsePositiveInt(process.env.SCRAPER_YEAR_TIMEOUT_RETRIES, 2)));
const ARTICLE_TIMEOUT_RETRIES = Math.max(
  1,
  Math.min(3, parsePositiveInt(process.env.SCRAPER_ARTICLE_TIMEOUT_RETRIES, 2)),
);

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

function normalizeMonthValue(value) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n < 1 || n > 12) return null;
  return n;
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

function isTimeoutError(err) {
  const name = String(err?.name || "").toLowerCase();
  const msg = String(err?.message || err || "").toLowerCase();
  return (
    name.includes("timeout") ||
    name === "aborterror" ||
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("navigation timeout") ||
    msg.includes("waitforfunction failed") ||
    msg.includes("operation was aborted") ||
    msg.includes("net::err_timed_out") ||
    msg.includes("etimedout")
  );
}

async function logTimeoutError({ scope, year, attempt, maxAttempts, articleUrl, error }) {
  const text = String(error?.stack || error?.message || error || "")
    .replace(/\s+/g, " ")
    .trim();
  const line = `[${new Date().toISOString()}] scope=${scope} year=${year ?? "-"} attempt=${attempt}/${maxAttempts}${
    articleUrl ? ` article=${articleUrl}` : ""
  } error="${text}"\n`;

  try {
    await fs.mkdir(path.dirname(TIMEOUT_LOG_PATH), { recursive: true });
    await fs.appendFile(TIMEOUT_LOG_PATH, line, "utf8");
  } catch (logErr) {
    console.error(`Failed writing timeout log to ${TIMEOUT_LOG_PATH}:`, logErr?.message || logErr);
  }
}

function isDuplicateError(msg) {
  const m = String(msg || "").toLowerCase();
  return m.includes("duplicate") || m.includes("unique");
}

function createLimiter(maxConcurrent) {
  let active = 0;
  const queue = [];

  function runNext() {
    if (active >= maxConcurrent) return;
    const next = queue.shift();
    if (!next) return;

    active += 1;
    Promise.resolve()
      .then(next.task)
      .then(next.resolve, next.reject)
      .finally(() => {
        active -= 1;
        runNext();
      });
  }

  return (task) =>
    new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      runNext();
    });
}

async function runWithConcurrency(items, maxConcurrent, worker) {
  const input = Array.isArray(items) ? items : [];
  if (!input.length) return [];

  const results = new Array(input.length);
  let cursor = 0;

  async function workerLoop() {
    while (true) {
      const idx = cursor;
      cursor += 1;
      if (idx >= input.length) return;
      results[idx] = await worker(input[idx], idx);
    }
  }

  const poolSize = Math.min(maxConcurrent, input.length);
  await Promise.all(Array.from({ length: poolSize }, () => workerLoop()));
  return results;
}

const runAiTask = createLimiter(AI_CONCURRENCY);
const runRelationTask = createLimiter(RELATION_CONCURRENCY);

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

const tagCache = new Map();
const authorCache = new Map();

function getCachedEntity(cache, key, resolver) {
  if (cache.has(key)) return cache.get(key);
  const pending = Promise.resolve()
    .then(resolver)
    .catch((err) => {
      cache.delete(key);
      throw err;
    });
  cache.set(key, pending);
  return pending;
}

async function findTagByName(name) {
  const { data, error } = await supabase.from("tags").select("id,name").ilike("name", name).limit(1);
  if (error) throw new Error(error.message);
  return data?.[0] || null;
}

async function upsertTagByName(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return null;

  const key = trimmed.toLowerCase();
  return getCachedEntity(tagCache, key, async () => {
    const found = await findTagByName(trimmed);
    if (found) return found;

    const { data: created, error: createErr } = await supabase.from("tags").insert({ name: trimmed }).select().single();
    if (!createErr) return created;

    if (isDuplicateError(createErr.message)) {
      const raceWinner = await findTagByName(trimmed);
      if (raceWinner) return raceWinner;
    }
    throw new Error(createErr.message);
  });
}

async function findAuthorByName(name) {
  const { data, error } = await supabase.from("authors").select("id,name").ilike("name", name).limit(1);
  if (error) throw new Error(error.message);
  return data?.[0] || null;
}

async function upsertAuthorByName(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed || /^unknown$/i.test(trimmed)) return null;

  const key = trimmed.toLowerCase();
  return getCachedEntity(authorCache, key, async () => {
    const found = await findAuthorByName(trimmed);
    if (found) return found;

    const { data: created, error: createErr } = await supabase
      .from("authors")
      .insert({ name: trimmed })
      .select()
      .single();

    if (!createErr) return created;

    if (isDuplicateError(createErr.message)) {
      const raceWinner = await findAuthorByName(trimmed);
      if (raceWinner) return raceWinner;
    }
    throw new Error(createErr.message);
  });
}

async function attachTags(recordId, tags) {
  const cleaned = uniqByLower(tags).slice(0, 10);
  await Promise.all(
    cleaned.map((t) =>
      runRelationTask(async () => {
        const tag = await upsertTagByName(t);
        if (!tag?.id) return;

        const { error } = await supabase.from("record_tags").insert({
          record_id: recordId,
          tag_id: tag.id,
        });
        if (error && !isDuplicateError(error.message)) {
          throw new Error(error.message);
        }
      }),
    ),
  );
}

async function attachAuthors(recordId, authors) {
  const cleaned = uniqByLower(authors).slice(0, 12);
  await Promise.all(
    cleaned.map((a) =>
      runRelationTask(async () => {
        const author = await upsertAuthorByName(a);
        if (!author?.id) return;

        const { error } = await supabase.from("record_authors").insert({
          record_id: recordId,
          author_id: author.id,
        });
        if (error && !isDuplicateError(error.message)) {
          throw new Error(error.message);
        }
      }),
    ),
  );
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

  // Use a more robust way to collect links and their associated months from the sidebar
  const items = await page.evaluate((yearStr) => {
    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const monthMap = {
      january: 1,
      jan: 1,
      february: 2,
      feb: 2,
      march: 3,
      mar: 3,
      april: 4,
      apr: 4,
      may: 5,
      june: 6,
      jun: 6,
      july: 7,
      jul: 7,
      august: 8,
      aug: 8,
      september: 9,
      sep: 9,
      october: 10,
      oct: 10,
      november: 11,
      nov: 11,
      december: 12,
      dec: 12,
    };

    // The sidebar is usually in a scrollable container
    const sidebar = document.querySelector(".z-ovf-y\\:auto") || document.body;
    const walker = document.createTreeWalker(sidebar, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, null, false);

    let results = [];
    let currentMonth = null;
    let node;

    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.TEXT_NODE) {
        const parentTag = node.parentElement?.tagName || "";
        if (parentTag === "A") continue;

        const text = node.textContent.replace(/\s+/g, " ").trim().toLowerCase();
        // Check if this text node looks like a month header (e.g., "January" or "January 2023")
        for (const mName of monthNames) {
          const key = mName.toLowerCase();
          if (text === key || text === `${key} ${yearStr}` || text.startsWith(`${key} `)) {
            currentMonth = monthMap[mName.toLowerCase()];
            break;
          }
        }
      } else if (node.tagName === "A") {
        const href = node.getAttribute("href");
        if (href && href.includes("/a/")) {
          results.push({
            href: href,
            text: node.textContent.trim(),
            guessMonth: currentMonth || null,
          });
        }
      }
    }
    return results;
  }, String(year));

  // make absolute
  const results = items.map((x) => {
    const url = x.href.startsWith("http") ? x.href : `${BASE}${x.href}`;
    const inferredMonth = monthFromText(`${x.text || ""} ${url}`) || null;
    const guessMonth = normalizeMonthValue(x.guessMonth) || normalizeMonthValue(inferredMonth);
    return { url, guessMonth, label: x.text };
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
    const [summary, conclusion, tags, authors] = await Promise.all([
      runAiTask(() => sarvamGenerate("summary", extractedText, title || "")),
      runAiTask(() => sarvamGenerate("conclusion", extractedText, title || "")),
      runAiTask(() => sarvamGenerate("tags", extractedText, title || "")),
      runAiTask(() => sarvamGenerate("authors", extractedText, title || "")),
    ]);

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
    await Promise.all([
      Array.isArray(tags) && tags.length ? attachTags(recordId, tags) : Promise.resolve(),
      Array.isArray(authors) && authors.length ? attachAuthors(recordId, authors) : Promise.resolve(),
    ]);

    console.log(`✅ Inserted record ${recordId}: ${title || articleUrl}`);
    return recordId;
  } finally {
    await page.close();
  }
}

async function processOneArticleWithRetry(params) {
  for (let attempt = 1; attempt <= ARTICLE_TIMEOUT_RETRIES; attempt += 1) {
    try {
      return await processOneArticle(params);
    } catch (err) {
      const timeout = isTimeoutError(err);
      const lastAttempt = attempt >= ARTICLE_TIMEOUT_RETRIES;

      if (timeout) {
        await logTimeoutError({
          scope: "article",
          year: params.year,
          attempt,
          maxAttempts: ARTICLE_TIMEOUT_RETRIES,
          articleUrl: params.articleUrl,
          error: err,
        });
      }

      if (timeout && !lastAttempt) {
        console.warn(
          `Timeout for article ${params.articleUrl} (year=${params.year}, attempt ${attempt}/${ARTICLE_TIMEOUT_RETRIES}). Retrying...`,
        );
        continue;
      }

      throw err;
    }
  }
  return null;
}

async function run(year, month, limit, articleConcurrency = ARTICLE_CONCURRENCY) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    let items = [];
    try {
      await page.goto(PORTAL, { waitUntil: "networkidle2" });
      items = await collectYearArticleLinks(page, year);
    } finally {
      await page.close();
    }

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
    const effectiveConcurrency = Math.max(1, Math.min(articleConcurrency, toProcess.length));

    console.log(
      `Found ${items.length} total, processing ${toProcess.length} articles (article concurrency=${effectiveConcurrency}, AI concurrency=${AI_CONCURRENCY}, relation concurrency=${RELATION_CONCURRENCY})...`,
    );

    // If month was not inferable for some items, they will still be processed.
    // In that case, we use the provided month if you supplied it, else try to
    // use guessed month or default to 1.
    let inserted = 0;
    let skipped = 0;
    let failed = 0;

    await runWithConcurrency(toProcess, effectiveConcurrency, async (item, idx) => {
      const forcedMonth = normalizeMonthValue(month);
      const guessedMonth = normalizeMonthValue(item.guessMonth);
      const inferredMonth = normalizeMonthValue(monthFromText(`${item.label || ""} ${item.url || ""}`));
      const resolvedMonth = forcedMonth || guessedMonth || inferredMonth || 1;
      if (!forcedMonth && !guessedMonth && !inferredMonth) {
        console.warn(`Month not detected for ${item.url}; defaulting timestamp month to Jan ${year}.`);
      }
      try {
        const recordId = await processOneArticleWithRetry({
          browser,
          articleUrl: item.url,
          year,
          month: resolvedMonth,
        });
        if (recordId) inserted += 1;
        else skipped += 1;
      } catch (err) {
        failed += 1;
        const message = err && err.message ? err.message : String(err);
        console.error(`❌ Failed article ${idx + 1}/${toProcess.length}: ${item.url}\n   ${message}`);
      }
    });

    console.log(`Year ${year} done: inserted=${inserted}, skipped=${skipped}, failed=${failed}`);
  } finally {
    await browser.close();
  }
}

async function runYearWithRetry(year, month, limit, articleConcurrency) {
  for (let attempt = 1; attempt <= YEAR_TIMEOUT_RETRIES; attempt += 1) {
    try {
      await run(year, month, limit, articleConcurrency);
      return true;
    } catch (err) {
      const timeout = isTimeoutError(err);
      const lastAttempt = attempt >= YEAR_TIMEOUT_RETRIES;

      if (timeout) {
        await logTimeoutError({
          scope: "year",
          year,
          attempt,
          maxAttempts: YEAR_TIMEOUT_RETRIES,
          error: err,
        });
      }

      if (timeout && !lastAttempt) {
        console.warn(`Timeout while processing year ${year} (attempt ${attempt}/${YEAR_TIMEOUT_RETRIES}). Retrying...`);
        continue;
      }

      if (timeout) {
        console.error(
          `Year ${year} failed due to timeout after ${YEAR_TIMEOUT_RETRIES} attempts. Moving to next year.`,
        );
      } else {
        console.error(`Year ${year} failed: ${err?.message || err}. Moving to next year.`);
      }
      return false;
    }
  }
  return false;
}

/* ======================= CLI ======================= */

function parseCli() {
  // Accept:
  //   node vedanta_kesari_puppeteer.js 2023 1 1
  //   node vedanta_kesari_puppeteer.js 2023 1 50 6
  //   node vedanta_kesari_puppeteer.js 2023
  //   node vedanta_kesari_puppeteer.js
  const argv = process.argv
    .slice(2)
    .map((x) => String(x).trim())
    .filter(Boolean);
  const year = argv[0] ? parseInt(argv[0], 10) : null;
  const month = argv[1] ? parseInt(argv[1], 10) : null;
  const limit = argv[2] ? parseInt(argv[2], 10) : null;
  const concurrency = argv[3] ? parseInt(argv[3], 10) : null;

  if (year !== null && (!year || isNaN(year))) {
    console.error("Usage: node vedanta_kesari_puppeteer.js [year] [month] [limit] [concurrency]");
    process.exit(1);
  }
  if (month && (month < 1 || month > 12)) {
    console.error("month must be 1-12");
    process.exit(1);
  }
  if (concurrency !== null && (!concurrency || isNaN(concurrency) || concurrency < 1)) {
    console.error("concurrency must be a positive integer");
    process.exit(1);
  }
  return { year, month, limit, concurrency };
}

(async () => {
  const { year, month, limit, concurrency } = parseCli();
  const articleConcurrency = concurrency || ARTICLE_CONCURRENCY;
  let failedYears = 0;
  if (year) {
    console.log(
      `Running scrape for year=${year}, month=${month || "ALL"}, limit=${limit || "ALL"}, concurrency=${articleConcurrency}`,
    );
    const ok = await runYearWithRetry(year, month, limit, articleConcurrency);
    if (!ok) failedYears += 1;
  } else {
    const startYear = 2016;
    const endYear = 1915;
    console.log(
      `Running scrape for years ${startYear} down to ${endYear}, month=${month || "ALL"}, limit=${limit || "ALL"}, concurrency=${articleConcurrency}`,
    );
    for (let y = startYear; y >= endYear; y -= 1) {
      console.log(`\n=== Year ${y} ===`);
      const ok = await runYearWithRetry(y, month, limit, articleConcurrency);
      if (!ok) failedYears += 1;
    }
  }
  console.log(`Done. Failed years: ${failedYears}. Timeout log: ${TIMEOUT_LOG_PATH}`);
})().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
