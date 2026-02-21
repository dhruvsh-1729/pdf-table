#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { spawnSync } from "node:child_process";
import dns from "node:dns/promises";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");
dotenv.config({ path: path.join(rootDir, ".env"), quiet: true });

const backupsDir = path.join(rootDir, "backups");

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

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
      console.error("Example:");
      console.error(
        `  SUPABASE_DB_URL=postgresql://postgres:<db-password>@db.${ref}.supabase.co:5432/postgres?sslmode=require`,
      );
    }
    process.exit(1);
  }

  if (!/^postgres(ql)?:\/\//i.test(dbUrl)) {
    console.error("Error: SUPABASE_DB_URL must be a Postgres URI.");
    console.error(`Current value looks invalid: ${dbUrl}`);
    if (/^https?:\/\//i.test(dbUrl)) {
      console.error("It looks like an HTTP project URL, not a DB URL.");
    }
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

function runCommand(command, args, env) {
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

function commandExists(command, args = ["--version"]) {
  const out = spawnSync(command, args, { encoding: "utf8" });
  return out.status === 0;
}

function getPgDumpMajorVersion(binary = "pg_dump") {
  const out = spawnSync(binary, ["--version"], { encoding: "utf8" });
  if (out.status !== 0) return null;
  const text = `${out.stdout || ""} ${out.stderr || ""}`;
  const m = text.match(/(\d+)(?:\.\d+)?/);
  if (!m) return null;
  return Number(m[1]);
}

function findMatchingPgDumpBinary(serverMajor) {
  const candidates = ["pg_dump", `pg_dump${serverMajor}`, `pg_dump-${serverMajor}`];
  for (const binary of candidates) {
    if (!commandExists(binary)) continue;
    const major = getPgDumpMajorVersion(binary);
    if (major === serverMajor) return binary;
  }
  return null;
}

function getServerMajorVersion(dbUrl) {
  const out = spawnSync("psql", [dbUrl, "-Atc", "SHOW server_version_num;"], { encoding: "utf8" });
  if (out.status !== 0) return null;
  const raw = String(out.stdout || "").trim();
  const versionNum = Number(raw);
  if (!Number.isFinite(versionNum)) return null;
  return Math.floor(versionNum / 10000);
}

async function runLocalPgDump(dbUrl, backupFile, binary = "pg_dump") {
  await runCommand(binary, ["--no-owner", "--no-privileges", "--format=plain", "--file", backupFile, dbUrl], {});
}

async function runDockerPgDump(dbUrl, backupFile, serverMajor) {
  const dockerDbUrl = await ensureIpv4Hostaddr(dbUrl);
  const containerBackupDir = "/backups";
  const hostBackupDir = path.dirname(backupFile);
  const filename = path.basename(backupFile);
  const dockerArgs = [
    "run",
    "--rm",
    ...(process.platform === "linux" ? ["--network", "host"] : []),
    "-v",
    `${hostBackupDir}:${containerBackupDir}`,
    `postgres:${serverMajor}`,
    "pg_dump",
    "--no-owner",
    "--no-privileges",
    "--format=plain",
    "--file",
    `${containerBackupDir}/${filename}`,
    dockerDbUrl,
  ];

  const probe = spawnSync("docker", ["version"], { encoding: "utf8" });
  const probeText = `${probe.stdout || ""}\n${probe.stderr || ""}`;
  const dockerPermissionDenied = /permission denied/i.test(probeText);

  if (probe.status === 0) {
    await runCommand("docker", dockerArgs, {});
    return;
  }

  if (!dockerPermissionDenied) {
    throw new Error(
      "Docker is required for pg_dump fallback but is unavailable. Install Docker or install a matching pg_dump client.",
    );
  }

  const canTrySudo = process.stdin.isTTY && commandExists("sudo", ["--version"]);
  if (canTrySudo) {
    console.warn("Docker daemon requires elevated permission. Trying with sudo docker...");
    await runCommand("sudo", ["docker", ...dockerArgs], {});
    return;
  }

  throw new Error(
    "Docker daemon permission denied. Run this script in a shell with docker access, or use:\n" +
      "  sudo usermod -aG docker $USER && newgrp docker\n" +
      "or install postgresql-client-17 and rerun.",
  );
}

async function ensureIpv4Hostaddr(dbUrl) {
  try {
    const parsed = new URL(dbUrl);
    if (parsed.searchParams.has("hostaddr")) return dbUrl;
    if (!parsed.hostname) return dbUrl;

    const lookup = await dns.lookup(parsed.hostname, { family: 4 });
    if (!lookup?.address) return dbUrl;

    parsed.searchParams.set("hostaddr", lookup.address);
    return parsed.toString();
  } catch {
    return dbUrl;
  }
}

async function main() {
  const dbUrl = resolveDbUrl();

  fs.mkdirSync(backupsDir, { recursive: true });
  const backupFile = path.join(backupsDir, `pre-migration-${timestamp()}.sql`);
  console.log(`Creating full backup at ${backupFile} ...`);

  if (!commandExists("pg_dump")) {
    console.error("Error: pg_dump is not installed or not in PATH.");
    process.exit(1);
  }

  const clientMajor = getPgDumpMajorVersion("pg_dump");
  const serverMajor = commandExists("psql") ? getServerMajorVersion(dbUrl) : null;
  const matchingLocalBinary = serverMajor ? findMatchingPgDumpBinary(serverMajor) : null;

  if (matchingLocalBinary) {
    if (matchingLocalBinary !== "pg_dump") {
      console.log(`Using local ${matchingLocalBinary} for Postgres ${serverMajor}.`);
    }
    await runLocalPgDump(dbUrl, backupFile, matchingLocalBinary);
    console.log(`Backup complete: ${backupFile}`);
    return;
  }

  if (clientMajor && serverMajor && clientMajor < serverMajor) {
    console.warn(
      `Detected pg_dump ${clientMajor} against Postgres server ${serverMajor}. Falling back to dockerized pg_dump ${serverMajor}.`,
    );
    if (!commandExists("docker")) {
      console.error(
        `Error: docker is not available, and local pg_dump ${clientMajor} is older than server ${serverMajor}.`,
      );
      console.error(`Install postgresql-client-${serverMajor} or docker, then retry.`);
      process.exit(1);
    }
    await runDockerPgDump(dbUrl, backupFile, serverMajor);
  } else {
    await runLocalPgDump(dbUrl, backupFile);
  }

  console.log(`Backup complete: ${backupFile}`);
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
