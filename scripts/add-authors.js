const { createClient } = require("@supabase/supabase-js");
const Papa = require("papaparse");
const fs = require("fs");

const supabase = createClient(
  "https://hzdjfyzrladnxjerisnm.supabase.co" || "",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6ZGpmeXpybGFkbnhqZXJpc25tIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODg3NTAzMywiZXhwIjoyMDY0NDUxMDMzfQ.ahutTLsn1yeAzCEFzJpxxECyW4LX6AQo7euBAMMlXQ4" ||
    "",
);

/**
 * Smart name matching function that handles various prefixes, suffixes, and formatting differences
 */
function normalizeAuthorName(name) {
  if (!name) return "";

  return (
    name
      // Remove common prefixes and suffixes
      .replace(/^(Dr\.?\s+|Prof\.?\s+|Mr\.?\s+|Mrs\.?\s+|Ms\.?\s+|Miss\.?\s+)/i, "")
      .replace(/\s+(Jr\.?|Sr\.?|III?|PhD\.?|M\.?A\.?|Ph\.?D\.?)$/i, "")
      // Remove extra spaces and normalize
      .replace(/\s+/g, " ")
      // Remove periods and commas that might be inconsistent
      .replace(/[.,]/g, "")
      // Convert to lowercase for comparison
      .toLowerCase()
      .trim()
  );
}

/**
 * Calculate similarity score between two normalized names using Levenshtein distance
 */
function calculateSimilarity(name1, name2) {
  const norm1 = normalizeAuthorName(name1);
  const norm2 = normalizeAuthorName(name2);

  // Exact match after normalization
  if (norm1 === norm2) return 1.0;

  // Calculate Levenshtein distance
  const matrix = [];
  const len1 = norm1.length;
  const len2 = norm2.length;

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (norm1.charAt(i - 1) === norm2.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1, // deletion
        );
      }
    }
  }

  const distance = matrix[len1][len2];
  const maxLength = Math.max(len1, len2);
  return maxLength === 0 ? 1.0 : 1.0 - distance / maxLength;
}

/**
 * Find the best matching author from existing database records
 */
function findBestMatch(newAuthorName, existingAuthors) {
  const SIMILARITY_THRESHOLD = 0.85; // Adjust this threshold as needed (0.85 = 85% similarity)

  let bestMatch = null;
  let bestScore = 0;

  for (const existingAuthor of existingAuthors) {
    const similarity = calculateSimilarity(newAuthorName, existingAuthor.name);

    if (similarity > bestScore && similarity >= SIMILARITY_THRESHOLD) {
      bestScore = similarity;
      bestMatch = existingAuthor;
    }
  }

  return bestMatch;
}

/**
 * Parse CSV file and return author data
 */
async function parseCSVFile(filePath) {
  return new Promise((resolve, reject) => {
    const csvFile = fs.readFileSync(filePath, "utf8");

    Papa.parse(csvFile, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      delimitersToGuess: [",", "\t", "|", ";"],
      complete: (results) => {
        if (results.errors.length > 0) {
          console.warn("CSV parsing warnings:", results.errors);
        }
        resolve(results.data);
      },
      error: (error) => {
        reject(error);
      },
    });
  });
}

/**
 * Main function to bulk upload authors
 */
async function bulkUploadAuthors(csvFilePath) {
  try {
    console.log("🚀 Starting bulk author upload process...");

    // Parse CSV file
    console.log("📄 Parsing CSV file...");
    const csvData = await parseCSVFile(csvFilePath);
    console.log(`Found ${csvData.length} authors in CSV file`);

    // Get all existing authors from database
    console.log("🔍 Fetching existing authors from database...");
    const { data: existingAuthors, error: fetchError } = await supabase
      .from("authors")
      .select("id, name, description, cover_url, national");

    if (fetchError) {
      throw new Error(`Failed to fetch existing authors: ${fetchError.message}`);
    }

    console.log(`Found ${existingAuthors?.length || 0} existing authors in database`);

    // Process each author from CSV
    const results = {
      created: [],
      updated: [],
      skipped: [],
      errors: [],
    };

    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i];
      const authorName = row["Author Name"];
      const description = row["Description"];

      // Skip rows without author name
      if (!authorName || authorName.trim() === "") {
        console.log(`⚠️  Skipping row ${i + 1}: No author name provided`);
        results.skipped.push({ row: i + 1, reason: "No author name" });
        continue;
      }

      try {
        console.log(`\n🔄 Processing: ${authorName}`);

        // Find best matching existing author
        const bestMatch = findBestMatch(authorName, existingAuthors || []);

        if (bestMatch) {
          // Update existing author if description is different or missing
          const shouldUpdate =
            (!bestMatch.description && description) || (bestMatch.description !== description && description);

          if (shouldUpdate) {
            console.log(`📝 Updating existing author: ${bestMatch.name} (matched with ${authorName})`);

            const { error: updateError } = await supabase
              .from("authors")
              .update({
                description: description || bestMatch.description,
                // You can add more fields to update here if needed
              })
              .eq("id", bestMatch.id);

            if (updateError) {
              console.error(`❌ Error updating ${authorName}:`, updateError.message);
              results.errors.push({ name: authorName, error: updateError.message });
            } else {
              console.log(`✅ Updated: ${bestMatch.name}`);
              results.updated.push({
                name: authorName,
                matchedWith: bestMatch.name,
                id: bestMatch.id,
              });
            }
          } else {
            console.log(`⏭️  Author already exists with same data: ${bestMatch.name}`);
            results.skipped.push({
              name: authorName,
              matchedWith: bestMatch.name,
              reason: "Already exists with same data",
            });
          }
        } else {
          // Create new author
          console.log(`➕ Creating new author: ${authorName}`);

          const { data: newAuthor, error: createError } = await supabase
            .from("authors")
            .insert({
              name: authorName.trim(),
              description: description || null,
              // cover_url and national can be added later or set to null
              cover_url: null,
              national: null,
            })
            .select()
            .single();

          if (createError) {
            console.error(`❌ Error creating ${authorName}:`, createError.message);
            results.errors.push({ name: authorName, error: createError.message });
          } else {
            console.log(`✅ Created: ${authorName}`);
            results.created.push({
              name: authorName,
              id: newAuthor.id,
            });
          }
        }

        // Add a small delay to avoid hitting rate limits
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`❌ Unexpected error processing ${authorName}:`, error);
        results.errors.push({
          name: authorName,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Print summary
    console.log("\n📊 BULK UPLOAD SUMMARY");
    console.log("========================");
    console.log(`✅ Created: ${results.created.length} authors`);
    console.log(`📝 Updated: ${results.updated.length} authors`);
    console.log(`⏭️  Skipped: ${results.skipped.length} authors`);
    console.log(`❌ Errors: ${results.errors.length} authors`);

    if (results.created.length > 0) {
      console.log("\n📝 Created Authors:");
      results.created.forEach((author) => console.log(`  - ${author.name} (ID: ${author.id})`));
    }

    if (results.updated.length > 0) {
      console.log("\n🔄 Updated Authors:");
      results.updated.forEach((author) =>
        console.log(`  - ${author.name} (matched with: ${author.matchedWith}, ID: ${author.id})`),
      );
    }

    if (results.errors.length > 0) {
      console.log("\n❌ Errors:");
      results.errors.forEach((error) => console.log(`  - ${error.name}: ${error.error}`));
    }

    return results;
  } catch (error) {
    console.error("💥 Fatal error in bulk upload process:", error);
    throw error;
  }
}

// API endpoint handler for Next.js
// export default async function handler(req, res) {
//   if (req.method !== "POST") {
//     return res.status(405).json({ error: "Method not allowed" });
//   }

//   try {
//     // Path to your CSV file (adjust this path as needed)
//     const csvFilePath = path.join(process.cwd(), "data", "authors.csv");

//     // Check if file exists
//     if (!fs.existsSync(csvFilePath)) {
//       return res.status(400).json({
//         error: "CSV file not found",
//         path: csvFilePath,
//       });
//     }

//     const results = await bulkUploadAuthors(csvFilePath);

//     res.status(200).json({
//       success: true,
//       message: "Bulk upload completed",
//       results,
//     });
//   } catch (error) {
//     console.error("API Error:", error);
//     res.status(500).json({
//       success: false,
//       error: error instanceof Error ? error.message : "Unknown error occurred",
//     });
//   }
// }

// If running as a standalone script (not as API endpoint)
if (require.main === module) {
  // Adjust the path to your CSV file
  const csvFilePath = "./authors.csv";

  bulkUploadAuthors(csvFilePath)
    .then((results) => {
      console.log("\n🎉 Bulk upload completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n💥 Bulk upload failed:", error);
      process.exit(1);
    });
}
