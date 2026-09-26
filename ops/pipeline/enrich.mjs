// ops/pipeline/enrich.mjs — turn one article's text into record fields, strictly grounded in the text.
import { excerpt, parseJson } from "../ai.mjs";

const SYSTEM =
  "You are an expert editor for academic journal articles (Jain studies, Indology, Indian history, religion). Use ONLY the provided article text, which may be OCR output and may be in English, Hindi, Sanskrit, Prakrit or Gujarati. Never add names, dates, works or claims that are not in the text. Do not add disclaimers or introductions.";

const TYPES = ["article", "book_review", "books_received", "editorial", "obituary", "notice", "front_back_matter", "poem", "other"];

export async function extractMeta(ai, text, { hintTitle = "", hintAuthors = [] } = {}) {
  const reply = await ai.chat(
    [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `From the article text below, extract:
- title: the article's title exactly as printed (fix obvious OCR errors only), in its original language/script
- authors: author names exactly as printed, same spelling and transliteration (do NOT normalise or correct spellings; only convert ALL-CAPS to Title Case); empty list if none
- type: one of ${TYPES.join(", ")}
- languages: the language(s) the article is written in, e.g. ["English"] or ["Hindi","Sanskrit"]
A segmentation step suggested title "${hintTitle}" and authors ${JSON.stringify(hintAuthors)}; correct them if the text disagrees.
Reply with JSON only: {"title": string, "authors": [string], "type": string, "languages": [string]}

Article text (start):
"""
${text.slice(0, 5000)}
"""`,
      },
    ],
    { maxTokens: 400 },
  );
  const out = parseJson(reply);
  return {
    title: String(out.title ?? hintTitle).replace(/\s+/g, " ").trim() || hintTitle,
    authors: (Array.isArray(out.authors) ? out.authors : hintAuthors).map((a) => String(a).replace(/^[-—–\s]+/, "").trim()).filter(Boolean).slice(0, 8),
    type: TYPES.includes(out.type) ? out.type : "article",
    languages: (Array.isArray(out.languages) ? out.languages : []).map(String).filter(Boolean).slice(0, 4),
  };
}

export async function writeSummary(ai, text, title) {
  return (
    await ai.chat(
      [
        { role: "system", content: `${SYSTEM} Write in English.` },
        {
          role: "user",
          content: `Write an accurate summary (about 250–300 words) of the article "${title}".
Cover its subject, main argument, evidence and sources discussed, in the author's own terms. Every name, date, place and work you mention must appear in the text. If a passage is unreadable OCR, skip it rather than guess. Plain paragraphs, no bullet points, no heading.

Article text:
"""
${excerpt(text, 60000)}
"""`,
        },
      ],
      { maxTokens: 900, temperature: 0.2 },
    )
  ).trim();
}

export async function writeConclusion(ai, text, title) {
  return (
    await ai.chat(
      [
        { role: "system", content: `${SYSTEM} Write in English.` },
        {
          role: "user",
          content: `Write a short conclusion (110–140 words) for the article "${title}": its key findings, implications and significance, based only on the text. Do not repeat the summary sentence by sentence. Output only the paragraph.

Article text:
"""
${excerpt(text, 60000)}
"""`,
        },
      ],
      { maxTokens: 400, temperature: 0.2 },
    )
  ).trim();
}

export async function classifySubjects(ai, subs, { title, summary, journal }) {
  const list = subs.map((s) => `${s.id}: ${s.name} (${s.area})`).join("\n");
  const reply = await ai.chat(
    [
      {
        role: "system",
        content: `You classify articles from Indian scholarly journals into a fixed subject list. Choose 1 to 3 subjects that best describe what the article is mainly about. Use only IDs from this list:\n${list}\nReply with JSON only: {"ids": [number], "confidence": number}`,
      },
      { role: "user", content: `JOURNAL: ${journal}\nTITLE: ${title}\nSUMMARY: ${summary.slice(0, 2500)}` },
    ],
    { maxTokens: 80 },
  );
  const out = parseJson(reply);
  const valid = new Set(subs.map((s) => s.id));
  const ids = [...new Set((out.ids ?? []).map(Number))].filter((x) => valid.has(x)).slice(0, 3);
  return Number(out.confidence ?? 0) >= 0.5 ? ids : [];
}
