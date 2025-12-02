#!/usr/bin/env node
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const requiredEnv = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEW_SUPABASE_URL",
  "NEW_SUPABASE_SERVICE_ROLE_KEY",
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing env var ${key} in .env`);
  }
}

const SOURCE = {
  url: process.env.SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
};
const TARGET = {
  url: process.env.NEW_SUPABASE_URL,
  key: process.env.NEW_SUPABASE_SERVICE_ROLE_KEY,
};

const PAGE_SIZE = 1000;
const UPSERT_CHUNK_SIZE = 500;

const sourceClient = createClient(SOURCE.url, SOURCE.key, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const targetClient = createClient(TARGET.url, TARGET.key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function fetchOpenApi(url, key) {
  const fetcher = globalThis.fetch || (await import("node-fetch")).default;
  const res = await fetcher(`${url}/rest/v1/?apikey=${encodeURIComponent(key)}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to fetch OpenAPI (${res.status}): ${body}`);
  }

  return res.json();
}

function listTables(openApi) {
  const paths = openApi.paths || {};
  return Object.keys(paths)
    .filter((p) => p !== "/" && !p.startsWith("/rpc/"))
    .map((p) => p.replace(/^\//, ""))
    .filter((name, idx, arr) => arr.indexOf(name) === idx);
}

function extractTableMeta(openApi) {
  const tables = listTables(openApi);
  const definitions = openApi.definitions || {};

  const priority = [
    "authors",
    "tags",
    "records",
    "users",
    "record_authors",
    "record_tags",
    "summaries",
    "conclusions",
  ];

  const orderedTables = [
    ...priority.filter((t) => tables.includes(t)),
    ...tables.filter((t) => !priority.includes(t)),
  ];

  const primaryKeys = {};

  for (const table of orderedTables) {
    const def = definitions[table];
    if (!def?.properties) {
      primaryKeys[table] = [];
      continue;
    }

    const pks = Object.entries(def.properties)
      .filter(([, meta]) => typeof meta.description === "string" && meta.description.includes("<pk/>"))
      .map(([col]) => col);

    primaryKeys[table] = pks;
  }

  return { tables: orderedTables, primaryKeys };
}

async function fetchAllRows(table) {
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await sourceClient
      .from(table)
      .select("*", { count: "exact" })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Select failed for ${table}: ${error.message}`);
    }

    rows.push(...(data || []));

    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function migrateTable(table, pkColumns) {
  const rows = await fetchAllRows(table);
  console.log(`\n[${table}] found ${rows.length} rows`);
  if (!rows.length) return;

  const upsertOptions = { returning: "minimal" };
  if (pkColumns?.length) {
    upsertOptions.onConflict = pkColumns.join(",");
  }

  for (const [i, batch] of chunk(rows, UPSERT_CHUNK_SIZE).entries()) {
    const { error } = await targetClient.from(table).upsert(batch, upsertOptions);
    if (error) {
      throw new Error(`Upsert failed for ${table} (chunk ${i + 1}): ${error.message}`);
    }
  }

  console.log(`[${table}] copied ${rows.length} rows`);
}

async function resetSequences(tables) {
  const resettable = ["records", "authors", "tags", "users", "summaries", "conclusions"];
  for (const table of resettable.filter((t) => tables.includes(t))) {
    try {
      const { error } = await targetClient.rpc("reset_identity", {
        p_table: table,
        p_column: "id",
      });
      if (error) throw error;
      console.log(`[${table}] identity sequence reset to max(id)`);
    } catch (err) {
      console.warn(`[${table}] sequence reset skipped: ${err.message || err}`);
    }
  }
}

async function run() {
  console.log("Loading source OpenAPI schema...");
  const sourceOpenApi = await fetchOpenApi(SOURCE.url, SOURCE.key);
  const { tables, primaryKeys } = extractTableMeta(sourceOpenApi);

  console.log("Loading target OpenAPI schema...");
  const targetOpenApi = await fetchOpenApi(TARGET.url, TARGET.key);
  const targetTables = listTables(targetOpenApi);

  const missing = tables.filter((t) => !targetTables.includes(t));
  if (missing.length) {
    throw new Error(
      `Destination project is missing tables: ${missing.join(
        ", ",
      )}. Create the schema first, then re-run this script.`,
    );
  }

  console.log(`Migrating tables in order: ${tables.join(", ")}`);

  for (const table of tables) {
    await migrateTable(table, primaryKeys[table]);
  }

  await resetSequences(tables);
  console.log("\n✅ Data migration complete.");
}

run().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
