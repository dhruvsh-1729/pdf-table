// ops/regenerate-summaries.mjs — rewrite summaries/conclusions that failed the audit, from the source text.
//
// Targets: check_status = 'flagged' (and, with --include-partial, 'unchecked' records whose
// audit_score is 0.5–0.8) with text_quality = 'good'. For each: the current summary/conclusion
// go to record_summary_history, a new English summary + conclusion is generated strictly from
// the text, and the new summary is re-audited. It is published only if the audit passes
// (score >= 0.8, topic matches); otherwise the record stays flagged and hidden.
//
//   node --env-file=../.env regenerate-summaries.mjs [--limit=N] [--budget-inr=300] [--concurrency=3] [--include-partial] [--ids=..] [--dry-run]
import { db, trackRun } from "./lib.mjs";
import { AI_MODEL, BudgetExceeded, createAi, excerpt } from "./ai.mjs";

process.env.AUDIT_NO_MAIN = "1";
const { auditOne } = await import("./audit-summaries.mjs");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const LIMIT = Number(args.limit ?? 100000);
const CONCURRENCY = Number(args.concurrency ?? 3);
const DRY = Boolean(args["dry-run"]);
const ai = createAi({ budgetInr: Number(args["budget-inr"] ?? 300) });

// Based on lib/aiPromptCatalog.json record.summary/conclusion.primary, without the invitation to add
// "post-publication updates", which pulls in facts that are not in the text.
const SYSTEM =
  "You are an expert editor for academic journal articles (Jain studies, Indology, Indian history). Use ONLY the provided article text, which may be OCR output and may be in English, Hindi, Sanskrit, Prakrit or Gujarati. Never add names, dates, works or claims that are not in the text. Write in English. Do not add disclaimers or introductions.";

const summaryPrompt = (label, text) => `Write an accurate summary (about 250–300 words) of the article "${label}".
Cover its subject, main argument, evidence and sources discussed, in the author's own terms. Every name, date, place and work you mention must appear in the text. If a passage is unreadable OCR, skip it rather than guess. Plain paragraphs, no bullet points, no heading.

Article text:
"""
${text}
"""`;

const conclusionPrompt = (label, text) => `Write a short conclusion (110–140 words) for the article "${label}": its key findings, implications and significance, based only on the text. Do not repeat the summary sentence by sentence. Output only the paragraph.

Article text:
"""
${text}
"""`;

async function loadTargets() {
  const ids = [];
  for (let from = 0; ids.length < LIMIT; from += 500) {
    let q = db
      .from("records")
      .select("id, magazines!inner(is_active)")
      .eq("text_quality", "good")
      .eq("magazines.is_active", true)
      .order("id")
      .range(from, from + 499);
    q = args["include-partial"]
      ? q.or("check_status.eq.flagged,and(check_status.eq.unchecked,audit_score.gte.0.5,audit_score.lt.0.8)")
      : q.eq("check_status", "flagged");
    if (args.ids) q = q.in("id", String(args.ids).split(",").map(Number));
    const { data, error } = await q;
    if (error) throw error;
    ids.push(...data.map((r) => r.id));
    if (data.length < 500) break;
  }
  return ids.slice(0, LIMIT);
}

async function regenerate(id) {
  const { data: r, error } = await db
    .from("records")
    .select("id, title_name, timestamp, summary, conclusion, extracted_text, text_quality, summary_origin, check_status, audit_score, audit_notes, magazines(name)")
    .eq("id", id)
    .single();
  if (error) throw error;
  if (r.check_status === "human_verified" || r.check_status === "ai_audited") return { skipped: true };

  const label = r.title_name || "this article";
  const text = excerpt(r.extracted_text, 60000);
  const messages = (prompt) => [
    { role: "system", content: SYSTEM },
    { role: "user", content: prompt },
  ];
  const summary = (await ai.chat(messages(summaryPrompt(label, text)), { maxTokens: 900, temperature: 0.2 })).trim();
  const conclusion = (await ai.chat(messages(conclusionPrompt(label, text)), { maxTokens: 400, temperature: 0.2 })).trim();
  if (summary.length < 300) throw new Error(`summary too short (${summary.length})`);

  const audit = await auditOne({ ...r, summary });
  const passed = audit.status === "ai_audited";

  if (!DRY) {
    const { error: histErr } = await db.from("record_summary_history").insert({
      record_id: r.id,
      summary: r.summary,
      conclusion: r.conclusion,
      summary_origin: r.summary_origin,
      check_status: r.check_status,
      audit_score: r.audit_score,
      audit_notes: r.audit_notes,
      replaced_by: `regenerate-summaries/${AI_MODEL}`,
      reason: passed ? "failed audit; regenerated from source text" : "failed audit; regeneration also failed audit (kept hidden)",
    });
    if (histErr) throw histErr;
    const update = passed
      ? { summary, conclusion, summary_origin: "ai", check_status: "ai_audited" }
      : { check_status: "flagged" };
    const { error: upErr } = await db
      .from("records")
      .update({
        ...update,
        audit_score: audit.score,
        audit_notes: audit.notes || null,
        audit_model: AI_MODEL,
        audited_at: new Date().toISOString(),
      })
      .eq("id", r.id);
    if (upErr) throw upErr;
  }
  return { passed, score: audit.score, summary };
}

async function main() {
  const targets = await loadTargets();
  console.log(`[regenerate] ${targets.length} targets, budget ₹${args["budget-inr"] ?? 300}${DRY ? " (dry run)" : ""}`);
  const stats = { published: 0, stillFlagged: 0, skipped: 0, failed: 0, stoppedForBudget: false };
  let cursor = 0;
  async function worker() {
    while (cursor < targets.length && !stats.stoppedForBudget) {
      const id = targets[cursor++];
      try {
        const res = await regenerate(id);
        if (res.skipped) stats.skipped += 1;
        else if (res.passed) stats.published += 1;
        else stats.stillFlagged += 1;
        if (!res.skipped) console.log(`#${id} ${res.passed ? "published" : "still-flagged"} ${res.score ?? "n/a"}${DRY ? `\n${res.summary.slice(0, 400)}…\n` : ""}`);
      } catch (err) {
        if (err instanceof BudgetExceeded) {
          stats.stoppedForBudget = true;
          break;
        }
        stats.failed += 1;
        console.log(`#${id} FAILED: ${err.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const cost = `₹${ai.usage.costInr.toFixed(2)} (${ai.usage.calls} calls)`;
  return {
    summary: `${stats.published} regenerated+published, ${stats.stillFlagged} still flagged, ${stats.failed} failed; ${cost}${stats.stoppedForBudget ? "; stopped at budget" : ""}`,
    details: { ...stats, usage: ai.usage, model: AI_MODEL },
  };
}

trackRun("regenerate-summaries", main, { actor: process.env.OPS_ACTOR || "manual" })
  .then((r) => console.log(`[regenerate] ${r.summary}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
