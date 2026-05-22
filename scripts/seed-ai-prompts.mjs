#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(rootDir, ".env"), quiet: true });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isSchemaCacheError(error) {
  const message = String(error?.message || "");
  return /schema cache/i.test(message) || /Could not find the table/i.test(message);
}

function loadPromptCatalog() {
  const raw = fs.readFileSync(path.join(rootDir, "lib", "aiPromptCatalog.json"), "utf8");
  return JSON.parse(raw);
}

export async function seedAiPrompts({ reset = false } = {}) {
  const promptCatalog = loadPromptCatalog();
  let existingRows = null;
  let fetchError = null;

  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const result = await supabase.from("ai_prompts").select("id, prompt_key");
    existingRows = result.data;
    fetchError = result.error;
    if (!fetchError) break;
    if (!isSchemaCacheError(fetchError) || attempt === 10) {
      throw fetchError;
    }
    await delay(1000);
  }

  if (fetchError) throw fetchError;

  const existingKeys = new Set((existingRows || []).map((row) => row.prompt_key));
  const rowsToWrite = reset ? promptCatalog : promptCatalog.filter((row) => !existingKeys.has(row.prompt_key));

  if (!rowsToWrite.length) {
    console.log(reset ? "AI prompts already match defaults." : "All AI prompts already exist.");
    return { inserted: 0, updated: 0, total: promptCatalog.length };
  }

  const { error: upsertError } = await supabase.from("ai_prompts").upsert(rowsToWrite, { onConflict: "prompt_key" });
  if (upsertError) throw upsertError;

  const inserted = reset ? 0 : rowsToWrite.length;
  const updated = reset ? rowsToWrite.length : 0;
  console.log(reset ? `Reset ${updated} AI prompts to defaults.` : `Inserted ${inserted} missing AI prompts.`);
  return { inserted, updated, total: promptCatalog.length };
}

const shouldRunDirectly = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (shouldRunDirectly) {
  seedAiPrompts({ reset: process.argv.includes("--reset") }).catch((error) => {
    console.error(error?.message || String(error));
    process.exit(1);
  });
}
