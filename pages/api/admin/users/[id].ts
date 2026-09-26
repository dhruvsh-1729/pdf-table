import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { MIN_PASSWORD_LENGTH, hashPassword } from "@/lib/auth/password";
import { sessionCookieHeader, signSession } from "@/lib/auth/session";
import { requireSuperAdmin } from "@/lib/auth/server";

// PATCH body (all optional):
//   password: string       → sets password, activates the account, logs out other sessions
//   role: "user" | "super_admin"
//   revoke: true           → removes password + deactivates, logs out all sessions
// DELETE → removes the user row.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = await requireSuperAdmin(req, res);
  if (!admin) return;

  const id = Number(req.query.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid user id" });

  const { data: target } = await supabaseAdmin
    .from("users")
    .select("id, role, session_version")
    .eq("id", id)
    .maybeSingle();
  if (!target) return res.status(404).json({ error: "User not found" });

  const isSelf = target.id === admin.id;

  if (req.method === "DELETE") {
    if (isSelf) return res.status(400).json({ error: "You cannot delete your own account." });
    const { error } = await supabaseAdmin.from("users").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  if (req.method !== "PATCH") return res.status(405).json({ error: "Method not allowed" });

  const { password, role, revoke } = req.body ?? {};
  const update: Record<string, unknown> = {};

  if (revoke === true) {
    if (isSelf) return res.status(400).json({ error: "You cannot revoke your own access." });
    Object.assign(update, { password_hash: null, confirmed: false });
  }

  if (password !== undefined) {
    if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }
    Object.assign(update, {
      password_hash: await hashPassword(password),
      password_updated_at: new Date().toISOString(),
      confirmed: true,
    });
  }

  if (role !== undefined) {
    if (role !== "user" && role !== "super_admin") return res.status(400).json({ error: "Invalid role" });
    if (isSelf && role !== "super_admin") return res.status(400).json({ error: "You cannot remove your own super admin role." });
    update.role = role;
  }

  if (!Object.keys(update).length) return res.status(400).json({ error: "Nothing to update" });

  const sessionVersion = target.session_version + 1;
  update.session_version = sessionVersion;

  const { error } = await supabaseAdmin.from("users").update(update).eq("id", id);
  if (error) return res.status(500).json({ error: error.message });

  // Keep the acting admin signed in after changing their own password.
  if (isSelf) {
    const token = await signSession({ uid: admin.id, role: "super_admin", sv: sessionVersion });
    res.setHeader("Set-Cookie", sessionCookieHeader(token));
  }

  return res.status(200).json({ success: true });
}
