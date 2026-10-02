// ops/extract-insights.mjs — key quotes, cited works and discussed entities for each article (migration 036).
//
// One AI call per record reads the article's own text and proposes:
//   quotes      2–3 verbatim passages worth quoting,
//   cited_works works the article cites (footnotes, bibliography, "see ..."),
//   entities    people, places, works and groups the article discusses.
// Nothing is stored on the model's word alone: a quote must be a substring of extracted_text (compared
// letters-and-digits only, so OCR line breaks and punctuation don't matter), a cited work's opening words
// and every entity name must occur in the text. Rejected items go to record_insights.dropped for audit.
//
//   node --env-file=../.env extract-insights.mjs [--limit=N] [--budget-inr=300] [--concurrency=2] [--ids=..] [--redo] [--dry-run]
import { db, trackRun, waitForHealthySite } from "./lib.mjs";
import { AI_MODEL, BudgetExceeded, createAi, excerpt, parseJson } from "./ai.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const LIMIT = Number(args.limit ?? 100000);
const CONCURRENCY = Number(args.concurrency ?? 2);
const DRY = Boolean(args["dry-run"]);
const PROMPT_VERSION = "insights-v1";
const MIN_TEXT = 1500;
const ai = createAi({ budgetInr: Number(args["budget-inr"] ?? 300) });

const SYSTEM =
  "You read academic journal articles (Jain studies, Indology, Indian history) and extract facts that are literally in the text. The text may be OCR output in English, Hindi, Sanskrit, Prakrit or Gujarati. Never invent or paraphrase when asked for exact text. Reply with one JSON object and nothing else.";

const prompt = (title, text) => `Article: "${title}"

From the article text below, return JSON with exactly these keys:
{
  "quotes": [ { "text": "...", "translation": "..." } ],
  "cited_works": [ "..." ],
  "entities": [ { "kind": "person|place|work|group", "name": "..." } ]
}

Rules:
- quotes: 2 or 3 passages of 15–60 words that state the article's key claims or findings, copied EXACTLY character for character from the text (same spelling, same script). Pick clean sentences, not garbled OCR, headings, footnotes or bibliography lines. "translation" is an English translation only if the quote is not in English, otherwise "".
- cited_works: up to 12 works the article cites as sources (footnotes, references, bibliography, "cf."/"see" mentions), each written as it appears in the text (author and title, plus edition/page if given). [] if there are none.
- entities: up to 15 that the article actually discusses (not passing mentions): historical or religious persons (not the article's own author), places, texts/inscriptions/works, and groups (dynasties, sects, orders, communities). Use the spelling found in the text.

Article text:
"""
${text}
"""`;

// Letters and digits only, lower-cased, diacritics removed — Devanagari/Gujarati letters and vowel signs kept.
export function squash(s) {
  return String(s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, "")
    .replace(/[̀-ͯ]/g, "");
}

export function entityKey(name) {
  return squash(name).slice(0, 200);
}

const tidy = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

export function verify(raw, fullText) {
  const hay = squash(fullText);
  const dropped = { quotes: [], cited_works: [], entities: [] };
  const quotes = [];
  for (const q of Array.isArray(raw.quotes) ? raw.quotes : []) {
    const text = tidy(q?.text);
    const words = text.split(" ").length;
    const key = squash(text);
    if (words >= 12 && words <= 80 && key.length >= 40 && hay.includes(key) && !quotes.some((x) => squash(x.text) === key)) {
      const translation = tidy(q?.translation);
      quotes.push(translation ? { text, translation } : { text });
    } else dropped.quotes.push(text);
  }
  const cited = [];
  for (const c of Array.isArray(raw.cited_works) ? raw.cited_works : []) {
    const text = tidy(typeof c === "string" ? c : c?.text);
    const key = squash(text);
    // The opening (author/title) must be in the text; trailing page numbers etc. may be reformatted.
    if (key.length >= 8 && text.length <= 300 && hay.includes(key.slice(0, Math.min(24, key.length)))) {
      if (!cited.some((x) => squash(x.text) === key)) cited.push({ text });
    } else dropped.cited_works.push(text);
  }
  const entities = [];
  for (const e of Array.isArray(raw.entities) ? raw.entities : []) {
    const kind = String(e?.kind ?? "").toLowerCase();
    const name = tidy(e?.name).replace(/^(the)\s+/i, "");
    const key = entityKey(name);
    if (["person", "place", "work", "group"].includes(kind) && key.length >= 3 && name.length <= 80 && hay.includes(key)) {
      if (!entities.some((x) => x.kind === kind && entityKey(x.name) === key)) entities.push({ kind, name });
    } else dropped.entities.push(`${kind}:${name}`);
  }
  return { quotes: quotes.slice(0, 3), cited_works: cited.slice(0, 12), entities: entities.slice(0, 15), dropped };
}

async function loadTargets() {
  const done = new Set();
  if (!args.redo) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from("record_insights").select("record_id").range(from, from + 999);
      if (error) throw error;
      data.forEach((r) => done.add(r.record_id));
      if (data.length < 1000) break;
    }
  }
  const ids = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from("records").select("id, magazines!inner(is_active)").eq("magazines.is_active", true).order("id").range(from, from + 999);
    if (args.ids) q = q.in("id", String(args.ids).split(",").map(Number));
    const { data, error } = await q;
    if (error) throw error;
    ids.push(...data.map((r) => r.id).filter((id) => !done.has(id)));
    if (data.length < 1000) break;
  }
  return ids.slice(0, LIMIT);
}

async function saveEntities(recordId, entities, fullText) {
  if (!entities.length) return;
  const rows = entities.map((e) => ({ kind: e.kind, name: e.name, name_key: entityKey(e.name) }));
  // Existing entities keep their first-seen display name.
  const { error: insErr } = await db.from("entities").upsert(rows, { onConflict: "kind,name_key", ignoreDuplicates: true });
  if (insErr) throw insErr;
  const { data: ents, error: selErr } = await db
    .from("entities")
    .select("id, kind, name_key")
    .in("name_key", rows.map((r) => r.name_key));
  if (selErr) throw selErr;
  const hay = squash(fullText);
  const links = rows
    .map((r) => {
      const ent = ents.find((x) => x.kind === r.kind && x.name_key === r.name_key);
      return ent && { record_id: recordId, entity_id: ent.id, mentions: Math.max(1, hay.split(r.name_key).length - 1) };
    })
    .filter(Boolean);
  await db.from("record_entities").delete().eq("record_id", recordId);
  const { error: linkErr } = await db.from("record_entities").upsert(links, { onConflict: "record_id,entity_id" });
  if (linkErr) throw linkErr;
}

async function processOne(id) {
  const { data: r, error } = await db.from("records").select("id, title_name, extracted_text").eq("id", id).single();
  if (error) throw error;
  const fullText = r.extracted_text ?? "";
  if (squash(fullText).length < MIN_TEXT) {
    if (!DRY) await db.from("record_insights").upsert({ record_id: id, status: "no_text", model: null, prompt_version: PROMPT_VERSION });
    return { status: "no_text" };
  }
  const reply = await ai.chat(
    [
      { role: "system", content: SYSTEM },
      { role: "user", content: prompt(r.title_name || "Untitled", excerpt(fullText, 16000)) },
    ],
    { maxTokens: 1600 },
  );
  const out = verify(parseJson(reply), fullText);
  if (!DRY) {
    const { error: upErr } = await db.from("record_insights").upsert({
      record_id: id,
      status: "ok",
      quotes: out.quotes,
      cited_works: out.cited_works,
      model: AI_MODEL,
      prompt_version: PROMPT_VERSION,
      dropped: out.dropped,
      generated_at: new Date().toISOString(),
    });
    if (upErr) throw upErr;
    await saveEntities(id, out.entities, fullText);
  }
  return { status: "ok", ...out };
}

async function main() {
  const targets = await loadTargets();
  console.log(`[insights] ${targets.length} targets, budget ₹${args["budget-inr"] ?? 300}${DRY ? " (dry run)" : ""}`);
  const stats = { ok: 0, no_text: 0, failed: 0, quotes: 0, cited: 0, entities: 0, dropped: 0, stoppedForBudget: false };
  let cursor = 0;
  async function worker() {
    while (cursor < targets.length && !stats.stoppedForBudget) {
      await waitForHealthySite();
      const id = targets[cursor++];
      try {
        const res = await processOne(id);
        stats[res.status] += 1;
        if (res.status === "ok") {
          stats.quotes += res.quotes.length;
          stats.cited += res.cited_works.length;
          stats.entities += res.entities.length;
          stats.dropped += res.dropped.quotes.length + res.dropped.entities.length + res.dropped.cited_works.length;
          if (DRY) console.log(JSON.stringify({ id, ...res }, null, 1));
          else console.log(`#${id} q${res.quotes.length} c${res.cited_works.length} e${res.entities.length} ₹${ai.usage.costInr.toFixed(1)}`);
        }
      } catch (err) {
        if (err instanceof BudgetExceeded) {
          stats.stoppedForBudget = true;
          break;
        }
        stats.failed += 1;
        console.error(`#${id} failed: ${err.message}`);
        if (err.status === 402 || err.status === 401) {
          stats.stoppedForBudget = true;
          break;
        }
        if (!DRY) await db.from("record_insights").upsert({ record_id: id, status: "failed", prompt_version: PROMPT_VERSION, dropped: { error: err.message } });
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const summary = `${stats.ok} ok, ${stats.no_text} no text, ${stats.failed} failed; ${stats.quotes} quotes, ${stats.cited} cited works, ${stats.entities} entities, ${stats.dropped} dropped; ₹${ai.usage.costInr.toFixed(2)}`;
  console.log(`[insights] ${summary}`);
  return { summary, details: { ...stats, usage: ai.usage }, status: stats.failed > stats.ok ? "failed" : "success" };
}

if (!process.env.INSIGHTS_NO_MAIN) {
  if (DRY) await main();
  else await trackRun("extract-insights", main, { actor: process.env.OPS_ACTOR || "claude" });
}
