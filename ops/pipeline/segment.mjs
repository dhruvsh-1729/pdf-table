// ops/pipeline/segment.mjs — find where each article / section starts in a full magazine issue.
//
// The model sees a compact digest of every page (top lines, which carry titles, bylines and running
// heads, plus the last lines) and returns the pages where a new piece begins. Results are validated
// (ascending, in range, first piece starts on page 1) and each boundary carries a confidence.
import { parseJson } from "../ai.mjs";

const SYSTEM = `You split scanned or digital issues of Indian scholarly and religious journals into their separate pieces
(articles, editorials, book reviews, notices, poems, front/back matter such as the cover, contents page or advertisements).
You get one digest per PDF page: its first lines and last lines. A new piece usually starts on a page whose top shows a title
(often capitalised or centred) and frequently an author line; continuation pages usually repeat a running head or continue
mid-sentence. Plates/illustration pages usually belong to the article before them. Contents pages list the titles that follow —
use them to confirm titles and order, and treat the contents page itself as front matter.
IMPORTANT: a short line that repeats at the top of consecutive pages (often with a page number, e.g. "608 Reviews" or
"Select Contents of Oriental Journals 611" or an author/title abbreviation) is a RUNNING HEAD on a continuation page, not a new piece.
A section like "Reviews" or "Select Contents of Oriental Journals" that spans many pages is ONE piece starting on its first page.
OCR text may be noisy; judge by structure, not exact spelling.
Return JSON only:
{"pieces": [{"start_page": int, "title": string, "authors": [string], "type": "article|book_review|books_received|editorial|obituary|notice|front_back_matter|poem|other", "confidence": number}]}
List pieces in page order. The first piece must start on page 1. Titles must be copied from the page text, not invented.`;

function digest(p, headChars = 420, tailChars = 160) {
  const lines = p.text.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const head = lines.join(" | ").slice(0, headChars);
  const tail = lines.length > 6 ? lines.slice(-3).join(" | ").slice(-tailChars) : "";
  return `--- PAGE ${p.page}${p.text.length < 40 ? " (nearly blank / image)" : ""}\nTOP: ${head}${tail ? `\nEND: ${tail}` : ""}`;
}

async function segmentWindow(ai, pages, { journal, issueLabel, total, isFirst }) {
  const body = pages.map((p) => digest(p)).join("\n");
  const note = isFirst
    ? ""
    : `\nNOTE: this is a window of pages ${pages[0].page}–${pages[pages.length - 1].page} of a larger issue. Its first page may continue an earlier piece; only list it if a new piece clearly starts there. Do not add a front-matter piece for page ${pages[0].page}.`;
  const messages = [
    { role: "system", content: SYSTEM },
    { role: "user", content: `JOURNAL: ${journal}\nISSUE: ${issueLabel}\nTOTAL PAGES: ${total}${note}\n\n${body}` },
  ];
  let reply = await ai.chat(messages, { maxTokens: 4000 });
  try {
    return parseJson(reply).pieces ?? [];
  } catch {
    messages.push({ role: "assistant", content: reply }, { role: "user", content: "That JSON was invalid or cut off. Reply again with the complete JSON object only, keeping titles short." });
    reply = await ai.chat(messages, { maxTokens: 4000 });
    return parseJson(reply).pieces ?? [];
  }
}

const WINDOW = 60;
const OVERLAP = 6;

export async function segmentIssue(ai, pages, { journal = "", issueLabel = "" } = {}) {
  const n = pages.length;
  const raw = [];
  for (let start = 0; start < n; start += WINDOW - OVERLAP) {
    const win = pages.slice(start, start + WINDOW);
    raw.push(...(await segmentWindow(ai, win, { journal, issueLabel, total: n, isFirst: start === 0 })));
    if (start + WINDOW >= n) break;
  }
  const seen = new Set();
  let pieces = raw
    .map((p) => ({
      start_page: Math.round(Number(p.start_page)),
      title: String(p.title ?? "").replace(/\s*\|\s*/g, " ").replace(/\s+/g, " ").trim(),
      authors: Array.isArray(p.authors) ? p.authors.map((a) => String(a).trim()).filter(Boolean) : [],
      type: p.type || "article",
      confidence: Math.max(0, Math.min(1, Number(p.confidence ?? 0.5))),
    }))
    .filter((p) => p.start_page >= 1 && p.start_page <= n && !seen.has(p.start_page) && seen.add(p.start_page))
    .sort((a, b) => a.start_page - b.start_page);
  if (!pieces.length || pieces[0].start_page !== 1) {
    pieces.unshift({ start_page: 1, title: "Front matter", authors: [], type: "front_back_matter", confidence: 0.3 });
  }
  pieces = mergePlates(pieces);
  pieces = mergeRunningHeads(pieces);
  pieces = pieces.map((p, i) => ({ ...p, end_page: i + 1 < pieces.length ? pieces[i + 1].start_page - 1 : n }));
  return pieces;
}

// Plates, figures and untitled image pages belong to the piece before them.
const PLATE = /^(fig(ure)?s?\.?|plates?|illustrations?|photo(graph)?s?|pl\.)\s*[\divxlc]*\b/i;
export function mergePlates(pieces) {
  const out = [];
  for (const p of pieces) {
    const prev = out[out.length - 1];
    const untitled = !p.title || p.title === "—";
    if (prev && prev.type !== "front_back_matter" && (PLATE.test(p.title) || (untitled && p.type === "front_back_matter"))) continue;
    out.push(p);
  }
  return out;
}

// Consecutive pieces whose titles are the same running head (modulo page numbers and OCR noise) are one piece.
const normTitle = (t) => t.toLowerCase().replace(/[^\p{L}\s]/gu, " ").replace(/\s+/g, " ").trim();
function trigrams(t) {
  const s = ` ${normTitle(t)} `;
  const set = new Set();
  for (let i = 0; i < s.length - 2; i++) set.add(s.slice(i, i + 3));
  return set;
}
function similar(a, b) {
  if (!normTitle(a) || !normTitle(b)) return false;
  const A = trigrams(a), B = trigrams(b);
  const inter = [...A].filter((x) => B.has(x)).length;
  return inter / Math.min(A.size, B.size) >= 0.6;
}
export function mergeRunningHeads(pieces) {
  const out = [];
  for (const p of pieces) {
    const prev = out[out.length - 1];
    if (prev && similar(prev.title, p.title)) continue;
    out.push(p);
  }
  return out;
}

/** Compare detected starts with known starts: precision/recall of boundary pages. */
export function scoreBoundaries(detected, truthStarts) {
  const d = new Set(detected.map((p) => p.start_page));
  const t = new Set(truthStarts);
  const tp = [...d].filter((x) => t.has(x)).length;
  return {
    precision: d.size ? tp / d.size : 0,
    recall: t.size ? tp / t.size : 0,
    missed: [...t].filter((x) => !d.has(x)),
    extra: [...d].filter((x) => !t.has(x)),
  };
}
