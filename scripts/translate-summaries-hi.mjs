#!/usr/bin/env node
/**
 * Translate checked English summaries/conclusions of Hindi-language articles
 * into Hindi (records.summary_hi / conclusion_hi, migration 030).
 *
 * Eligible: active magazine, a Hindi language link, check_status in
 * (human_verified, ai_audited), an English (non-Devanagari) summary, and no
 * current translation (missing, or summary_hi_hash no longer matches the
 * English text). Re-run any time: it only does what is missing or stale.
 *
 * Gentle on the database: 2 workers, and it pauses while the public site
 * responds slower than 2.5s.
 *
 * Usage: node --env-file=.env scripts/translate-summaries-hi.mjs [--limit=100] [--dry-run]
 */
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.slice(8) || 0) || Infinity;
const DRY = process.argv.includes("--dry-run");
const WORKERS = 2;
const MODEL = "sarvam-translate:v1";
const MAX_CHUNK = 1800; // API limit is ~2000 chars per request
const SITE = "https://www.aryanculture.org/api/health";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SARVAM_API_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SARVAM_API_KEY) {
  console.error("Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SARVAM_API_KEY.");
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hashOf = (summary, conclusion) =>
  crypto.createHash("md5").update(`${summary ?? ""}|${conclusion ?? ""}`, "utf8").digest("hex");
const DEVANAGARI = /[ऀ-ॿ]/;

/** Split into chunks <= MAX_CHUNK at paragraph, then sentence, boundaries. */
function chunks(text) {
  const out = [];
  for (const para of text.split(/\n{2,}/)) {
    if (para.length <= MAX_CHUNK) {
      out.push({ text: para, joiner: "\n\n" });
      continue;
    }
    let buf = "";
    for (const sentence of para.split(/(?<=[.!?।])\s+/)) {
      if ((buf + " " + sentence).length > MAX_CHUNK && buf) {
        out.push({ text: buf, joiner: " " });
        buf = sentence;
      } else buf = buf ? `${buf} ${sentence}` : sentence;
    }
    if (buf) out.push({ text: buf, joiner: "\n\n" });
  }
  return out;
}

async function translateChunk(text) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await fetch("https://api.sarvam.ai/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-subscription-key": SARVAM_API_KEY },
      body: JSON.stringify({ input: text, source_language_code: "en-IN", target_language_code: "hi-IN", model: MODEL }),
    });
    if (res.ok) {
      const data = await res.json();
      if (typeof data.translated_text === "string" && data.translated_text.trim()) return data.translated_text.trim();
    } else if (res.status < 500 && res.status !== 429) {
      const body = (await res.text()).slice(0, 200);
      const err = new Error(`Sarvam ${res.status}: ${body}`);
      // Out of credits / bad key: no point continuing with other records.
      if (res.status === 401 || res.status === 402 || res.status === 403) err.fatal = true;
      throw err;
    }
    await sleep(1500 * (attempt + 1));
  }
  throw new Error("Sarvam translate failed after retries");
}

async function translate(text) {
  if (!text?.trim()) return null;
  const parts = chunks(text.trim());
  let out = "";
  for (let i = 0; i < parts.length; i += 1) {
    const t = await translateChunk(parts[i].text);
    out += (i === 0 ? "" : parts[i - 1].joiner) + t;
  }
  return out;
}

async function siteIsHealthy() {
  const t = Date.now();
  try {
    const res = await fetch(SITE, { signal: AbortSignal.timeout(10000) });
    return res.ok && Date.now() - t < 2500;
  } catch {
    return false;
  }
}

async function eligible() {
  const { data: hindi, error: langError } = await sb.from("languages").select("id").eq("name", "Hindi").single();
  if (langError) throw langError;
  const ids = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("record_languages")
      .select("record_id")
      .eq("language_id", hindi.id)
      .range(from, from + 999);
    if (error) throw error;
    ids.push(...data.map((r) => r.record_id));
    if (data.length < 1000) break;
  }
  const rows = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await sb
      .from("records")
      .select("id, summary, conclusion, summary_hi, summary_hi_hash, check_status, magazines!inner(is_active)")
      .in("id", ids.slice(i, i + 200))
      .in("check_status", ["human_verified", "ai_audited"])
      .eq("magazines.is_active", true);
    if (error) throw error;
    rows.push(...data);
  }
  return rows.filter(
    (r) =>
      r.summary?.trim() &&
      !DEVANAGARI.test(r.summary) &&
      !(r.summary_hi && r.summary_hi_hash === hashOf(r.summary, r.conclusion)),
  );
}

const queue = (await eligible()).slice(0, LIMIT);
console.log(`${queue.length} records to translate${DRY ? " (dry run)" : ""}`);
if (DRY) process.exit(0);

let done = 0;
let failed = 0;
let stop = false;
async function worker() {
  while (queue.length && !stop) {
    while (!(await siteIsHealthy())) {
      console.log("site slow; pausing 60s");
      await sleep(60000);
    }
    const r = queue.shift();
    if (!r) break; // another worker took the last item while this one waited
    try {
      const [summaryHi, conclusionHi] = [await translate(r.summary), await translate(r.conclusion)];
      const { error } = await sb
        .from("records")
        .update({
          summary_hi: summaryHi,
          conclusion_hi: conclusionHi,
          summary_hi_source: MODEL,
          summary_hi_hash: hashOf(r.summary, r.conclusion),
          summary_hi_at: new Date().toISOString(),
        })
        .eq("id", r.id);
      if (error) throw error;
      done += 1;
      if (done % 25 === 0) console.log(`${done} translated`);
    } catch (err) {
      failed += 1;
      console.error(`record ${r.id}: ${err.message}`);
      if (err.fatal) {
        stop = true;
        console.error("Stopping: Sarvam refused the request (credits/key). Re-run once resolved.");
      }
    }
  }
}
await Promise.all(Array.from({ length: WORKERS }, worker));
console.log(`finished: ${done} translated, ${failed} failed`);
