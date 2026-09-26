import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { MIN_PASSWORD_LENGTH, hashPassword } from "@/lib/auth/password";
import { isValidEmail, normalizeEmail, requireSuperAdmin, unwrapField, wrapField } from "@/lib/auth/server";

export interface AdminUserRow {
  id: number;
  name: string;
  email: string;
  role: "user" | "super_admin";
  confirmed: boolean;
  hasPassword: boolean;
  passwordUpdatedAt: string | null;
  lastLoginAt: string | null;
  accessRequestedAt: string | null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = await requireSuperAdmin(req, res);
  if (!admin) return;
  res.setHeader("Cache-Control", "private, no-store");

  if (req.method === "GET") {
    const { data, error } = await supabaseAdmin
      .from("users")
      .select("id, name, email, role, confirmed, password_hash, password_updated_at, last_login_at, access_requested_at")
      .order("id", { ascending: true });
    if (error) return res.status(500).json({ error: error.message });

    const users: AdminUserRow[] = (data ?? []).map((u) => ({
      id: u.id,
      name: unwrapField(u.name),
      email: unwrapField(u.email),
      role: u.role,
      confirmed: !!u.confirmed,
      hasPassword: !!u.password_hash,
      passwordUpdatedAt: u.password_updated_at,
      lastLoginAt: u.last_login_at,
      accessRequestedAt: u.access_requested_at,
    }));
    return res.status(200).json({ users });
  }

  if (req.method === "POST") {
    const name = String(req.body?.name ?? "").trim().replace(/["\[\]]/g, "");
    const email = normalizeEmail(req.body?.email);
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!name) return res.status(400).json({ error: "Name is required" });
    if (!isValidEmail(email)) return res.status(400).json({ error: "A valid email is required" });
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const { data: existing } = await supabaseAdmin.from("users").select("id").eq("email", wrapField(email)).limit(1);
    if (existing?.length) {
      return res.status(409).json({ error: "A user with this email already exists — set their password instead." });
    }

    const { error } = await supabaseAdmin.from("users").insert({
      name: wrapField(name),
      email: wrapField(email),
      confirmed: true,
      role: "user",
      password_hash: await hashPassword(password),
      password_updated_at: new Date().toISOString(),
    });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
