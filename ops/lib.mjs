// ops/lib.mjs — shared helpers for the autonomous ops jobs (see docs/AUTONOMOUS_OPERATIONS_PLAN.md).
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

export const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

export async function getSetting(key, fallback = null) {
  const { data, error } = await db.from("ops_settings").select("value").eq("key", key).maybeSingle();
  if (error) throw error;
  return data ? data.value : fallback;
}

export async function setSetting(key, value) {
  const { error } = await db.from("ops_settings").upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// Runs `fn` as a tracked job: one ops_runs row per invocation.
export async function trackRun(job, fn, { actor = process.env.OPS_ACTOR || "cron" } = {}) {
  const { data: run, error } = await db.from("ops_runs").insert({ job, status: "running", actor }).select("id").single();
  if (error) throw error;
  try {
    const { summary = null, details = {}, status = "success" } = (await fn()) ?? {};
    await db
      .from("ops_runs")
      .update({ status, summary, details, finished_at: new Date().toISOString() })
      .eq("id", run.id);
    return { status, summary, details };
  } catch (err) {
    await db
      .from("ops_runs")
      .update({ status: "failed", summary: String(err?.message || err).slice(0, 500), finished_at: new Date().toISOString() })
      .eq("id", run.id);
    throw err;
  }
}

export async function lastRun(job, status = "success") {
  const { data } = await db
    .from("ops_runs")
    .select("started_at, summary, details")
    .eq("job", job)
    .eq("status", status)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function sendEmail(subject, html) {
  const to = await getSetting("report_email", "dhruvshdarshansh@gmail.com");
  if (!resend) {
    console.log(`[ops] RESEND_API_KEY missing; would have emailed ${to}: ${subject}`);
    return false;
  }
  const { error } = await resend.emails.send({ from: "onboarding@resend.dev", to, subject, html });
  if (error) throw new Error(`Resend: ${error.message}`);
  return true;
}

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
