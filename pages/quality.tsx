// pages/quality.tsx — data-quality dashboard: coverage gaps per journal, each
// number linking to the matching records in the portal table.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Row = {
  magazine_id: number;
  magazine_name: string;
  is_active: boolean;
  records: number;
  no_author: number;
  placeholder_author: number;
  no_language: number;
  no_subject: number;
  no_tags: number;
  no_year: number;
  text_missing: number;
  text_partial: number;
  text_garbled: number;
  summary_missing: number;
  status_unchecked: number;
  status_ai_audited: number;
  status_human_verified: number;
  status_flagged: number;
  hindi_articles: number;
  hindi_translated: number;
};

type Run = { id: number; job: string; status: string; started_at: string; finished_at: string | null; summary: string | null };

type Metric = {
  key: keyof Row;
  label: string;
  hint: string;
  /** Records-table filters for the drill-down link (records API column filters). */
  filters?: Record<string, string>;
  tone: "gap" | "info" | "good";
};

const METRICS: Metric[] = [
  { key: "no_author", label: "No author", hint: "No author linked at all", filters: { authors: "__EMPTY__" }, tone: "gap" },
  { key: "placeholder_author", label: "Unsigned", hint: "Only the 'Unexhibited' placeholder (unsigned items)", tone: "info" },
  { key: "no_language", label: "No language", hint: "No language linked", filters: { language: "__EMPTY__" }, tone: "gap" },
  { key: "no_subject", label: "No subject", hint: "Not in any subject area yet", tone: "gap" },
  { key: "no_tags", label: "No tags", hint: "No topic tags", filters: { tags: "__EMPTY__" }, tone: "gap" },
  { key: "no_year", label: "No year", hint: "Publication year unknown", tone: "gap" },
  { key: "text_missing", label: "Text missing", hint: "No usable extracted text", filters: { text_quality: "missing" }, tone: "gap" },
  { key: "text_partial", label: "Text partial", hint: "Extracted text incomplete", filters: { text_quality: "partial" }, tone: "gap" },
  { key: "text_garbled", label: "Text garbled", hint: "OCR text unreadable", filters: { text_quality: "garbled" }, tone: "gap" },
  { key: "summary_missing", label: "No summary", hint: "Summary empty", filters: { summary: "__EMPTY__" }, tone: "gap" },
  { key: "status_flagged", label: "Flagged", hint: "Summary flagged by the audit (hidden on the site)", filters: { check_status: "flagged" }, tone: "gap" },
  { key: "status_unchecked", label: "Unchecked", hint: "Summary not yet audited", filters: { check_status: "unchecked" }, tone: "info" },
  { key: "status_ai_audited", label: "AI audited", hint: "Summary passed the automated audit", filters: { check_status: "ai_audited" }, tone: "good" },
  { key: "status_human_verified", label: "Volunteer verified", hint: "Summary reviewed by a volunteer", filters: { check_status: "human_verified" }, tone: "good" },
];

function recordsLink(magazine: string | null, filters?: Record<string, string>) {
  if (!filters) return null;
  const f: Record<string, string> = { ...filters };
  if (magazine) f.name = magazine;
  return `/?f=${encodeURIComponent(JSON.stringify(f))}`;
}

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

export default function QualityPage() {
  const [data, setData] = useState<{ generatedAt: string; magazines: Row[]; runs: Run[] } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/quality${refresh ? "?refresh=1" : ""}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Failed to load");
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const row of data?.magazines ?? []) {
      for (const [k, v] of Object.entries(row)) if (typeof v === "number" && k !== "magazine_id") t[k] = (t[k] ?? 0) + v;
    }
    return t as unknown as Row;
  }, [data]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Data quality</h1>
            <p className="text-sm text-slate-500">Coverage gaps per journal. Click a number to open those records.</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void load(true)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-100"
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
            <Link href="/" className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800">
              ← Records
            </Link>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {!data && loading && <p className="text-sm text-slate-500">Computing the overview (takes a few seconds)…</p>}

        {data && (
          <>
            {/* Totals */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              {[
                { label: "Records", value: totals.records, tone: "text-slate-900" },
                { label: "No author", value: totals.no_author, tone: "text-rose-700" },
                { label: "No subject", value: totals.no_subject, tone: "text-rose-700" },
                { label: "Text missing", value: totals.text_missing, tone: "text-rose-700" },
                { label: "Flagged summaries", value: totals.status_flagged, tone: "text-amber-700" },
                { label: "Summaries checked", value: `${pct(totals.status_ai_audited + totals.status_human_verified, totals.records)}%`, tone: "text-emerald-700" },
                { label: "Hindi summaries", value: `${totals.hindi_translated} / ${totals.hindi_articles}`, tone: "text-slate-900" },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className={`text-xl font-bold tabular-nums ${s.tone}`}>
                    {typeof s.value === "number" ? s.value.toLocaleString("en-US") : s.value}
                  </p>
                  <p className="text-xs text-slate-500">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Per-journal table */}
            <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Journal</th>
                    <th className="px-3 py-2 text-right">Records</th>
                    {METRICS.map((m) => (
                      <th key={m.key} className="px-3 py-2 text-right" title={m.hint}>
                        {m.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...data.magazines, { ...totals, magazine_id: 0, magazine_name: "All journals", is_active: true }].map((row) => {
                    const isTotal = row.magazine_id === 0;
                    return (
                      <tr key={row.magazine_id} className={`border-t border-slate-100 ${isTotal ? "bg-slate-50 font-semibold" : ""}`}>
                        <td className="px-3 py-2">
                          {row.magazine_name}
                          {!row.is_active && <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">hidden</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.records.toLocaleString("en-US")}</td>
                        {METRICS.map((m) => {
                          const n = Number(row[m.key] ?? 0);
                          const href = recordsLink(isTotal ? null : row.magazine_name, m.filters);
                          const color =
                            n === 0 ? "text-slate-300" : m.tone === "gap" ? "text-rose-700" : m.tone === "good" ? "text-emerald-700" : "text-slate-700";
                          const content = (
                            <span className={`tabular-nums ${color}`} title={`${pct(n, row.records)}% of records`}>
                              {n.toLocaleString("en-US")}
                            </span>
                          );
                          return (
                            <td key={m.key} className="px-3 py-2 text-right">
                              {href && n > 0 ? (
                                <Link href={href} className="hover:underline">
                                  {content}
                                </Link>
                              ) : (
                                content
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Generated {new Date(data.generatedAt).toLocaleString()} · cached for 5 minutes. Hover a heading for its meaning.
            </p>

            {/* Recent jobs */}
            {data.runs.length > 0 && (
              <div className="mt-8">
                <h2 className="text-sm font-semibold text-slate-700">Recent data jobs</h2>
                <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white text-sm">
                  {data.runs.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
                      <span className="font-medium text-slate-800">{r.job}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs ${
                          r.status === "success" ? "bg-emerald-50 text-emerald-700" : r.status === "failed" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {r.status}
                      </span>
                      <span className="text-slate-500">{new Date(r.started_at).toLocaleString()}</span>
                      {r.summary && <span className="w-full text-slate-600 sm:w-auto">{r.summary}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
