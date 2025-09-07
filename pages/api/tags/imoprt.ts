import { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import formidable from "formidable";
import fs from "fs";
import csv from "csv-parser";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Disable Next.js body parsing to handle file uploads
export const config = {
  api: {
    bodyParser: false,
  },
};

interface TagRow {
  id?: string;
  name: string;
  important?: string;
  created_at?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "POST") {
    try {
      // Parse the uploaded file
      const form = formidable({});
      const [fields, files] = await form.parse(req);

      const file = Array.isArray(files.file) ? files.file[0] : files.file;
      if (!file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Validate file type
      if (!file.originalFilename?.toLowerCase().endsWith(".csv")) {
        return res.status(400).json({ error: "Only CSV files are allowed" });
      }

      // Validate file size (10MB limit)
      if (file.size > 10 * 1024 * 1024) {
        return res.status(400).json({ error: "File size must be less than 10MB" });
      }

      // Parse CSV file
      const tags: TagRow[] = [];
      const errors: string[] = [];

      await new Promise<void>((resolve, reject) => {
        fs.createReadStream(file.filepath)
          .pipe(
            csv({
              // Remove empty rows manually
              headers: ["id", "name", "important", "created_at"], // Expected headers
              strict: false,
            }),
          )
          .on("data", (row: any) => {
            // Skip empty rows and header row if it contains header names
            if (
              Object.values(row).some((value) => typeof value === "string" && value.trim()) &&
              row.name &&
              row.name.toLowerCase() !== "name"
            ) {
              tags.push({
                id: row.id?.trim(),
                name: row.name?.trim(),
                important: row.important?.trim(),
                created_at: row.created_at?.trim(),
              });
            }
          })
          .on("end", resolve)
          .on("error", reject);
      });

      if (tags.length === 0) {
        return res.status(400).json({
          error: "No valid tag data found in CSV",
          details: "Expected format: id,name,important,created_at",
        });
      }

      // Validate and process tags
      const validTags: Array<{
        id?: number;
        name: string;
        important: boolean | null;
        created_at?: string;
      }> = [];

      for (let i = 0; i < tags.length; i++) {
        const tag = tags[i];
        const lineNum = i + 2; // +2 because of header and 0-indexing

        // Validate name
        if (!tag.name) {
          errors.push(`Line ${lineNum}: Name is required`);
          continue;
        }

        if (tag.name.length > 100) {
          errors.push(`Line ${lineNum}: Name must be less than 100 characters`);
          continue;
        }

        if (!/^[a-zA-Z0-9\s\-_]+$/.test(tag.name)) {
          errors.push(`Line ${lineNum}: Name can only contain letters, numbers, spaces, hyphens, and underscores`);
          continue;
        }

        // Parse important field
        let important: boolean | null = null;
        if (tag.important) {
          const importantLower = tag.important.toLowerCase();
          if (importantLower === "true" || importantLower === "1") {
            important = true;
          } else if (importantLower === "false" || importantLower === "0") {
            important = false;
          } else if (importantLower !== "" && importantLower !== "null") {
            errors.push(`Line ${lineNum}: Important field must be true, false, 1, 0, or empty`);
            continue;
          }
        }

        // Parse ID (optional, for updates)
        let id: number | undefined;
        if (tag.id && tag.id !== "") {
          const parsedId = parseInt(tag.id);
          if (isNaN(parsedId)) {
            errors.push(`Line ${lineNum}: ID must be a number or empty for new tags`);
            continue;
          }
          id = parsedId;
        }

        validTags.push({
          id,
          name: tag.name,
          important,
          created_at: tag.created_at || undefined,
        });
      }

      // Stop if there are validation errors
      if (errors.length > 0) {
        return res.status(400).json({
          error: "Validation errors found in CSV",
          details: errors.join("\n"),
        });
      }

      // Process tags: separate new tags from updates
      const newTags = validTags.filter((tag) => !tag.id);
      const updateTags = validTags.filter((tag) => tag.id);

      let insertedCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;

      // Insert new tags
      if (newTags.length > 0) {
        const { data: insertedData, error: insertError } = await supabase
          .from("tags")
          .insert(
            newTags.map((tag) => ({
              name: tag.name,
              important: tag.important,
            })),
          )
          .select("id");

        if (insertError) {
          // Handle unique constraint violations more gracefully
          if (insertError.code === "23505") {
            return res.status(400).json({
              error: "Duplicate tag names found",
              details: "One or more tag names already exist in the database",
            });
          }
          throw insertError;
        }

        insertedCount = insertedData?.length || 0;
      }

      // Update existing tags
      for (const tag of updateTags) {
        try {
          const { error: updateError } = await supabase
            .from("tags")
            .update({
              name: tag.name,
              important: tag.important,
            })
            .eq("id", tag.id);

          if (updateError) {
            if (updateError.code === "23505") {
              skippedCount++;
              continue; // Skip duplicate names
            }
            throw updateError;
          }

          updatedCount++;
        } catch (error) {
          console.error(`Error updating tag ${tag.id}:`, error);
          skippedCount++;
        }
      }

      // Clean up uploaded file
      try {
        fs.unlinkSync(file.filepath);
      } catch (cleanupError) {
        console.error("Error cleaning up uploaded file:", cleanupError);
      }

      return res.status(200).json({
        message: `Import completed: ${insertedCount} created, ${updatedCount} updated${skippedCount > 0 ? `, ${skippedCount} skipped` : ""}`,
        inserted: insertedCount,
        updated: updatedCount,
        skipped: skippedCount,
        total: validTags.length,
      });
    } catch (error) {
      console.error("Error importing tags:", error);
      return res.status(500).json({
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
