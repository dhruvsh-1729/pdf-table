// POST /api/review/:id { action: "verify" | "flag", summary?, conclusion?, reason? }
// verify: the reviewer vouches for the summary (optionally after editing it);
//         the record becomes human_verified and shows on the public site.
// flag:   the summary is wrong; it is hidden on the site until fixed.
// Edited text keeps the previous version in the summaries/conclusions history.
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUser, wrapField } from "@/lib/auth/server";
import { invalidateRecordsCache } from "@/lib/recordsQueryCache";

const clean = (v: unknown) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim() : undefined);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });

  const id = Number(req.query.id);
  const action = req.body?.action;
  if (!Number.isInteger(id) || id <= 0 || (action !== "verify" && action !== "flag")) {
    return res.status(400).json({ error: "Expected action 'verify' or 'flag'" });
  }

  const { data: existing, error: readError } = await supabaseAdmin
    .from("records")
    .select("summary, conclusion, audit_notes")
    .eq("id", id)
    .maybeSingle();
  if (readError) return res.status(500).json({ error: readError.message });
  if (!existing) return res.status(404).json({ error: "Record not found" });

  const now = new Date().toISOString();
  const by = `${user.name || user.email} (${user.email})`;
  const update: Record<string, unknown> = {};

  if (action === "verify") {
    const summary = clean(req.body.summary);
    const conclusion = clean(req.body.conclusion);
    if (summary !== undefined && !summary) return res.status(400).json({ error: "The summary can't be empty" });

    const history = { record_id: id, email: wrapField(user.email), name: wrapField(user.name || user.email) };
    if (summary !== undefined && summary !== (existing.summary ?? "").trim()) {
      const { error } = await supabaseAdmin.from("summaries").insert({ ...history, summary: existing.summary });
      if (error) return res.status(500).json({ error: error.message });
      update.summary = summary;
      update.summary_origin = "human";
    }
    if (conclusion !== undefined && conclusion !== (existing.conclusion ?? "").trim()) {
      const { error } = await supabaseAdmin.from("conclusions").insert({ ...history, conclusion: existing.conclusion });
      if (error) return res.status(500).json({ error: error.message });
      update.conclusion = conclusion || null;
    }
    update.check_status = "human_verified";
    update.audit_notes = [`Verified by ${by} on ${now.slice(0, 10)}.`, existing.audit_notes].filter(Boolean).join("\n\n");
  } else {
    const reason = clean(req.body.reason);
    if (!reason) return res.status(400).json({ error: "Say briefly what is wrong with the summary" });
    update.check_status = "flagged";
    update.audit_notes = [`Flagged by ${by} on ${now.slice(0, 10)}: ${reason.slice(0, 1000)}`, existing.audit_notes]
      .filter(Boolean)
      .join("\n\n");
  }

  const { error } = await supabaseAdmin.from("records").update(update).eq("id", id);
  if (error) return res.status(500).json({ error: error.message });
  invalidateRecordsCache();
  return res.status(200).json({ ok: true, status: update.check_status, edited: "summary" in update || "conclusion" in update });
}
