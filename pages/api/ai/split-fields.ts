import type { NextApiRequest, NextApiResponse } from "next";
import { SarvamAIClient } from "sarvamai";

const sarvamClient =
  process.env.SARVAM_API_KEY && process.env.SARVAM_API_KEY.trim()
    ? new SarvamAIClient({ apiSubscriptionKey: process.env.SARVAM_API_KEY.trim() })
    : null;

type FieldKey =
  | "name"
  | "volume"
  | "number"
  | "timestamp"
  | "title_name"
  | "page_numbers"
  | "summary"
  | "conclusion"
  | "tags";

type Variant = "primary" | "regen";

const baseInstruction =
  "You are an expert metadata extractor for magazine PDFs. Use only the provided extracted text. Do not invent facts, add disclaimers, or include any labels. Return clean plain text only.";

function trimContext(text: string, maxChars = 12000) {
  if (!text) return "";
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.slice(0, maxChars);
}

function buildMessages(field: FieldKey, text: string, label?: string, variant: Variant = "primary") {
  const subject = label ? `for ${label}` : "for this PDF split";

  if (field === "name") {
    return [
      { role: "system" as const, content: baseInstruction },
      {
        role: "user" as const,
        content: `Identify the magazine or publication name ${subject}. Output only the most likely magazine title (max 60 characters). If nothing is clear, return "Unknown".\n\nExtracted text:\n${text}`,
      },
    ];
  }

  if (field === "volume") {
    return [
      { role: "system" as const, content: baseInstruction },
      {
        role: "user" as const,
        content: `Extract the volume identifier ${subject}. Prefer formats like "Volume 12" or "Vol. XII". Output only one value. If not found, return "Unknown".\n\nExtracted text:\n${text}`,
      },
    ];
  }

  if (field === "number") {
    return [
      { role: "system" as const, content: baseInstruction },
      {
        role: "user" as const,
        content: `Extract the issue/number/edition label ${subject}. Prefer forms such as "Issue 3", "No. 3", or "Number 3". Output only one value. If not found, return "Unknown".\n\nExtracted text:\n${text}`,
      },
    ];
  }

  if (field === "timestamp") {
    return [
      { role: "system" as const, content: baseInstruction },
      {
        role: "user" as const,
        content: `Return the publication date ${subject} as "MMM YYYY" (e.g., Jan 2024). If only a year is present, return the year. Use English month abbreviations. If unclear, return "Unknown".\n\nExtracted text:\n${text}`,
      },
    ];
  }

  if (field === "title_name") {
    const regenNote = variant === "regen" ? "Provide a fresh alternate wording. " : "";
    return [
      { role: "system" as const, content: baseInstruction },
      {
        role: "user" as const,
        content: `${regenNote}Provide the best short article title ${subject}. Keep it under 12 words, clear, and specific. Avoid publication names and filler words. If unclear, propose a precise 6-12 word title based only on the text.\n\nExtracted text:\n${text}`,
      },
    ];
  }

  if (field === "page_numbers") {
    return [
      { role: "system" as const, content: baseInstruction },
      {
        role: "user" as const,
        content: `Report the page range covered by this split as numbers only. Use "start-end" (e.g., "112-118"). If it's a single page, return that number. If no range is clear, return "Unknown".\n\nExtracted text:\n${text}`,
      },
    ];
  }

  if (field === "summary") {
    const regenNote = variant === "regen" ? "Use different phrasing from prior attempts. " : "";
    return [
      { role: "system" as const, content: baseInstruction },
      {
        role: "user" as const,
        content: `${regenNote}Write a concise, factual summary (250-320 words) of this PDF content. Do not add introductions or bullets. Review against the text to avoid inaccuracies.\n\nExtracted text:\n${text}`,
      },
    ];
  }

  if (field === "conclusion") {
    const regenNote = variant === "regen" ? "Offer a distinct perspective (no repeated phrasing). " : "";
    return [
      { role: "system" as const, content: baseInstruction },
      {
        role: "user" as const,
        content: `${regenNote}Write a short conclusion paragraph (110-140 words) focused on implications and outcomes specific to this document. Output only the paragraph.\n\nExtracted text:\n${text}`,
      },
    ];
  }

  const regenNote = variant === "regen" ? "Suggest an alternate set without repeating prior wording. " : "";
  return [
    { role: "system" as const, content: baseInstruction },
    {
      role: "user" as const,
      content: `${regenNote}Generate exactly 5 tags that capture this content. Each tag must be 2-3 words, Title Case, no punctuation or special characters. One tag per line; no extra text.\n\nExtracted text:\n${text}`,
    },
  ];
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!sarvamClient) {
    return res.status(500).json({ error: "SARVAM_API_KEY is not configured on the server." });
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
      ].includes(field)
    ) {
      return res.status(400).json({ error: "Unsupported field." });
    }

    const context = trimContext(text, field === "summary" || field === "conclusion" ? 12000 : 8000);
    const messages = buildMessages(field, context, label, variant === "regen" ? "regen" : "primary");

    const isLongForm = field === "summary" || field === "conclusion";
    const response = await sarvamClient.chat.completions({
      messages,
      temperature: field === "tags" ? 0.1 : isLongForm ? 0.25 : 0.15,
      top_p: 0.9,
      max_tokens: field === "summary" ? 420 : field === "conclusion" ? 200 : field === "tags" ? 96 : 80,
      n: 1,
    });

    const content = response.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return res.status(500).json({ error: "AI response was empty." });
    }

    if (field === "tags") {
      const tags = normalizeTags(content);
      if (!tags.length) return res.status(500).json({ error: "No tags returned." });
      return res.status(200).json({ tags });
    }

    return res.status(200).json({ value: content });
  } catch (err) {
    console.error("split-fields AI failed:", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : "AI generation failed." });
  }
}
