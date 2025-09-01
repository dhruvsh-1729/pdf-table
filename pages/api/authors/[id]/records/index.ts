import { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  const authorId = parseInt(id as string);

  if (isNaN(authorId)) {
    return res.status(400).json({ message: "Invalid author ID" });
  }

  if (req.method === "GET") {
    try {
      // Check if author exists
      const { data: authorExists, error: authorError } = await supabase
        .from("authors")
        .select("id")
        .eq("id", authorId)
        .single();

      if (authorError) {
        if (authorError.code === "PGRST116") {
          return res.status(404).json({ message: "Author not found" });
        }
        throw authorError;
      }

      // Get all record_ids for this author
      const { data: authorRecords, error: recordAuthorError } = await supabase
        .from("record_authors")
        .select("record_id")
        .eq("author_id", authorId);

      if (recordAuthorError) {
        throw recordAuthorError;
      }

      if (!authorRecords || authorRecords.length === 0) {
        return res.status(200).json([]);
      }

      // Extract record IDs
      const recordIds = authorRecords.map((item) => item.record_id);

      // Get the actual records
      const { data: records, error: recordsError } = await supabase
        .from("records")
        .select("id, name, timestamp, volume, number, title_name")
        .in("id", recordIds)
        .order("timestamp", { ascending: false });

      if (recordsError) {
        throw recordsError;
      }

      // Format the record values
      const formattedRecords =
        records?.map((record) => ({
          id: record.id, // Keep id as is
          name: formatValue(record.name),
          timestamp: formatValue(record.timestamp),
          volume: formatValue(record.volume),
          number: formatValue(record.number),
          title_name: formatValue(record.title_name),
        })) || [];

      return res.status(200).json(formattedRecords);
    } catch (error) {
      console.error("Error fetching author records:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}
