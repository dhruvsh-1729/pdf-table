import { createClient } from "@supabase/supabase-js";
import type { NextApiRequest, NextApiResponse } from "next";
import { invalidateCache } from "./records-paginated";

const supabase = createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method === "GET") {
    const { recordId } = req.query;
    if (!recordId) return res.status(400).json({ error: "Record ID is required" });

    const parsedRecordId = Array.isArray(recordId) ? parseInt(recordId[0], 10) : parseInt(recordId as string, 10);
    if (isNaN(parsedRecordId)) return res.status(400).json({ error: "Invalid record ID" });

    try {
      const { data, error } = await supabase
        .from("record_authors")
        .select("authors(id, name)")
        .eq("record_id", parsedRecordId);

      if (error) throw error;
      const authors = (data || []).map((item: any) => item.authors);
      return res.status(200).json(authors);
    } catch (error) {
      return res.status(500).json({ error: "Error fetching record authors", details: (error as Error).message });
    }
  } else if (req.method === "POST") {
    const { recordId, authorIds } = req.body;
    if (recordId === undefined || !Array.isArray(authorIds)) {
      return res.status(400).json({ error: "Record ID and author IDs array are required" });
    }

    const parsedRecordId = typeof recordId === "string" ? parseInt(recordId, 10) : recordId;
    if (isNaN(parsedRecordId)) return res.status(400).json({ error: "Invalid record ID" });

    const sanitizedAuthorIds = authorIds
      .map((id: any) => (typeof id === "string" ? parseInt(id, 10) : id))
      .filter((n: any) => Number.isInteger(n));

    if (sanitizedAuthorIds.length !== authorIds.length) {
      return res.status(400).json({ error: "One or more author IDs are invalid" });
    }

    try {
      // Ensure all authors exist to prevent FK violation
      const { data: existingAuthors, error: authorsFetchError } = await supabase
        .from("authors")
        .select("id")
        .in("id", sanitizedAuthorIds);

      if (authorsFetchError) {
        return res.status(500).json({ error: "Error validating authors", details: authorsFetchError.message });
      }

      const existingIds = new Set((existingAuthors || []).map((a) => a.id));
      const missing = sanitizedAuthorIds.filter((id) => !existingIds.has(id));
      if (missing.length > 0) {
        return res.status(400).json({ error: "Some authors do not exist", missingAuthorIds: missing });
      }

      const { error } = await supabase
        .from("record_authors")
        .insert(sanitizedAuthorIds.map((authorId: number) => ({ record_id: parsedRecordId, author_id: authorId })));

      if (error) throw error;

      invalidateCache();

      return res.status(200).json({ message: "Authors assigned successfully" });
    } catch (error) {
      return res.status(500).json({ error: "Error assigning authors", details: (error as Error).message });
    }
  } else if (req.method === "DELETE") {
    const { recordId, authorIds } = req.body;
    if (recordId === undefined || !Array.isArray(authorIds)) {
      return res.status(400).json({ error: "Record ID and author IDs array are required" });
    }

    const parsedRecordId = typeof recordId === "string" ? parseInt(recordId, 10) : recordId;
    if (isNaN(parsedRecordId)) return res.status(400).json({ error: "Invalid record ID" });

    const sanitizedAuthorIds = authorIds
      .map((id: any) => (typeof id === "string" ? parseInt(id, 10) : id))
      .filter((n: any) => Number.isInteger(n));

    if (sanitizedAuthorIds.length === 0) {
      return res.status(400).json({ error: "No valid author IDs provided" });
    }

    try {
      const { error } = await supabase
        .from("record_authors")
        .delete()
        .eq("record_id", parsedRecordId)
        .in("author_id", sanitizedAuthorIds);

      if (error) throw error;

      invalidateCache();

      return res.status(200).json({ message: "Authors removed successfully" });
    } catch (error) {
      return res.status(500).json({ error: "Error removing authors", details: (error as Error).message });
    }
  } else {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
}
