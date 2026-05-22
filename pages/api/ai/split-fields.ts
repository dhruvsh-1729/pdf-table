import type { NextApiRequest, NextApiResponse } from "next";
import { createDeepSeekChatCompletion, hasDeepSeekApiKey } from "@/lib/aiText";
import { buildStoredPromptMessages } from "@/lib/aiPromptStore";
import type { SplitPromptFieldKey } from "@/lib/aiPromptTypes";

type FieldKey = SplitPromptFieldKey;
type Variant = "primary" | "regen";

function trimContext(text: string, maxChars = 12000) {
  if (!text) return "";
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.slice(0, maxChars);
}

function normalizeTags(rawText: string) {
  const normalizeTag = (raw: string) => {
    const cleaned = raw.replace(/^[-•\d.)\s]+/, "").trim();
    if (!cleaned) return null;
    const words = cleaned.split(/\s+/).filter(Boolean).slice(0, 3);
    if (words.length < 2 || words.length > 3) return null;
    const titleCased = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
    return titleCased;
  };

  const rawTags = rawText.split(/[\n,;]+/).map((t) => t.trim());
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const raw of rawTags) {
    const normalized = normalizeTag(raw);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(normalized);
    if (tags.length >= 10) break;
  }

  return tags;
}

function normalizeAuthors(rawText: string) {
  const cleaned = rawText
    .split(/[\n,;]+/g)
    .map((t) => t.replace(/^[-•\d.)\s]+/, "").trim())
    .filter(Boolean);

  const authors: string[] = [];
  const seen = new Set<string>();

  for (const item of cleaned) {
    if (!item || /^unknown$/i.test(item)) continue;
    const normalized = item.replace(/\s+/g, " ").trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    authors.push(normalized);
    if (authors.length >= 12) break;
  }

  return authors;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!hasDeepSeekApiKey()) {
    return res.status(500).json({ error: "DEEPSEEK_API_KEY is not configured on the server." });
  }

  try {
    const { text, field, label, variant } = req.body as {
      text?: string;
      field?: FieldKey;
      label?: string;
      variant?: Variant;
    };

    if (!text || !field) {
      return res.status(400).json({ error: "Both 'text' and 'field' are required." });
    }

    if (
      ![
        "name",
        "volume",
        "number",
        "timestamp",
        "title_name",
        "page_numbers",
        "summary",
        "conclusion",
        "tags",
        "authors",
      ].includes(field)
    ) {
      return res.status(400).json({ error: "Unsupported field." });
    }

    const context = trimContext(text, field === "summary" || field === "conclusion" ? 12000 : 8000);
    const subject = label ? `for ${label}` : "for this PDF split";
    const messages = await buildStoredPromptMessages({
      scope: "split",
      fieldKey: field,
      variant: variant === "regen" ? "regen" : "primary",
      variables: {
        subject,
        text: context,
      },
    });

    const isLongForm = field === "summary" || field === "conclusion";
    const isListField = field === "tags" || field === "authors";
    const content = await createDeepSeekChatCompletion({
      messages,
      temperature: isListField ? 0.1 : isLongForm ? 0.25 : 0.15,
      topP: 0.9,
      maxTokens: field === "summary" ? 420 : field === "conclusion" ? 200 : isListField ? 96 : 80,
    });

    if (field === "tags") {
      const tags = normalizeTags(content);
      if (!tags.length) return res.status(500).json({ error: "No tags returned." });
      return res.status(200).json({ tags });
    }

    if (field === "authors") {
      const authors = normalizeAuthors(content);
      if (!authors.length) return res.status(500).json({ error: "No authors returned." });
      return res.status(200).json({ authors });
    }

    return res.status(200).json({ value: content });
  } catch (err) {
    console.error("split-fields AI failed:", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : "AI generation failed." });
  }
}
