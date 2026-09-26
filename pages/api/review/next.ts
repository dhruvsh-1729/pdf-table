// GET /api/review/next?status=flagged|unchecked|ai_audited&magazineId=&after=
// The next record in the review queue (by id, after the cursor), with what a
// reviewer needs to judge the summary: audit notes, the source text and PDF.
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const STATUSES = new Set(["flagged", "unchecked", "ai_audited"]);
const TEXT_LIMIT = 15000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const status = STATUSES.has(String(req.query.status)) ? String(req.query.status) : "flagged";
  const magazineId = Number(req.query.magazineId) || null;
  const after = Number(req.query.after) || 0;

  const base = () => {
    let q = supabaseAdmin.from("records").select("id, magazines!inner(is_active)", { count: "exact", head: true });
    q = q.eq("check_status", status).eq("magazines.is_active", true).not("summary", "is", null);
    if (magazineId) q = q.eq("magazine_id", magazineId);
    return q;
  };

  let q = supabaseAdmin
    .from("records")
    .select(
      "id, title_name, volume, number, timestamp, page_numbers, pdf_url, summary, conclusion, extracted_text, text_quality, check_status, summary_origin, audit_score, audit_notes, audited_at, magazine_id, magazines!inner(name, is_active), record_authors(authors(name))",
    )
    .eq("check_status", status)
    .eq("magazines.is_active", true)
    .not("summary", "is", null)
    .gt("id", after)
    .order("id")
    .limit(1);
  if (magazineId) q = q.eq("magazine_id", magazineId);

  const [{ data, error }, { count }] = await Promise.all([q, base()]);
  if (error) return res.status(500).json({ error: error.message });

  const row = data?.[0] as any;
  if (!row) return res.status(200).json({ record: null, remaining: count ?? 0 });

  const text: string = row.extracted_text ?? "";
  return res.status(200).json({
    remaining: count ?? 0,
    record: {
      id: row.id,
      title: row.title_name,
      magazine: row.magazines?.name ?? null,
      magazineId: row.magazine_id,
      volume: row.volume,
      number: row.number,
      date: row.timestamp,
      pages: row.page_numbers,
      pdfUrl: row.pdf_url,
      authors: (row.record_authors ?? []).map((ra: any) => ra.authors?.name).filter(Boolean),
      summary: row.summary,
      conclusion: row.conclusion,
      text: text.slice(0, TEXT_LIMIT),
      textTruncated: text.length > TEXT_LIMIT,
      textQuality: row.text_quality,
      status: row.check_status,
      origin: row.summary_origin,
      auditScore: row.audit_score,
      auditNotes: row.audit_notes,
      auditedAt: row.audited_at,
    },
  });
}
