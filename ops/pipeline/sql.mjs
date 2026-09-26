// ops/pipeline/sql.mjs — direct Postgres connection (for multi-table transactions) from SUPABASE_DB_URL.
// The password may contain characters that break URL parsing, so the URL is split by hand.
import postgres from "postgres";

let client = null;

export function sql() {
  if (client) return client;
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL is not set");
  const m = url.match(/^postgres(?:ql)?:\/\/([^:]+):(.*)@([^@/:]+):(\d+)\/([^?]+)/);
  if (!m) throw new Error("SUPABASE_DB_URL is not in the expected form");
  // Railway has no outbound IPv6 by default and Supabase's direct host is IPv6-only, so services there
  // connect through the IPv4 session pooler (SUPABASE_DB_POOLER_HOST, e.g. aws-1-ap-south-1.pooler.supabase.com).
  const pooler = process.env.SUPABASE_DB_POOLER_HOST?.trim();
  const ref = m[3].match(/^db\.([a-z0-9]+)\.supabase\.co$/)?.[1];
  const viaPooler = Boolean(pooler && ref);
  client = postgres({
    username: viaPooler ? `${m[1]}.${ref}` : m[1],
    password: decodeURIComponent(m[2]),
    host: viaPooler ? pooler : m[3],
    port: viaPooler ? 5432 : Number(m[4]),
    database: m[5],
    ssl: "require",
    max: 3,
    idle_timeout: 20,
    connection: { statement_timeout: 60_000 },
  });
  return client;
}

export async function closeSql() {
  if (client) await client.end({ timeout: 5 });
  client = null;
}
