// ops/classify-subjects.mjs — assign 1–3 sub-subjects (and their subject areas) to records that have none.
//
// Uses the title plus the summary (or, when the summary is flagged/missing, the start of the text).
// Only records with NO existing sub-subject are touched; the inserted record IDs are kept in the
// ops_runs row so a run can be reversed.
//
//   node --env-file=../.env classify-subjects.mjs [--limit=N] [--budget-inr=100] [--concurrency=3] [--dry-run]
import { db, trackRun, waitForHealthySite } from "./lib.mjs";
import { AI_MODEL, BudgetExceeded, createAi, parseJson } from "./ai.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const LIMIT = Number(args.limit ?? 100000);
const CONCURRENCY = Number(args.concurrency ?? 3);
const DRY = Boolean(args["dry-run"]);
const ai = createAi({ budgetInr: Number(args["budget-inr"] ?? 100) });

async function main() {
  const { data: subs, error: subErr } = await db
    .from("subsubjects")
    .select("id, name, subject_id, subject_areas(name, sort_order)")
    .order("id");
  if (subErr) throw subErr;
  const byId = new Map(subs.map((s) => [s.id, s]));
  const list = subs.map((s) => `${s.id}: ${s.name} (${s.subject_areas.name})`).join("\n");
  const SYSTEM = `You classify articles from Indian scholarly journals (Jain studies, Indology, Indian history, religion) into a fixed subject list.
Choose 1 to 3 subjects that best describe what the article is mainly about. Prefer fewer, more specific choices. Use only IDs from this list:
${list}
Reply with JSON only: {"ids": [number, ...], "confidence": number between 0 and 1}`;

  // Records without any sub-subject, visible on the site.
  const withSubs = new Set();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("record_subsubjects").select("record_id").range(from, from + 999);
    if (error) throw error;
    data.forEach((r) => withSubs.add(r.record_id));
    if (data.length < 1000) break;
  }
  const targets = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("records")
      .select("id, magazines!inner(is_active)")
      .eq("magazines.is_active", true)
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    data.forEach((r) => !withSubs.has(r.id) && targets.push(r.id));
    if (data.length < 1000) break;
  }
  const todo = targets.slice(0, LIMIT);
  console.log(`[classify] ${todo.length} records without subjects${DRY ? " (dry run)" : ""}`);

  const stats = { classified: 0, lowConfidence: 0, failed: 0, stoppedForBudget: false, recordIds: [] };
  let cursor = 0;
  async function worker() {
    while (cursor < todo.length && !stats.stoppedForBudget) {
      await waitForHealthySite();
      const id = todo[cursor++];
      try {
        const { data: r, error } = await db
          .from("records")
          .select("id, title_name, summary, check_status, extracted_text, record_type, magazines(name)")
          .eq("id", id)
          .single();
        if (error) throw error;
        const basis =
          r.check_status !== "flagged" && (r.summary ?? "").trim().length > 100
            ? `SUMMARY: ${r.summary.trim().slice(0, 2500)}`
            : `TEXT (start): ${(r.extracted_text ?? "").trim().slice(0, 3000)}`;
        if (basis.length < 120 && !(r.title_name ?? "").trim()) continue;
        const reply = await ai.chat(
          [
            { role: "system", content: SYSTEM },
            { role: "user", content: `JOURNAL: ${r.magazines?.name ?? ""}\nTITLE: ${r.title_name ?? "(none)"}\nTYPE: ${r.record_type ?? "article"}\n${basis}` },
          ],
          { maxTokens: 80 },
        );
        const out = parseJson(reply);
        const ids = [...new Set((out.ids ?? []).map(Number))].filter((x) => byId.has(x)).slice(0, 3);
        const confidence = Number(out.confidence ?? 0);
        if (!ids.length || confidence < 0.5) {
          stats.lowConfidence += 1;
          console.log(`#${id} skipped (confidence ${confidence}, ids ${JSON.stringify(out.ids)})`);
          continue;
        }
        if (!DRY) {
          const { error: e1 } = await db
            .from("record_subsubjects")
            .upsert(ids.map((s) => ({ record_id: id, subsubject_id: s })), { ignoreDuplicates: true });
          if (e1) throw e1;
          const areas = [...new Set(ids.map((s) => byId.get(s).subject_id))];
          const { error: e2 } = await db
            .from("record_subjects")
            .upsert(areas.map((a) => ({ record_id: id, subject_id: a })), { ignoreDuplicates: true });
          if (e2) throw e2;
        }
        stats.classified += 1;
        stats.recordIds.push(id);
        console.log(`#${id} ${ids.map((s) => byId.get(s).name).join(" · ")} (${confidence}) — ${(r.title_name ?? "").slice(0, 60)}`);
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
  return {
    summary: `${stats.classified} classified, ${stats.lowConfidence} low-confidence skipped, ${stats.failed} failed; ₹${ai.usage.costInr.toFixed(2)}`,
    details: { ...stats, usage: ai.usage, model: AI_MODEL },
  };
}

trackRun("classify-subjects", main, { actor: process.env.OPS_ACTOR || "manual" })
  .then((r) => console.log(`[classify] ${r.summary}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
