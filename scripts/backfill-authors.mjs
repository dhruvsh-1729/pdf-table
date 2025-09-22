// scripts/backfill-authors.js
import { createClient } from "@supabase/supabase-js";

// ENV: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(
  "https://hzdjfyzrladnxjerisnm.supabase.co" || "",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6ZGpmeXpybGFkbnhqZXJpc25tIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODg3NTAzMywiZXhwIjoyMDY0NDUxMDMzfQ.ahutTLsn1yeAzCEFzJpxxECyW4LX6AQo7euBAMMlXQ4" ||
    "",
);

// Normalize an author name consistently
function normalizeName(raw) {
  if (!raw) return "";
  let s = raw
    .replace(/[\u2018\u2019]/g, "'") // curly -> straight quotes
    .replace(/[\u201C\u201D]/g, '"') // curly -> straight double quotes
    .replace(/\s+/g, " ") // collapse spaces
    .replace(/^[“"']+|[”"']+$/g, "") // strip wrapping quotes
    .replace(/^by\s+/i, "") // drop leading "by "
    .trim();
  // Optional: Title Case (comment if you prefer raw casing)
  s = s
    .split(" ")
    .map((w) => {
      if (!w.length) return w;
      // First letter always uppercase
      let result = w[0].toUpperCase() + w.slice(1).toLowerCase();
      // Make any letter after a period uppercase
      return result.replace(/\.([a-z])/g, (match, letter) => "." + letter.toUpperCase());
    })
    .join(" ");
  return s;
}

// Split by multiple delimiters: comma, " and ", " - "
function splitAuthors(raw) {
  if (!raw) return [];
  // We split on:
  //  - commas
  //  - " and " (surrounded by spaces, avoids chopping "Anderson")
  //  - " - " (dash with spaces)
  const parts = raw
    .replace(/\s+-\s+/g, ",") // turn " - " into comma
    .replace(/\s+and\s+/gi, ",") // turn " and " into comma
    .replace(/\s+&\s+/g, ",") // turn " & " into comma
    .split(",")
    .map((p) => normalizeName(p))
    .filter((p) => p.length > 0);

  // De-duplicate in-memory by case-insensitive comparison
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(p);
    }
  }
  return out;
}

async function getOrCreateAuthorId(name) {
  // Use upsert on unique (citext) name
  const { data, error } = await supabase.from("authors").upsert({ name }, { onConflict: "name" }).select("id").single();

  if (error) {
    console.error("Upsert author error:", name, error.message);
    return null;
  }
  return data?.id ?? null;
}

async function linkRecordAuthor(recordId, authorId) {
  const { error } = await supabase
    .from("record_authors")
    .upsert(
      { record_id: recordId, author_id: authorId },
      { onConflict: "record_id,author_id", ignoreDuplicates: true },
    );

  if (error) {
    // Because of PK, duplicates are safe to ignore; log other errors
    console.error(`Link error r:${recordId} a:${authorId}`, error.message);
  }
}

async function main() {
  console.log("Backfill authors → record_authors starting…");

  // Pull records in chunks to be safe with large sets
  const pageSize = 2000;
  let from = 0;

  for (;;) {
    // Ignore ^ sample; actual paged query:
    const { data, error: e2 } = await supabase
      .from("records")
      .select("id, authors")
      .not("authors", "is", null)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (e2) {
      console.error("Fetch records error:", e2.message);
      process.exit(1);
    }

    const batch = data || [];
    if (batch.length === 0) break;

    for (const r of batch) {
      const recordId = Number(r.id);

      // Handle both string and array formats for authors
      let authorsString = "";
      if (Array.isArray(r.authors)) {
        // Join array elements with comma to process them consistently
        authorsString = r.authors.join(", ");
      } else {
        authorsString = String(r.authors || "");
      }

      // Skip if empty after trimming
      if (authorsString.trim().length === 0) continue;

      // Clean up the string by removing any JSON-like formatting
      authorsString = authorsString
        .replace(/^\[|\]$/g, "") // Remove surrounding brackets
        .replace(/"+/g, "") // Remove all double quotes
        .trim();

      // Get initial author names
      const rawNames = splitAuthors(authorsString);

      // Filter out country and location names that aren't actual authors
      const locationKeywords = [
        "india",
        "canada",
        "u.k",
        "u.k.",
        "london",
        "u.s",
        "u.s.",
        "japan",
        "usa",
        "uk",
        "china",
        "australia",
        "germany",
        "france",
        "italy",
        "spain",
        "russia",
        "brazil",
        "mexico",
        "singapore",
        "hong kong",
        "new york",
        "california",
        "texas",
        "tokyo",
        "paris",
        "berlin",
        "university",
        "institute",
        "association",
        "(a Biographical Sketch)",
        "Based On Nahata",
        "Agarchand",
        "Nahata",
        "Calcutta",
        "1935.",
      ];

      const names = rawNames.filter((name) => {
        const nameLower = name.toLowerCase();
        // Filter out names containing numbers or matching location keywords
        return (
          !/\d/.test(nameLower) &&
          !locationKeywords.some(
            (keyword) =>
              nameLower === keyword || nameLower.endsWith(`, ${keyword}`) || nameLower.startsWith(`${keyword},`),
          )
        );
      });
      console.log({ authorsString, names });

      if (!names.length) continue;

      // Process each author name
      for (const n of names) {
        const authorId = await getOrCreateAuthorId(n);
        if (authorId) await linkRecordAuthor(recordId, authorId);
      }
    }

    console.log(`Processed ${from + batch.length} records…`);
    from += batch.length;
    if (batch.length < pageSize) break;
  }

  console.log("Backfill complete ✅");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
