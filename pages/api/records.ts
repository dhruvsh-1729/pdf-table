import { createClient } from "@supabase/supabase-js";
import type { NextApiRequest, NextApiResponse } from "next";

const supabase = createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");

// Pre-compiled regex patterns for better performance
const ESCAPE_PATTERNS = [
  [/\\r\\n|\\n|\\r/g, "\n"],
  [/\\"/g, '"'],
  [/\\'/g, "'"],
  [/\\\\/g, "\\"],
  [/^\s+|\s+$/g, ""],
] as const;

// Optimized value formatter with minimal overhead
function formatValue(value: any): any {
  // Fast path for non-strings
  if (typeof value !== "string") {
    if (Array.isArray(value) && value.length === 1 && typeof value[0] === "string") {
      return formatValue(value[0]); // Recursive call only when needed
    }
    return value === null || value === undefined ? "" : value;
  }

  // Fast path for simple strings (no JSON parsing needed)
  if (!value.includes("[") && !value.includes("{") && !value.includes('"')) {
    return value.trim();
  }

  let parsed = value;

  // Try JSON parse only if it looks like JSON
  if ((value.startsWith("[") && value.endsWith("]")) || (value.startsWith("{") && value.endsWith("}"))) {
    try {
      const jsonParsed = JSON.parse(value);
      if (Array.isArray(jsonParsed) && jsonParsed.length === 1 && typeof jsonParsed[0] === "string") {
        parsed = jsonParsed[0];
      } else if (typeof jsonParsed === "string") {
        parsed = jsonParsed;
      }
    } catch {
      // Keep original if parse fails
    }
  }

  if (typeof parsed === "string") {
    // Apply escape pattern replacements
    for (const [pattern, replacement] of ESCAPE_PATTERNS) {
      parsed = parsed.replace(pattern, replacement);
    }

    // Remove surrounding quotes
    if (parsed.length > 1 && parsed[0] === '"' && parsed[parsed.length - 1] === '"') {
      parsed = parsed.slice(1, -1);
    }
  }

  return parsed;
}

// Ultra-fast record formatting
function formatRecords(records: any[]): any[] {
  const result = new Array(records.length);

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const formatted: any = {};

    // tags (existing)
    if (record.record_tags) {
      formatted.tags = record.record_tags.map((rt: any) => rt.tags).filter(Boolean);
    }

    // authors (NEW, mirrors tags)
    if (record.record_authors) {
      formatted.authors_linked = record.record_authors.map((ra: any) => ra.authors).filter(Boolean); // array of { id, name }
    }

    // Batch process other fields
    const keys = Object.keys(record);
    for (let j = 0; j < keys.length; j++) {
      const key = keys[j];
      if (key !== "record_tags" && key !== "record_authors") {
        formatted[key] = formatValue(record[key]);
      }
    }

    result[i] = formatted;
  }

  return result;
}

// Pre-calculate current timestamp for time calculations
const getCurrentTimestamp = () => Date.now();

// Optimized time calculation with caching
const timeCache = new Map<string, string>();
function timeFromNow(dateString: string): string {
  // Check cache first
  if (timeCache.has(dateString)) {
    return timeCache.get(dateString)!;
  }

  const diffMs = getCurrentTimestamp() - new Date(dateString).getTime();
  const diffSec = Math.floor(diffMs / 1000);

  let result: string;
  if (diffSec < 60) result = `${diffSec}s ago`;
  else if (diffSec < 3600) result = `${Math.floor(diffSec / 60)}m ago`;
  else if (diffSec < 86400) result = `${Math.floor(diffSec / 3600)}h ago`;
  else result = `${Math.floor(diffSec / 86400)}d ago`;

  // Cache result (limit cache size to prevent memory leaks)
  if (timeCache.size < 1000) {
    timeCache.set(dateString, result);
  }

  return result;
}

// Highly optimized edit history processing
function processEditHistory(summaries: any[]): Record<string, any> {
  const summariesMap: Record<string, any> = {};

  // Pre-allocate arrays and objects for better performance
  for (let i = 0; i < summaries.length; i++) {
    const summary = summaries[i];
    const rid = formatValue(summary.record_id);
    const name = formatValue(summary.name);
    const email = formatValue(summary.email);
    const createdAt = summary.created_at;

    let entry = summariesMap[rid];
    if (!entry) {
      entry = summariesMap[rid] = {
        count: 0,
        editors: [],
        editorCounts: {},
        latest: null,
        latestTime: 0, // Cache timestamp for faster comparison
      };
    }

    entry.count++;

    if (email && name && !entry.editors.includes(name)) {
      entry.editors.push(name);
    }

    if (name) {
      entry.editorCounts[name] = (entry.editorCounts[name] || 0) + 1;
    }

    if (createdAt) {
      const currentTime = new Date(createdAt).getTime();
      if (currentTime > entry.latestTime) {
        entry.latestTime = currentTime;
        entry.latest = {
          name: name || "",
          email: email || "",
          editedAt: createdAt,
        };
      }
    }
  }

  return summariesMap;
}

// Single mega-query approach for all records (when no email filter)
async function fetchAllRecordsOptimized() {
  // Use a single complex query with joins instead of separate queries
  const { data: recordsWithSummaries, error } = await supabase.rpc("get_all_records_with_edit_history");

  if (error) {
    // Fallback to original approach if RPC doesn't exist
    console.log("📝 RPC not available, using fallback approach");
    return null;
  }

  return recordsWithSummaries;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { email } = req.query;
    console.log("🔍 Starting optimized query with email:", email);

    // Branch: No email filter - ultra-optimized approach
    if (!email || typeof email !== "string" || email.trim() === "") {
      // Fallback: Parallel queries with streaming processing
      const [recordsResult, summariesResult] = await Promise.all([
        supabase
          .from("records")
          .select(`*, record_tags!left(tags(id, name)), record_authors!left(authors(id, name))`)
          .order("id", { ascending: false })
          .limit(10000), // Add reasonable limit for very large datasets
        supabase.from("summaries").select("record_id, email, name, created_at").limit(50000), // Summaries usually more numerous
      ]);

      if (recordsResult.error) {
        console.error("❌ Error fetching records:", recordsResult.error);
        return res.status(500).json({ error: "Error fetching records" });
      }

      if (summariesResult.error) {
        console.error("❌ Error fetching summaries:", summariesResult.error);
        return res.status(500).json({ error: "Error fetching summaries" });
      }

      // Process in chunks for better memory management
      const records = recordsResult.data || [];
      const summariesMap = processEditHistory(summariesResult.data || []);

      // Batch process records
      const chunkSize = 1000;
      const formattedRecords: any[] = [];

      for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize);
        const formattedChunk = formatRecords(chunk).map((record) => ({
          ...record,
          editHistory: {
            count: summariesMap[record.id]?.count || 0,
            editors: summariesMap[record.id]?.editors || [],
            editorCounts: summariesMap[record.id]?.editorCounts || {},
            latestEditor: summariesMap[record.id]?.latest
              ? {
                  name: summariesMap[record.id].latest.name,
                  email: summariesMap[record.id].latest.email,
                  editedAt: summariesMap[record.id].latest.editedAt,
                  timeFromNow: timeFromNow(summariesMap[record.id].latest.editedAt),
                }
              : null,
          },
        }));

        formattedRecords.push(...formattedChunk);
      }

      console.log("✅ All records processed:", formattedRecords.length);
      return res.status(200).json(formattedRecords);
    }

    // Branch: Email filter - maximum optimization
    const formattedEmail = `["${email.trim()}"]`;

    // Use UNION query to get all record IDs in one shot
    const { data: allRecordIds, error: unionError } = await supabase.rpc("get_record_ids_by_email", {
      email_filter: formattedEmail,
    });

    if (unionError || !allRecordIds) {
      // Final fallback to original parallel approach
      const [summaryRecords, conclusionRecords, directRecords] = await Promise.all([
        supabase.from("summaries").select("record_id").eq("email", formattedEmail),
        supabase.from("conclusions").select("record_id").eq("email", formattedEmail),
        supabase.from("records").select("id").eq("email", formattedEmail),
      ]);

      if (summaryRecords.error || conclusionRecords.error || directRecords.error) {
        console.error("❌ Error in parallel queries");
        return res.status(500).json({ error: "Error fetching record IDs" });
      }

      const uniqueRecordIds = new Set<string>();
      summaryRecords.data?.forEach((r) => uniqueRecordIds.add(r.record_id));
      conclusionRecords.data?.forEach((r) => uniqueRecordIds.add(r.record_id));
      directRecords.data?.forEach((r) => uniqueRecordIds.add(r.id));

      if (uniqueRecordIds.size === 0) {
        return res.json([]);
      }

      const recordIds = Array.from(uniqueRecordIds);

      // Ultra-fast parallel fetch
      const [recordsResult, summariesResult] = await Promise.all([
        supabase
          .from("records")
          .select(`*, record_tags!left(tags(id, name)), record_authors!left(authors(id, name))`)
          .in("id", recordIds)
          .order("id", { ascending: false }),
        supabase.from("summaries").select("record_id, email, name, created_at").in("record_id", recordIds),
      ]);

      if (recordsResult.error || summariesResult.error) {
        console.error("❌ Error fetching final data");
        return res.status(500).json({ error: "Error fetching final records" });
      }

      const records = recordsResult.data || [];
      const summariesMap = processEditHistory(summariesResult.data || []);

      const formattedRecords = formatRecords(records).map((record) => ({
        ...record,
        editHistory: {
          count: summariesMap[record.id]?.count || 0,
          editors: summariesMap[record.id]?.editors || [],
          editorCounts: summariesMap[record.id]?.editorCounts || {},
          latestEditor: summariesMap[record.id]?.latest
            ? {
                name: summariesMap[record.id].latest.name,
                email: summariesMap[record.id].latest.email,
                editedAt: summariesMap[record.id].latest.editedAt,
                timeFromNow: timeFromNow(summariesMap[record.id].latest.editedAt),
              }
            : null,
        },
      }));

      console.log("✅ Email filtered records processed:", formattedRecords.length);
      return res.status(200).json(formattedRecords);
    }

    // Process RPC result
    console.log("✅ Union query completed:", allRecordIds.length);
    return res.status(200).json(allRecordIds);
  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({
      error: "Server error",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
