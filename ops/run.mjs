// ops/run.mjs — hourly entry point (Railway cron service "ops-cron").
// Decides which jobs are due and runs them. Every job records an ops_runs row.
//
//   node ops/run.mjs            # run whatever is due
//   node ops/run.mjs health     # force one job: health | report
import { db, esc, getSetting, lastRun, sendEmail, trackRun } from "./lib.mjs";

const HOUR = 3600_000;

// ---------------------------------------------------------------- health ----
async function health() {
  const urls = await getSetting("health_urls", []);
  const results = [];
  for (const url of urls) {
    const started = Date.now();
    try {
      const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
      results.push({ url, ok: res.status < 400, status: res.status, ms: Date.now() - started });
    } catch (err) {
      results.push({ url, ok: false, status: 0, error: String(err?.message || err), ms: Date.now() - started });
    }
  }
  const failing = results.filter((r) => !r.ok);

  // Alert only when a URL has now failed two runs in a row, and at most every 6h.
  if (failing.length) {
    const prev = await lastRun("health", "success");
    const prevFailing = new Set((prev?.details?.results ?? []).filter((r) => !r.ok).map((r) => r.url));
    const persistent = failing.filter((r) => prevFailing.has(r.url));
    const lastAlert = await getSetting("last_health_alert_at", null);
    if (persistent.length && (!lastAlert || Date.now() - Date.parse(lastAlert) > 6 * HOUR)) {
      await sendEmail(
        `⚠️ Aryan Culture: ${persistent.length} URL(s) down`,
        `<p>These have failed two health checks in a row:</p><ul>${persistent
          .map((r) => `<li>${esc(r.url)} — ${r.status || esc(r.error)}</li>`)
          .join("")}</ul><p>Check Railway: https://railway.com/project/7e6d6527-a254-4a07-9d56-b9ae797a355d</p>`,
      );
      await db.from("ops_settings").upsert({ key: "last_health_alert_at", value: JSON.stringify(new Date().toISOString()) });
    }
  }

  return {
    summary: failing.length ? `${failing.length}/${results.length} failing` : `all ${results.length} ok`,
    details: { results },
  };
}

// ---------------------------------------------------------------- report ----
async function count(table, apply = (q) => q) {
  const { count: n, error } = await apply(db.from(table).select("*", { count: "exact", head: true }));
  if (error) throw error;
  return n ?? 0;
}

async function report() {
  const since = new Date(Date.now() - 7 * 24 * HOUR).toISOString();

  const [total, newRecords, magazines, pendingAccess] = await Promise.all([
    count("records"),
    count("records", (q) => q.gte("created_at", since)),
    db.from("magazines").select("id, name, is_active").order("name"),
    db
      .from("users")
      .select("name, email, access_requested_at")
      .is("password_hash", null)
      .not("access_requested_at", "is", null),
  ]);

  const { data: runs } = await db
    .from("ops_runs")
    .select("job, status, summary, started_at")
    .gte("started_at", since)
    .order("started_at", { ascending: false });

  const byJob = {};
  for (const r of runs ?? []) {
    byJob[r.job] ??= { success: 0, failed: 0, skipped: 0, running: 0, lastFailure: null };
    byJob[r.job][r.status] += 1;
    if (r.status === "failed" && !byJob[r.job].lastFailure) byJob[r.job].lastFailure = r.summary;
  }

  const hidden = (magazines.data ?? []).filter((m) => !m.is_active).map((m) => m.name);
  const humanActions = await getSetting("human_actions", []);
  const unwrap = (v) => String(v ?? "").replace(/^\[|\]$/g, "").replace(/^"|"$/g, "");

  const html = `
    <h2>Aryan Culture — weekly ops report</h2>
    <p><strong>Records:</strong> ${total} total, ${newRecords} added in the last 7 days.
       <strong>Hidden journals:</strong> ${esc(hidden.join(", ") || "none")}.</p>
    <h3>Jobs (last 7 days)</h3>
    <table border="1" cellpadding="4" cellspacing="0">
      <tr><th>Job</th><th>OK</th><th>Failed</th><th>Last failure</th></tr>
      ${Object.entries(byJob)
        .map(
          ([job, s]) =>
            `<tr><td>${esc(job)}</td><td>${s.success}</td><td>${s.failed}</td><td>${esc(s.lastFailure ?? "")}</td></tr>`,
        )
        .join("") || "<tr><td colspan=4>No runs recorded</td></tr>"}
    </table>
    <h3>Waiting on you</h3>
    <ul>
      ${(pendingAccess.data ?? [])
        .map((u) => `<li>Portal access request: ${esc(unwrap(u.name))} (${esc(unwrap(u.email))}) — set a password at https://data.aryanculture.org/admin</li>`)
        .join("")}
      ${humanActions.map((a) => `<li>${esc(a)}</li>`).join("")}
      ${!(pendingAccess.data ?? []).length && !humanActions.length ? "<li>Nothing right now.</li>" : ""}
    </ul>
    <p style="color:#666">Sent automatically by the ops-cron service. Plan: pdf_proj/docs/AUTONOMOUS_OPERATIONS_PLAN.md</p>`;

  await sendEmail(`Aryan Culture weekly report — ${total} records`, html);
  return { summary: `sent (${total} records, ${newRecords} new)`, details: { total, newRecords, byJob } };
}

// ------------------------------------------------------------------ jobs ----
// Processes queued rows in `jobs` (currently type 'ingest_issue', queued from the data portal's
// /admin/ingest page). Limits come from ops_settings.ingest: {max_jobs_per_run, budget_inr_per_job}.
async function jobs() {
  const { sql, closeSql } = await import("./pipeline/sql.mjs");
  const settings = { max_jobs_per_run: 2, budget_inr_per_job: 60, ...(await getSetting("ingest", {})) };
  const q = sql();
  // Jobs stuck in 'running' for 3h (crashed runner) go back to the queue.
  await q`UPDATE public.jobs SET status = 'queued', locked_by = NULL, locked_at = NULL, updated_at = now()
          WHERE status = 'running' AND locked_at < now() - interval '3 hours'`;
  const done = [];
  const deadline = Date.now() + 45 * 60_000;
  for (let i = 0; i < settings.max_jobs_per_run && Date.now() < deadline; i++) {
    const [job] = await q`
      UPDATE public.jobs SET status = 'running', locked_by = ${process.env.RAILWAY_SERVICE_NAME || "local"},
        locked_at = now(), attempts = attempts + 1, updated_at = now()
      WHERE id = (SELECT id FROM public.jobs WHERE status = 'queued' AND run_after <= now() AND type = 'ingest_issue'
                  ORDER BY priority, id FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING *`;
    if (!job) break;
    try {
      const { ingestIssue } = await import("./ingest-issue.mjs");
      const p = job.payload;
      const r = await ingestIssue({
        pdf: p.pdf_url, magazineId: p.magazine_id, volume: p.volume, number: p.number, date: p.date,
        langs: p.langs || "eng", budgetInr: settings.budget_inr_per_job,
      });
      await q`UPDATE public.jobs SET status = 'done', result = ${q.json({ summary: r.summary, report: r.details.report, usage: r.details.usage })},
              last_error = NULL, updated_at = now() WHERE id = ${job.id}`;
      done.push({ id: job.id, ok: true, summary: r.summary });
    } catch (err) {
      const retry = job.attempts < job.max_attempts;
      await q`UPDATE public.jobs SET status = ${retry ? "queued" : "failed"}, last_error = ${String(err?.message || err).slice(0, 1000)},
              run_after = now() + interval '1 hour', locked_by = NULL, updated_at = now() WHERE id = ${job.id}`;
      done.push({ id: job.id, ok: false, error: String(err?.message || err), retry });
    }
  }
  await closeSql();
  if (!done.length) return { status: "skipped", summary: "no queued jobs" };
  return { summary: `${done.filter((d) => d.ok).length}/${done.length} jobs done`, details: { done } };
}

// -------------------------------------------------------------- dispatch ----
const JOBS = { health, report, jobs };

async function isDue(job) {
  const last = await lastRun(job);
  const age = last ? Date.now() - Date.parse(last.started_at) : Infinity;
  if (job === "health" || job === "jobs") return true;
  // Weekly report: Mondays from 03:00 UTC (08:30 IST), once.
  if (job === "report") {
    const now = new Date();
    return now.getUTCDay() === 1 && now.getUTCHours() >= 3 && age > 6 * 24 * HOUR;
  }
  return false;
}

async function main() {
  const forced = process.argv[2];
  if (forced && !JOBS[forced]) throw new Error(`Unknown job "${forced}". Known: ${Object.keys(JOBS).join(", ")}`);

  if (!forced && (await getSetting("paused", false)) === true) {
    await trackRun("dispatch", async () => ({ status: "skipped", summary: "ops paused via ops_settings.paused" }));
    return;
  }

  const names = forced ? [forced] : Object.keys(JOBS);
  let failures = 0;
  for (const name of names) {
    if (!forced && !(await isDue(name))) continue;
    try {
      const r = await trackRun(name, JOBS[name]);
      console.log(`[ops] ${name}: ${r.summary}`);
    } catch (err) {
      failures += 1;
      console.error(`[ops] ${name} failed:`, err);
    }
  }
  process.exitCode = failures ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
