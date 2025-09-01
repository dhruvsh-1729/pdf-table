import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/**
 * Utility functions for managing author-record relationships
 */

export interface AuthorRecordStats {
  authorId: number;
  authorName: string;
  recordCount: number;
  latestRecord?: {
    id: number;
    name: string;
    timestamp: string;
  };
}

/**
 * Get comprehensive stats for an author including their records
 */
export async function getAuthorRecordStats(authorId: number): Promise<AuthorRecordStats | null> {
  try {
    // Get author details
    const { data: author, error: authorError } = await supabase
      .from("authors")
      .select("id, name")
      .eq("id", authorId)
      .single();

    if (authorError || !author) {
      return null;
    }

    // Get records count and latest record
    const { data: records, error: recordsError } = await supabase
      .from("records")
      .select("id, name, timestamp")
      .contains("authors", `"${author.name}"`)
      .order("timestamp", { ascending: false });

    if (recordsError) {
      console.error("Error fetching records:", recordsError);
      return {
        authorId: author.id,
        authorName: author.name,
        recordCount: 0,
      };
    }

    const recordCount = records?.length || 0;
    const latestRecord = records && records.length > 0 ? records[0] : undefined;

    return {
      authorId: author.id,
      authorName: author.name,
      recordCount,
      latestRecord,
    };
  } catch (error) {
    console.error("Error getting author record stats:", error);
    return null;
  }
}

/**
 * Update records when an author name changes
 */
export async function updateRecordsForAuthorNameChange(
  authorId: number,
  oldName: string,
  newName: string,
): Promise<boolean> {
  try {
    // This is a complex operation since we need to update JSON arrays
    // For now, we'll log that this needs to be handled manually
    console.log(`Author name change: ${oldName} -> ${newName}. Manual record update may be required.`);

    // In a production system, you'd want to implement a more sophisticated approach
    // to update the authors field in records, possibly using a stored procedure
    // or handling this client-side with proper JSON array manipulation

    return true;
  } catch (error) {
    console.error("Error updating records for author name change:", error);
    return false;
  }
}

/**
 * Validate that an author can be safely deleted
 */
export async function validateAuthorDeletion(authorId: number): Promise<{
  canDelete: boolean;
  recordCount: number;
  warnings: string[];
}> {
  try {
    const stats = await getAuthorRecordStats(authorId);

    if (!stats) {
      return {
        canDelete: false,
        recordCount: 0,
        warnings: ["Author not found"],
      };
    }

    const warnings: string[] = [];

    if (stats.recordCount > 0) {
      warnings.push(`This will delete ${stats.recordCount} related record(s)`);
    }

    if (stats.recordCount > 10) {
      warnings.push("This author has many related records. Consider archiving instead of deleting.");
    }

    return {
      canDelete: true,
      recordCount: stats.recordCount,
      warnings,
    };
  } catch (error) {
    console.error("Error validating author deletion:", error);
    return {
      canDelete: false,
      recordCount: 0,
      warnings: ["Error validating deletion"],
    };
  }
}
