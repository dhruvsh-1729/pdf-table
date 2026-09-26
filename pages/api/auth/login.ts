import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyPassword } from "@/lib/auth/password";
import { sessionCookieHeader, signSession, type Role } from "@/lib/auth/session";
import {
  clientIp,
  normalizeEmail,
  rateLimited,
  resetRateLimit,
  unwrapField,
  wrapField,
} from "@/lib/auth/server";

const INVALID = "Invalid email or password. If you don't have a password yet, request access below.";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed", success: false });
  }

  const email = normalizeEmail(req.body?.email);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required", success: false });
  }

  const ip = clientIp(req);
  const failKey = `login:${ip}:${email}`;
  if (rateLimited(`login-ip:${ip}`, 30, 15 * 60_000) || rateLimited(failKey, 8, 15 * 60_000)) {
    return res.status(429).json({ error: "Too many login attempts. Try again in 15 minutes.", success: false });
  }

  // Duplicate rows per email exist historically; use the one that has a password.
  const { data: rows, error } = await supabaseAdmin
    .from("users")
    .select("id, name, email, role, confirmed, session_version, password_hash")
    .eq("email", wrapField(email))
    .not("password_hash", "is", null)
    .eq("confirmed", true)
    .order("id", { ascending: true })
    .limit(1);

  if (error) {
    console.error("[auth] login lookup failed:", error);
    return res.status(500).json({ error: "Login is temporarily unavailable.", success: false });
  }

  const user = rows?.[0];
  const ok = await verifyPassword(password, user?.password_hash);
  if (!user || !ok) {
    return res.status(401).json({ error: INVALID, success: false });
  }

  resetRateLimit(failKey);
  const token = await signSession({ uid: user.id, role: user.role as Role, sv: user.session_version });
  res.setHeader("Set-Cookie", sessionCookieHeader(token));

  await supabaseAdmin.from("users").update({ last_login_at: new Date().toISOString() }).eq("id", user.id);

  return res.status(200).json({
    success: true,
    user: { name: unwrapField(user.name), email: unwrapField(user.email), role: user.role },
  });
}
