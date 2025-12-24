import { createClient } from "@supabase/supabase-js";
import type { NextApiRequest, NextApiResponse } from "next";
import { SarvamAIClient } from "sarvamai";

const supabase = createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");
// sarvam client
const sarvamClient =
  process.env.SARVAM_API_KEY && process.env.SARVAM_API_KEY.trim()
    ? new SarvamAIClient({ apiSubscriptionKey: process.env.SARVAM_API_KEY.trim() })
    : null;

type AiMode = "summary" | "conclusion" | "tags";

function trimContext(text: string, maxChars = 30000) {
  // const compact = text.replace(/\s+/g, " ").trim();
  // return compact.slice(0, maxChars);
  return text;
}

function buildMessages(mode: AiMode, text: string, title?: string, name?: string, variant?: "primary" | "regen") {
  const baseInstruction =
    "You are an expert editor for academic PDF content. Use only the provided extracted text. Do not make up facts, add disclaimers, or include pre/post text. Keep output concise.";

  const label = title || name || "the article";

  if (mode === "summary") {
    const regenNote =
      variant === "regen" ? "Rewrite with different wording and emphasis (avoid repeating prior phrasing). " : "";
    return [
      { role: "system" as const, content: baseInstruction },
      {
        role: "user" as const,
        content: `${regenNote}Create a concise ~300-word paragraph summary of ${label}. Focus on the main arguments, findings, and scope. Avoid bullet points and avoid introductions like "Sure" or "Summary:".\n\nExtracted text:\n${text}`,
      },
    ];
  }

  if (mode === "conclusion") {
    const regenNote =
      variant === "regen"
        ? "Provide a fresh take (avoid repeating prior wording) and keep focus on implications. "
        : "";
    return [
      { role: "system" as const, content: baseInstruction },
      {
        role: "user" as const,
        content: `${regenNote}Write a 110-140 word conclusion capturing key implications or takeaways from ${label}. Do not repeat the summary; emphasize outcomes and significance. Output only the conclusion paragraph.\n\nExtracted text:\n${text}`,
      },
    ];
  }

  // tags
  const regenNote =
    variant === "regen" ? "Generate an alternate set (avoid generic or previously suggested words). " : "";
  return [
    { role: "system" as const, content: baseInstruction },
    {
      role: "user" as const,
      content: `${regenNote}Generate exactly 8 short, domain-specific tags for ${label} based on the extracted text. Each tag must be 2-3 words, Title Case (capitalize each word), and concise. Avoid generic words (article, pdf, document) and do not output lowercase lists. Return only a comma-separated list with no numbering or extra words.\n\nExtracted text:\n${text}`,
    },
  ];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!sarvamClient) {
    return res.status(500).json({ error: "SARVAM_API_KEY is not configured on the server." });
  }

  try {
    const { recordId, mode, variant } = req.body as { recordId?: number; mode?: AiMode; variant?: "primary" | "regen" };

    if (!recordId || !mode || !["summary", "conclusion", "tags"].includes(mode)) {
      return res.status(400).json({ error: "recordId and valid mode are required." });
    }

    const { data: record, error } = await supabase
      .from("records")
      .select("id, name, title_name, extracted_text")
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
    const messages = buildMessages(
      mode,
      context,
      record.title_name,
      record.name,
      variant === "regen" ? "regen" : "primary",
    );

    const response = await sarvamClient.chat.completions({
      messages,
      temperature: mode === "tags" ? 0.1 : 0.25,
      top_p: 0.9,
      max_tokens: mode === "tags" ? 96 : 360,
      n: 1,
    });

    const content = response.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return res.status(500).json({ error: "AI response was empty." });
    }

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
