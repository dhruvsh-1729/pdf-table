// pages/api/pdf/view.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { v2 as cloudinary } from "cloudinary";

// Configure once
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "",
  api_key: process.env.CLOUDINARY_API_KEY || "",
  api_secret: process.env.CLOUDINARY_API_SECRET || "",
  secure: true,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Expect ?id=pdfs/your-file-123.pdf (public_id **WITH** extension)
    // Optionally accept ?v=<version> to be extra cache-stable; not required.
    const id = (req.query.id as string) || "";
    const v = (req.query.v as string) || undefined;

    if (!id || !id.endsWith(".pdf")) {
      return res.status(400).json({ error: "Missing or invalid 'id' (must include .pdf)" });
    }

    // Build a signed (no transformations) raw URL. (We do NOT add fl_inline here.)
    const cloudUrl = cloudinary.url(id, {
      resource_type: "raw",
      type: "upload",
      sign_url: true,
      secure: true,
      ...(v ? { version: v } : {}),
    });

    // Stream from Cloudinary to client
    const resp = await fetch(cloudUrl);
    if (!resp.ok || !resp.body) {
      return res.status(resp.status).end(await resp.text());
    }

    // Forward headers but force inline PDF
    res.setHeader("Content-Type", "application/pdf");
    // inline + filename fallback
    const filename = id.split("/").pop() || "file.pdf";
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);

    // Optional cache headers (adjust as needed)
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600, stale-while-revalidate=600");

    // Pipe the body
    const reader = resp.body.getReader();
    const encoder = new TextEncoder();
    res.status(200);
    // Use a manual pipe since Next doesn't support res.flush() by default
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (e: any) {
    console.error("PDF view proxy error:", e?.message || e);
    res.status(500).json({ error: "Failed to proxy PDF" });
  }
}
