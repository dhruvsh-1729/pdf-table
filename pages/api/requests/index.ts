// /api/requests — reader requests from aryanculture.org/request (site
// migration 0019). GET ?status=open|planned|done|declined|all lists them with
// the requester's email; PATCH { id, status?, editor_note? } updates one (the
// reader sees the status and note on their request).
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUser } from "@/lib/auth/server";

const STATUSES = ["open", "planned", "done", "declined"] as const;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });

  if (req.method === "GET") {
    const status = String(req.query.status ?? "open");
    let q = supabaseAdmin
      .from("content_requests")
      .select("id, user_id, kind, title, details, status, editor_note, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if ((STATUSES as readonly string[]).includes(status)) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });

    const { data: counts } = await supabaseAdmin.from("content_requests").select("status");
    const tally: Record<string, number> = { open: 0, planned: 0, done: 0, declined: 0 };
    for (const c of counts ?? []) tally[c.status] = (tally[c.status] ?? 0) + 1;

    const emails = new Map<string, string>();
    await Promise.all(
      Array.from(new Set((data ?? []).map((r) => r.user_id))).map(async (id) => {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(id);
        if (u?.user?.email) emails.set(id, u.user.email);
      }),
    );
    return res.status(200).json({
      counts: tally,
      requests: (data ?? []).map(({ user_id, ...r }) => ({ ...r, email: emails.get(user_id) ?? null })),
    });
  }

  if (req.method === "PATCH") {
    const id = Number(req.body?.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id is required" });
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (req.body.status !== undefined) {
      if (!(STATUSES as readonly string[]).includes(req.body.status)) return res.status(400).json({ error: "Unknown status" });
      update.status = req.body.status;
    }
    if (req.body.editor_note !== undefined) {
      const note = String(req.body.editor_note ?? "").trim().slice(0, 1000);
      update.editor_note = note || null;
    }
    const { error } = await supabaseAdmin.from("content_requests").update(update).eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
