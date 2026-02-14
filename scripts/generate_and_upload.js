#!/usr/bin/env node
/**
 * generate_and_upload_pdfs.js
 *
 * 1. Fetches records from Supabase that need PDF generation.
 * 2. Generates a PDF from extracted_text using PDFKit.
 * 3. Uploads the PDF to UploadThing.
 * 4. Updates the record in Supabase with the new pdf_url and pdf_public_id.
 */

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const PDFDocument = require("pdfkit");
const { UTApi } = require("uploadthing/server");
const { Readable } = require("stream");

// --- CONFIG ---
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const UPLOADTHING_TOKEN = process.env.UPLOADTHING_TOKEN || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !UPLOADTHING_TOKEN) {
  console.error(
    "Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or UPLOADTHING_TOKEN",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const utapi = new UTApi({ token: UPLOADTHING_TOKEN });

// --- HELPERS ---

/**
 * Generates a PDF buffer from text.
 */
async function generatePdfBuffer(text, title) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const buffers = [];
    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    // Title
    doc.fontSize(20).font("Helvetica-Bold").text(title, { align: "center" });
    doc.moveDown();

    // Body Text
    doc.fontSize(12).font("Helvetica").text(text, {
      align: "justify",
      lineGap: 2,
    });

    doc.end();
  });
}

/**
 * Uploads a buffer to UploadThing.
 */
async function uploadToUploadThing(buffer, filename) {
  // Convert buffer to a File-like object for UTApi
  const file = new File([buffer], filename, { type: "application/pdf" });
  const response = await utapi.uploadFiles(file);

  if (response.error) {
    throw new Error(`UploadThing error: ${response.error.message}`);
  }
  return response.data; // { key, url, ... }
}

/**
 * Main execution loop.
 */
async function run() {
  console.log("Starting PDF generation and upload process...");

  // 1. Fetch records where extracted_text exists but pdf_url is not from UploadThing (or is null)
  // Adjust the filter as needed. Here we look for records that don't have a pdf_public_id yet.
  const { data: records, error } = await supabase
    .from("records")
    .select("*")
    .not("extracted_text", "is", null)
    .eq("name", "Vedanta Kesari"); // Example filter; adjust as needed
  // .limit(10); // Process in batches

  if (error) {
    console.error("Error fetching records:", error.message);
    return;
  }

  if (!records || records.length === 0) {
    console.log("No records found that need PDF generation.");
    return;
  }

  console.log(`Found ${records.length} records to process.`);

  for (const record of records) {
    try {
      console.log(`Processing record ${record.id}: ${record.title_name || record.name}`);

      const title = record.title_name || record.name || "Vedanta Kesari Article";
      const filename = `${record.id}-${Date.now()}.pdf`;

      // 2. Generate PDF
      const pdfBuffer = await generatePdfBuffer(record.extracted_text, title);

      // 3. Upload to UploadThing
      const uploadResult = await uploadToUploadThing(pdfBuffer, filename);
      const finalUrl = uploadResult.ufsUrl;
      const fileKey = uploadResult.key;

      console.log(`Uploaded to UploadThing: ${finalUrl}`);

      // 4. Update Supabase
      const { error: updateError } = await supabase
        .from("records")
        .update({
          pdf_url: finalUrl,
          pdf_public_id: fileKey,
        })
        .eq("id", record.id);

      if (updateError) {
        console.error(`Failed to update record ${record.id}:`, updateError.message);
      } else {
        console.log(`✅ Successfully updated record ${record.id}`);
      }
    } catch (err) {
      console.error(`Error processing record ${record.id}:`, err.message);
    }
  }

  console.log("Process completed.");
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
