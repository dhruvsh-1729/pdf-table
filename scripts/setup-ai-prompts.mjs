#!/usr/bin/env node

import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { seedAiPrompts } from "./seed-ai-prompts.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(rootDir, ".env"), quiet: true });

function ensureSupabaseSslMode(dbUrl) {
  try {
    const parsed = new URL(dbUrl);
    if (!/\.supabase\.co$/i.test(parsed.hostname)) return dbUrl;
    if (!parsed.searchParams.has("sslmode")) {
      parsed.searchParams.set("sslmode", "require");
      return parsed.toString();
    }
    return dbUrl;
  } catch {
    return dbUrl;
  }
}

function resolveDbUrl() {
  const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
  if (!dbUrl) {
    throw new Error("Missing SUPABASE_DB_URL (or DATABASE_URL/POSTGRES_URL).");
  }
  return ensureSupabaseSslMode(dbUrl);
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: process.env,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function main() {
  const dbUrl = resolveDbUrl();
  const sqlPath = path.join(rootDir, "migrations", "011_create_ai_prompts.sql");
  await runCommand("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-P", "pager=off", "-f", sqlPath]);
  await seedAiPrompts({ reset: process.argv.includes("--reset") });
  console.log("AI prompt table setup complete.");
}

main().catch((error) => {
  console.error(error?.message || String(error));
  process.exit(1);
});
