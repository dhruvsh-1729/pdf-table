// pages/api/pdf/view.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getUploadThingUrl } from "@/lib/uploadthing";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Expect ?id=<uploadthing-key> or ?id=<absolute-url>
    const id = (req.query.id as string) || "";
    if (!id) {
      return res.status(400).json({ error: "Missing 'id' parameter." });
    }

    let fileUrl: string | null = null;
    if (/^https?:\/\//i.test(id)) {
      try {
        const parsed = new URL(id);
        const host = parsed.hostname;
        if (!/utfs\.io|ufs\.sh|uploadthing\.com/i.test(host)) {
          return res.status(400).json({ error: "Unsupported file host." });
        }
        fileUrl = id;
      } catch {
        return res.status(400).json({ error: "Invalid URL." });
      }
    } else {
      fileUrl = await getUploadThingUrl(id);
    }
    if (!fileUrl) {
      return res.status(404).json({ error: "Unable to resolve file URL." });
    }

    // Stream from UploadThing to client
    const resp = await fetch(fileUrl);
    if (!resp.ok || !resp.body) {
      return res.status(resp.status).end(await resp.text());
    }

    // Forward headers but force inline PDF
    res.setHeader("Content-Type", "application/pdf");
    // inline + filename fallback
    let filename = "file.pdf";
    try {
      const parsed = new URL(fileUrl);
      filename = parsed.pathname.split("/").pop() || filename;
    } catch {
      filename = id.split("/").pop() || filename;
    }
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);

    // Optional cache headers (adjust as needed)
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600, stale-while-revalidate=600");

    // Pipe the body
    const reader = resp.body.getReader();
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
