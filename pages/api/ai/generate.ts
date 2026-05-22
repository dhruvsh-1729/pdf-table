import { createClient } from "@supabase/supabase-js";
import type { NextApiRequest, NextApiResponse } from "next";
import { createDeepSeekChatCompletion, hasDeepSeekApiKey } from "@/lib/aiText";
import { buildStoredPromptMessages } from "@/lib/aiPromptStore";
import { extractMagazineName } from "@/lib/recordRelations";

const supabase = createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");

type AiMode = "summary" | "conclusion" | "tags";

function trimContext(text: string, maxChars = 30000) {
  // const compact = text.replace(/\s+/g, " ").trim();
  // return compact.slice(0, maxChars);
  return text;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!hasDeepSeekApiKey()) {
    return res.status(500).json({ error: "DEEPSEEK_API_KEY is not configured on the server." });
  }

  try {
    const { recordId, mode, variant } = req.body as { recordId?: number; mode?: AiMode; variant?: "primary" | "regen" };

    if (!recordId || !mode || !["summary", "conclusion", "tags"].includes(mode)) {
      return res.status(400).json({ error: "recordId and valid mode are required." });
    }

    const { data: record, error } = await supabase
      .from("records")
      .select("id, title_name, extracted_text, magazines(id, name)")
      .eq("id", recordId)
      .single();

    if (error || !record) {
      return res.status(404).json({ error: "Record not found." });
    }

    const extracted = record.extracted_text;
    if (!extracted || !extracted.trim()) {
      return res.status(400).json({ error: "No extracted text is available. Extract text first." });
    }

    const context = trimContext(extracted, mode === "tags" ? 6000 : 9000);
    const label = record.title_name || extractMagazineName(record) || "the article";
    const messages = await buildStoredPromptMessages({
      scope: "record",
      fieldKey: mode,
      variant: variant === "regen" ? "regen" : "primary",
      variables: {
        label,
        text: context,
      },
    });

    const content = await createDeepSeekChatCompletion({
      messages,
      temperature: mode === "tags" ? 0.1 : 0.25,
      topP: 0.9,
      maxTokens: mode === "tags" ? 96 : 360,
    });

    if (mode === "tags") {
      const normalizeTag = (raw: string) => {
        const cleaned = raw.replace(/^[-•\d.)\s]+/, "").trim();
        if (!cleaned) return null;
        const words = cleaned.split(/\s+/).filter(Boolean).slice(0, 3);
        if (words.length === 0) return null;
        const titleCased = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
        return titleCased;
      };

      const rawTags = content.split(/[\n,;]+/).map((t) => t.trim());
      const seen = new Set<string>();
      const tags: string[] = [];

      for (const raw of rawTags) {
        const normalized = normalizeTag(raw);
        if (!normalized) continue;
        const key = normalized.toLowerCase();
        if (seen.has(key)) continue;
        const wordCount = normalized.split(/\s+/).length;
        if (wordCount < 1 || wordCount > 3) continue;
        seen.add(key);
        tags.push(normalized);
        if (tags.length >= 8) break;
      }

      if (tags.length === 0) {
        return res.status(500).json({ error: "AI did not return any tags." });
      }

      return res.status(200).json({ tags });
    }

    return res.status(200).json({ text: content });
  } catch (err) {
    console.error("AI generation failed:", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : "AI generation failed." });
  }
}
