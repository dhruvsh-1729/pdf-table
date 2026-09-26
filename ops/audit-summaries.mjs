// ops/audit-summaries.mjs — check each AI/unknown-origin summary against its source text.
//
// Outcome per record (human_verified records are never touched):
//   score >= 0.8 and topic matches                         -> 'ai_audited'
//   (topic mismatch or score < 0.5) and text_quality=good  -> 'flagged' (hidden on the site, queued for regeneration)
//   anything else, incl. "cannot judge" / short or noisy text -> stays 'unchecked', score + notes saved
// The whole text is sent (up to 60k chars) so claims in the middle of an article are not misjudged.
//
//   node --env-file=../.env audit-summaries.mjs [--limit=N] [--budget-inr=300] [--concurrency=4] [--ids=..] [--dry-run]
import { db, trackRun, waitForHealthySite } from "./lib.mjs";
import { AI_MODEL, BudgetExceeded, createAi, excerpt, parseJson } from "./ai.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const LIMIT = Number(args.limit ?? 100000);
const CONCURRENCY = Number(args.concurrency ?? 4);
const DRY = Boolean(args["dry-run"]);
const ai = createAi({ budgetInr: Number(args["budget-inr"] ?? 300) });

const SYSTEM = `You are a meticulous fact-checker for a scholarly archive of articles from Indian journals (Jain studies, Indology, history).
You compare an article's SUMMARY with the article's SOURCE TEXT. The source text may be OCR output with recognition errors, may be in English, Hindi, Sanskrit, Prakrit or Gujarati, and may be an excerpt with the middle omitted.
Judge faithfulness, not style:
- topic_match: false if the summary describes a different subject than the source text (e.g. generic advice unrelated to the article).
- unsupported: up to 3 concrete claims in the summary (names, dates, places, works, arguments) that the source text contradicts or that clearly do not appear in it. Do NOT list claims that are merely unverifiable because the excerpt omits the middle.
- score: 0 to 1, overall faithfulness (1 = every claim grounded in the text; 0 = fabricated).
- If the source text is mostly OCR noise, a table or image caption, or too short to judge the summary, set "score": null and "topic_match": true.
Reply with JSON only: {"topic_match": true|false, "score": number|null, "unsupported": [string], "note": "one short sentence"}`;

async function loadRecord(id) {
  const { data, error } = await db
    .from("records")
    .select("id, title_name, timestamp, summary, extracted_text, text_quality, check_status, magazines(name)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function auditOne(r) {
  const user = `TITLE: ${r.title_name ?? "(none)"}
JOURNAL: ${r.magazines?.name ?? ""} ${r.timestamp ?? ""}

SOURCE TEXT:
"""
${excerpt(r.extracted_text, 60000)}
"""

SUMMARY:
"""
${(r.summary ?? "").trim()}
"""`;
  const messages = [
    { role: "system", content: SYSTEM },
    { role: "user", content: user },
  ];
  let reply = await ai.chat(messages, { maxTokens: 400 });
  let out;
  try {
    out = parseJson(reply);
  } catch {
    // One retry for malformed JSON.
    messages.push({ role: "assistant", content: reply }, { role: "user", content: "That was not valid JSON. Reply again with the JSON object only, with any quotes inside strings escaped." });
    reply = await ai.chat(messages, { maxTokens: 400 });
    out = parseJson(reply);
  }
  const judgeable = out.score !== null && out.score !== undefined && Number.isFinite(Number(out.score));
  const score = judgeable ? Math.max(0, Math.min(1, Number(out.score))) : null;
  const topicMatch = out.topic_match !== false;
  const bad = !topicMatch || (score !== null && score < 0.5);
  const status =
    bad && r.text_quality === "good" ? "flagged" : !bad && score !== null && score >= 0.8 ? "ai_audited" : "unchecked";
  const notes = [
    topicMatch ? null : "TOPIC MISMATCH",
    judgeable ? null : "CANNOT JUDGE (text too short or noisy)",
    out.note ? String(out.note).slice(0, 300) : null,
    ...(Array.isArray(out.unsupported) ? out.unsupported.slice(0, 3).map((c) => `Unsupported: ${String(c).slice(0, 200)}`) : []),
  ]
    .filter(Boolean)
    .join("\n");
  return { status, score, notes };
}

async function loadTargets() {
  const rows = [];
  const page = 500;
  for (let from = 0; rows.length < LIMIT; from += page) {
    let q = db
      .from("records")
      .select("id, magazines!inner(is_active)")
      .eq("check_status", "unchecked")
      .is("audited_at", null)
      .in("text_quality", ["good", "partial"])
      .not("summary", "is", null)
      .eq("magazines.is_active", true)
      // Records whose text was only just recovered were summarised without it: audit those first.
      .order("text_source", { ascending: true, nullsFirst: false })
      .order("id")
      .range(from, from + page - 1);
    if (args.ids) q = q.in("id", String(args.ids).split(",").map(Number));
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...data.map((r) => r.id));
    if (data.length < page) break;
  }
  return rows.slice(0, LIMIT);
}

async function main() {
  const targets = await loadTargets();
  console.log(`[audit] ${targets.length} targets, model ${AI_MODEL}, budget ₹${args["budget-inr"] ?? 300}${DRY ? " (dry run)" : ""}`);
  const stats = { flagged: 0, ai_audited: 0, unchecked: 0, failed: 0, stoppedForBudget: false };
  let cursor = 0;
  let consecutiveFailures = 0;

  async function worker() {
    while (cursor < targets.length && !stats.stoppedForBudget && consecutiveFailures < 10) {
      await waitForHealthySite();
      const id = targets[cursor++];
      try {
        const r = await loadRecord(id);
        if (r.check_status !== "unchecked" || (r.summary ?? "").trim().length < 80) continue;
        const res = await auditOne(r);
        consecutiveFailures = 0;
        stats[res.status] += 1;
        if (!DRY) {
          const { error } = await db
            .from("records")
            .update({
              check_status: res.status,
              audit_score: res.score,
              audit_notes: res.notes || null,
              audit_model: AI_MODEL,
              audited_at: new Date().toISOString(),
            })
            .eq("id", r.id)
            .eq("check_status", "unchecked"); // never overwrite a status someone else set meanwhile
          if (error) throw error;
        }
        console.log(`#${r.id} ${res.status} ${res.score === null ? "n/a" : res.score.toFixed(2)} ${res.notes.split("\n")[0]?.slice(0, 90) ?? ""}`);
      } catch (err) {
        if (err instanceof BudgetExceeded) {
          stats.stoppedForBudget = true;
          break;
        }
        consecutiveFailures += 1;
        stats.failed += 1;
        console.log(`#${id} FAILED: ${err.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const cost = `₹${ai.usage.costInr.toFixed(2)} (${ai.usage.input} in / ${ai.usage.output} out tokens, ${ai.usage.calls} calls)`;
  return {
    summary: `${stats.ai_audited} audited-ok, ${stats.flagged} flagged, ${stats.unchecked} partial, ${stats.failed} failed; ${cost}${stats.stoppedForBudget ? "; stopped at budget" : ""}`,
    details: { ...stats, usage: ai.usage, model: AI_MODEL },
  };
}

if (!process.env.AUDIT_NO_MAIN) trackRun("audit-summaries", main, { actor: process.env.OPS_ACTOR || "manual" })
  .then((r) => console.log(`[audit] ${r.summary}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
