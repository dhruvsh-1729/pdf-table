// lib/auth/server.ts
// Server-side helpers: resolve the current user from the session cookie,
// guard API routes, and small utilities shared by the auth endpoints.
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { SESSION_COOKIE, verifySession, type Role } from "./session";

export const SUPER_ADMIN_NOTIFY_EMAIL = "dhruvshdarshansh@gmail.com";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  sessionVersion: number;
}

// users.name / users.email are stored as JSON-array strings like ["Jane"].
export const wrapField = (value: string) => `["${value}"]`;
export const unwrapField = (value: string | null | undefined) =>
  (value ?? "").replace(/^\[|\]$/g, "").replace(/^"|"$/g, "");
export const normalizeEmail = (email: unknown) => String(email ?? "").trim().toLowerCase();
export const isValidEmail = (email: string) => /^[^\s@"\[\]]+@[^\s@"\[\]]+\.[^\s@"\[\]]+$/.test(email);

type UserRow = {
  id: number;
  name: string | null;
  email: string | null;
  role: Role;
  confirmed: boolean | null;
  session_version: number;
  password_hash: string | null;
};

// Returns the user only if the session is valid AND still matches the database
// (password/role not changed since, account still active).
export async function getSessionUser(req: NextApiRequest): Promise<AuthUser | null> {
  const payload = await verifySession(req.cookies[SESSION_COOKIE]);
  if (!payload) return null;
  const { data } = await supabaseAdmin
    .from("users")
    .select("id, name, email, role, confirmed, session_version, password_hash")
    .eq("id", payload.uid)
    .maybeSingle<UserRow>();
  if (!data || !data.confirmed || !data.password_hash || data.session_version !== payload.sv) return null;
  return {
    id: data.id,
    name: unwrapField(data.name),
    email: unwrapField(data.email),
    role: data.role,
    sessionVersion: data.session_version,
  };
}

export async function requireSuperAdmin(req: NextApiRequest, res: NextApiResponse): Promise<AuthUser | null> {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }
  if (user.role !== "super_admin") {
    res.status(403).json({ error: "Super admin access required" });
    return null;
  }
  return user;
}

export function clientIp(req: NextApiRequest): string {
  const fwd = req.headers["x-forwarded-for"];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0]?.trim();
  return first || req.socket.remoteAddress || "unknown";
}

// Fixed-window in-memory limiter. Good enough for the single-instance deployment.
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) {
      for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    }
    return false;
  }
  bucket.count += 1;
  return bucket.count > limit;
}

export function resetRateLimit(key: string) {
  buckets.delete(key);
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
