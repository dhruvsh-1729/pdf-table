#!/usr/bin/env node
// Set (or reset) a portal user's password from the command line — e.g. to
// bootstrap super admins before anyone can reach the admin panel.
//
//   node --env-file=.env scripts/set-user-password.mjs <email> <password> [--super-admin]
//
// Uses the same scrypt format as lib/auth/password.ts. Bumps session_version,
// which signs the user out of every existing session.
import { randomBytes, scryptSync } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const [email, password, flag] = process.argv.slice(2);
if (!email || !password) {
  console.error("Usage: node --env-file=.env scripts/set-user-password.mjs <email> <password> [--super-admin]");
  process.exit(1);
}

const N = 16384, R = 8, P = 1;
const salt = randomBytes(16);
const key = scryptSync(password, salt, 64, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
const passwordHash = `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const wrapped = `["${email.trim().toLowerCase()}"]`;
const { data: rows, error } = await supabase
  .from("users")
  .select("id, session_version")
  .eq("email", wrapped)
  .order("id", { ascending: true });
if (error) throw error;
if (!rows?.length) {
  console.error(`No user with email ${email}. Create them in the admin panel first.`);
  process.exit(1);
}

// Duplicate rows per email exist; the first row is the one login uses.
const [row] = rows;
const update = {
  password_hash: passwordHash,
  password_updated_at: new Date().toISOString(),
  confirmed: true,
  session_version: row.session_version + 1,
  ...(flag === "--super-admin" ? { role: "super_admin" } : {}),
};
const { error: updateError } = await supabase.from("users").update(update).eq("id", row.id);
if (updateError) throw updateError;
console.log(`Password set for ${email} (user id ${row.id})${flag === "--super-admin" ? " as super_admin" : ""}.`);
