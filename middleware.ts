// middleware.ts
// Every page and API route requires a valid session, except the login page and
// the public auth endpoints. /admin and /api/admin additionally require super_admin.
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { SESSION_COOKIE, verifySession, type Role } from "@/lib/auth/session";

const PUBLIC_PATHS = new Set(["/login", "/api/auth/login", "/api/auth/logout", "/api/auth/request-access"]);

// Short cache so a revoked user / changed password takes effect within a minute
// without a DB round-trip on every request.
const CACHE_TTL_MS = 60_000;
const userCache = new Map<number, { sv: number; role: Role; active: boolean; at: number }>();

async function currentUserState(uid: number, tokenSv: number) {
  const hit = userCache.get(uid);
  // A token newer than the cached version (e.g. just re-issued after a password
  // change) must not be rejected by stale cache, so only trust hits that match.
  if (hit && Date.now() - hit.at < CACHE_TTL_MS && hit.sv >= tokenSv) return hit;
  const { data } = await supabaseAdmin
    .from("users")
    .select("role, confirmed, session_version, password_hash")
    .eq("id", uid)
    .maybeSingle();
  const state = {
    sv: data?.session_version ?? -1,
    role: (data?.role ?? "user") as Role,
    active: !!data && !!data.confirmed && !!data.password_hash,
    at: Date.now(),
  };
  userCache.set(uid, state);
  return state;
}

function deny(req: NextRequest, status: 401 | 403) {
  const { pathname, search } = req.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: status === 401 ? "Not authenticated" : "Forbidden" }, { status });
  }
  const url = req.nextUrl.clone();
  url.pathname = status === 401 ? "/login" : "/";
  url.search = status === 401 ? `?next=${encodeURIComponent(pathname + search)}` : "";
  const res = NextResponse.redirect(url);
  if (status === 401) res.cookies.delete(SESSION_COOKIE);
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const payload = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!payload) return deny(req, 401);

  const state = await currentUserState(payload.uid, payload.sv);
  if (!state.active || state.sv !== payload.sv) return deny(req, 401);

  const adminOnly = pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/api/admin/");
  if (adminOnly && state.role !== "super_admin") return deny(req, 403);

  return NextResponse.next();
}

export const config = {
  runtime: "nodejs",
  // Skip Next internals and static files in /public (anything with a file extension).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};
