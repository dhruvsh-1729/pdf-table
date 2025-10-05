import { createClient } from "@supabase/supabase-js";
import { NextApiRequest, NextApiResponse } from "next";

// Initialize Supabase client
const supabase = createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");

interface DeleteRecordResponse {
  success: boolean;
  message: string;
  deletedRecordId?: number;
  error?: string;
}

/**
 * DELETE /api/records/[id]
 * Deletes a record and all its related data in the correct order
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<DeleteRecordResponse>) {
  // Only allow DELETE method
  if (req.method !== "DELETE") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed",
      error: "Only DELETE method is supported",
    });
  }

  try {
    // Extract record ID from query parameters
    const { id } = req.query;

    if (!id || Array.isArray(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid record ID",
        error: "Record ID must be a single numeric value",
      });
    }

    const recordId = parseInt(id, 10);

    if (isNaN(recordId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid record ID",
        error: "Record ID must be a valid number",
      });
    }

    // Verify the record exists before attempting deletion
    const { data: existingRecord, error: fetchError } = await supabase
      .from("records")
      .select("id")
      .eq("id", recordId)
      .single();

    if (fetchError || !existingRecord) {
      return res.status(404).json({
        success: false,
        message: "Record not found",
        error: "No record exists with the provided ID",
      });
    }

    // Delete related records in the correct order (child tables first)

    // 1. Delete from conclusions table
    const { error: conclusionsError } = await supabase.from("conclusions").delete().eq("record_id", recordId);

    if (conclusionsError) {
      throw new Error(`Failed to delete conclusions: ${conclusionsError.message}`);
    }

    // 2. Delete from summaries table
    const { error: summariesError } = await supabase.from("summaries").delete().eq("record_id", recordId);

    if (summariesError) {
      throw new Error(`Failed to delete summaries: ${summariesError.message}`);
    }

    // 3. Delete from record_authors junction table
    const { error: recordAuthorsError } = await supabase.from("record_authors").delete().eq("record_id", recordId);

    if (recordAuthorsError) {
      throw new Error(`Failed to delete record_authors: ${recordAuthorsError.message}`);
    }

    // 4. Delete from record_tags junction table
    const { error: recordTagsError } = await supabase.from("record_tags").delete().eq("record_id", recordId);

    if (recordTagsError) {
      throw new Error(`Failed to delete record_tags: ${recordTagsError.message}`);
    }

    // 5. Finally, delete the main record
    const { error: recordError } = await supabase.from("records").delete().eq("id", recordId);

    if (recordError) {
      throw new Error(`Failed to delete record: ${recordError.message}`);
    }

    // Success response
    return res.status(200).json({
      success: true,
      message: "Record and all related data deleted successfully",
      deletedRecordId: recordId,
    });
  } catch (error) {
    console.error("Error deleting record:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error occurred",
    });
  }
}

/**
 * Alternative: Bulk delete function (can be used in other contexts)
 */
export async function deleteRecordById(recordId: number): Promise<void> {
  // Delete in the correct order
  await supabase.from("conclusions").delete().eq("record_id", recordId);
  await supabase.from("summaries").delete().eq("record_id", recordId);
  await supabase.from("record_authors").delete().eq("record_id", recordId);
  await supabase.from("record_tags").delete().eq("record_id", recordId);

  const { error } = await supabase.from("records").delete().eq("id", recordId);

  if (error) {
    throw new Error(`Failed to delete record: ${error.message}`);
  }
}

/**
 * Batch delete multiple records
 */
export async function deleteMultipleRecords(recordIds: number[]): Promise<{
  success: number[];
  failed: number[];
}> {
  const results = {
    success: [] as number[],
    failed: [] as number[],
  };

  for (const recordId of recordIds) {
    try {
      await deleteRecordById(recordId);
      results.success.push(recordId);
    } catch (error) {
      console.error(`Failed to delete record ${recordId}:`, error);
      results.failed.push(recordId);
    }
  }

  return results;
}
