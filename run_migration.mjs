#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.dirname(__filename);
const migrationsDir = path.join(rootDir, "migrations");
dotenv.config({ path: path.join(rootDir, ".env"), quiet: true });

const sqlSteps = [
  "002_clean_data.sql",
  "003_create_magazines.sql",
  "004_create_languages.sql",
  "005_create_record_languages.sql",
  "006_create_magazine_languages.sql",
  "007_verify.sql",
  "009_extend_magazines.sql",
  "010_verify_magazines.sql",
  "011_create_ai_prompts.sql",
];

function projectRefFromSupabaseUrl(url = "") {
  const m = String(url).match(/^https?:\/\/([^.]+)\./i);
  return m?.[1] || "<project-ref>";
}

function resolveDbUrl() {
  const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
  if (!dbUrl) {
    console.error("Error: missing SUPABASE_DB_URL (or DATABASE_URL/POSTGRES_URL).");
    if (process.env.SUPABASE_URL) {
      const ref = projectRefFromSupabaseUrl(process.env.SUPABASE_URL);
      console.error(
        `Example: SUPABASE_DB_URL=postgresql://postgres:<db-password>@db.${ref}.supabase.co:5432/postgres?sslmode=require`,
      );
    }
    process.exit(1);
  }

  if (!/^postgres(ql)?:\/\//i.test(dbUrl)) {
    console.error("Error: SUPABASE_DB_URL must be a Postgres URI starting with postgres:// or postgresql://");
    console.error(`Current value looks invalid: ${dbUrl}`);
    if (/^https?:\/\//i.test(dbUrl)) {
      console.error("It looks like you set the Supabase project URL instead of the DB connection string.");
    }
    console.error("Expected format:");
    console.error("  postgresql://postgres:<db-password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require");
    process.exit(1);
  }

  return ensureSupabaseSslMode(dbUrl);
}

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

function runCommand(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

function buildMigrationSqlFile() {
  const lines = ["\\set ON_ERROR_STOP on", "BEGIN;"];
  for (const step of sqlSteps) {
    lines.push(`\\i ${path.join(migrationsDir, step)}`);
  }
  lines.push("COMMIT;");

  const tempPath = path.join(os.tmpdir(), `run-migration-${Date.now()}.sql`);
  fs.writeFileSync(tempPath, `${lines.join("\n")}\n`, "utf8");
  return tempPath;
}

async function main() {
  const dbUrl = resolveDbUrl();
  const skipBackup = String(process.env.MIGRATION_SKIP_BACKUP || "").toLowerCase() === "true";

  if (skipBackup) {
    console.log("[1/2] Skipping backup (MIGRATION_SKIP_BACKUP=true).");
  } else {
    console.log("[1/2] Running backup...");
    await runCommand("node", [path.join(migrationsDir, "001_backup.mjs")], { SUPABASE_DB_URL: dbUrl });
  }

  console.log("[2/2] Running migrations in a single transaction...");
  const tempSql = buildMigrationSqlFile();
  try {
    await runCommand("psql", [dbUrl, "-P", "pager=off", "-f", tempSql]);
    console.log("Migration completed successfully.");
  } finally {
    try {
      fs.unlinkSync(tempSql);
    } catch {
      // no-op
    }
  }
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
