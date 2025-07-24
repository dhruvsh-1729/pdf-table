import { createClient } from "@supabase/supabase-js";
import type { NextApiRequest, NextApiResponse } from "next";

const supabase = createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { email } = req.query;
    console.log("🔍 Starting query with email:", email);

    let query = supabase.from("records").select(`
    *,
    record_tags!left(tags(id, name))
  `);

    if (email && typeof email === "string" && email.trim() !== "") {
      const trimmedEmail = `["${email.trim()}"]`;
      console.log("📧 Processing email:", `"${trimmedEmail}"`);

      // Fetch record IDs from summaries and conclusion tables where email matches
      console.log("🔎 Searching summaries table for email...");
      const { data: summaryRecords, error: summaryError } = await supabase
        .from("summaries")
        .select("record_id")
        .eq("email", trimmedEmail);

      console.log("📋 Summary results:", {
        data: summaryRecords,
        error: summaryError,
        count: summaryRecords?.length || 0,
      });

      console.log("🔎 Searching conclusions table for email...");
      const { data: conclusionRecords, error: conclusionError } = await supabase
        .from("conclusions")
        .select("record_id")
        .eq("email", trimmedEmail);

      console.log("📝 Conclusion results:", {
        data: conclusionRecords,
        error: conclusionError,
        count: conclusionRecords?.length || 0,
      });

      if (summaryError || conclusionError) {
        console.error("❌ Error fetching related records:", summaryError || conclusionError);
        return res.status(500).json({ error: "Error fetching related records" });
      }

      // Collect unique record IDs from summaries and conclusion tables
      const relatedRecordIds = new Set([
        ...(summaryRecords?.map((r) => r.record_id) || []),
        ...(conclusionRecords?.map((r) => r.record_id) || []),
      ]);

      console.log("🔗 Related record IDs found:", Array.from(relatedRecordIds));
      console.log("📊 Total unique related IDs:", relatedRecordIds.size);

      // Test: Check if records exist directly in records table with this email
      console.log("🧪 Testing direct email match in records table...");
      const { data: directEmailTest, error: directEmailError } = await supabase
        .from("records")
        .select("id, email")
        .eq("email", trimmedEmail);

      console.log("📧 Direct email test results:", {
        data: directEmailTest,
        error: directEmailError,
        count: directEmailTest?.length || 0,
      });

      // Test: Check if the related record IDs actually exist in records table
      if (relatedRecordIds.size > 0) {
        console.log("🧪 Testing if related record IDs exist in records table...");
        const { data: relatedRecordsTest, error: relatedRecordsError } = await supabase
          .from("records")
          .select("id")
          .in("id", Array.from(relatedRecordIds));

        console.log("🔗 Related records test results:", {
          data: relatedRecordsTest,
          error: relatedRecordsError,
          count: relatedRecordsTest?.length || 0,
        });
      }

      // Build the query based on what we found
      if (relatedRecordIds.size > 0) {
        // Both email match AND related record IDs
        const orCondition = `email.eq."${trimmedEmail}",id.in.(${Array.from(relatedRecordIds).join(",")})`;
        console.log("🔧 Building OR query with condition:", orCondition);
        query = query.or(orCondition);
      } else {
        // Only email match (no related records found)
        console.log("🔧 Building simple email equality query");
        query = query.eq("email", trimmedEmail);
      }
    } else {
      console.log("📭 No email filter provided, fetching all records");
    }

    console.log("🚀 Executing final query...");
    const { data: records, error } = await query;

    console.log("📊 Final query results:", {
      recordCount: records?.length || 0,
      error: error,
      firstRecord: records?.[0] || null,
    });

    if (error) {
      console.error("❌ Supabase error:", error);
      return res.status(500).json({ error: "Error fetching records", details: error.message });
    }

    // Additional debugging: Log some sample data structure
    if (records && records.length > 0) {
      console.log("📋 Sample record structure:", {
        id: records[0].id,
        email: records[0].email,
        hasEmail: records[0].email !== null && records[0].email !== undefined,
        emailType: typeof records[0].email,
        recordTagsCount: records[0].record_tags?.length || 0,
      });
    }

    console.log("✅ Query completed successfully, returning", records?.length || 0, "records");

    const recordsWithTags =
      records?.map((record) => {
        const formattedRecord: Record<string, any> = {};
        for (const key in record) {
          if (key === "record_tags") {
            formattedRecord["tags"] = record[key].map((rt: any) => rt.tags).filter((tag: any) => tag);
            continue;
          }
          let value = record[key];
          if (Array.isArray(value) && value.length === 1 && typeof value[0] === "string") {
            value = value[0];
          }
          if (typeof value !== "string") {
            value = value === null || value === undefined ? "" : String(value);
          }
          if (typeof value === "string") {
            let parsed = value;
            try {
              parsed = JSON.parse(value);
              if (Array.isArray(parsed) && parsed.length === 1 && typeof parsed[0] === "string") {
                parsed = parsed[0];
              }
            } catch {
              parsed = value;
            }
            if (typeof parsed === "string") {
              parsed = parsed
                .replace(/\\r\\n|\\n|\\r/g, "\n")
                .replace(/\\"/g, '"')
                .replace(/\\'/g, "'")
                .replace(/\\\\/g, "\\")
                .replace(/^\s+|\s+$/g, "");
              if (parsed.startsWith('"') && parsed.endsWith('"')) {
                parsed = parsed.slice(1, -1);
              }
            }
            value = parsed;
          }
          formattedRecord[key] = value;
        }
        return formattedRecord;
      }) || [];

    const recordIds = recordsWithTags.map((r) => r.id) || [];
    let summariesMap: Record<
      string,
      {
        count: number;
        editors: string[];
        editorCounts: Record<string, number>;
        latest: { name: string; email: string; editedAt: string } | null;
      }
    > = {};

    if (recordIds.length > 0) {
      const { data: summaries, error: summariesError } = await supabase
        .from("summaries")
        .select("record_id, email, name, created_at")
        .in("record_id", recordIds);

      const cleanSummaries =
        summaries?.map((summary) => {
          const cleaned: any = { ...summary };
          for (const key of ["record_id", "email", "name"]) {
            let value = cleaned[key];
            if (typeof value === "string") {
              let parsed = value;
              try {
                parsed = JSON.parse(value);
                if (Array.isArray(parsed) && parsed.length === 1 && typeof parsed[0] === "string") {
                  parsed = parsed[0];
                }
              } catch {
                parsed = value;
              }
              if (typeof parsed === "string") {
                parsed = parsed
                  .replace(/\\r\\n|\\n|\\r/g, "\n")
                  .replace(/\\"/g, '"')
                  .replace(/\\'/g, "'")
                  .replace(/\\\\/g, "\\")
                  .replace(/^\s+|\s+$/g, "");
                if (parsed.startsWith('"') && parsed.endsWith('"')) {
                  parsed = parsed.slice(1, -1);
                }
              }
              value = parsed;
            }
            cleaned[key] = value;
          }
          return cleaned;
        }) || [];

      if (summariesError) {
        console.error("Supabase summaries error:", summariesError.message);
        return res.status(500).json({ error: "Error fetching summaries", details: summariesError.message });
      }

      summariesMap = cleanSummaries.reduce(
        (acc, summary) => {
          const rid = summary.record_id;
          if (!acc[rid]) {
            acc[rid] = {
              count: 0,
              editors: [],
              editorCounts: {},
              latest: null,
            };
          }
          acc[rid].count += 1;
          if (summary.email) {
            if (!acc[rid].editors.includes(summary.name)) {
              acc[rid].editors.push(summary.name);
            }
            acc[rid].editorCounts[summary.name] = (acc[rid].editorCounts[summary.name] || 0) + 1;
          }
          if (summary.created_at) {
            const prev = acc[rid].latest;
            if (!prev || new Date(summary.created_at).getTime() > new Date(prev.editedAt).getTime()) {
              acc[rid].latest = {
                name: summary.name || "",
                email: summary.email || "",
                editedAt: summary.created_at,
              };
            }
          }
          return acc;
        },
        {} as Record<
          string,
          {
            count: number;
            editors: string[];
            editorCounts: Record<string, number>;
            latest: { name: string; email: string; editedAt: string } | null;
          }
        >,
      );
    }

    function timeFromNow(dateString: string): string {
      const now = new Date();
      const then = new Date(dateString);
      const diffMs = now.getTime() - then.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      if (diffSec < 60) return `${diffSec}s ago`;
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr}h ago`;
      const diffDay = Math.floor(diffHr / 24);
      return `${diffDay}d ago`;
    }

    const recordsWithEditHistory = recordsWithTags.map((record) => {
      const summary = summariesMap[record.id] || {
        count: 0,
        editors: [],
        editorCounts: {},
        latest: null,
      };
      return {
        ...record,
        editHistory: {
          count: summary.count,
          editors: summary.editors,
          editorCounts: summary.editorCounts,
          latestEditor: summary.latest
            ? {
                name: summary.latest.name,
                email: summary.latest.email,
                editedAt: summary.latest.editedAt,
                timeFromNow: timeFromNow(summary.latest.editedAt),
              }
            : null,
        },
      };
    });

    const sortedRecords = recordsWithEditHistory.sort((a: any, b: any) => Number(b.id) - Number(a.id));
    return res.status(200).json(sortedRecords);
  } catch (error) {
    console.error("Server error:", error);
    return res
      .status(500)
      .json({ error: "Server error", details: error instanceof Error ? error.message : String(error) });
  }
}
