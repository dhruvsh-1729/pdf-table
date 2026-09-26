// pages/review.tsx — the summary review queue. One record at a time: the
// audit's reasons on top, the source text beside the (editable) summary, and
// Verify / Flag / Skip. Verified records show on the public site; flagged
// ones stay hidden until someone fixes them.
import { useCallback, useEffect, useState } from "react";
import type { GetServerSideProps } from "next";
import Link from "next/link";

type Status = "flagged" | "unchecked" | "ai_audited";

interface ReviewRecord {
  id: number;
  title: string | null;
  magazine: string | null;
  volume: string | null;
  number: string | null;
  date: string | null;
  pages: string | null;
  pdfUrl: string | null;
  authors: string[];
  summary: string;
  conclusion: string | null;
  text: string;
  textTruncated: boolean;
  textQuality: string | null;
  status: Status;
  origin: string | null;
  auditScore: number | null;
  auditNotes: string | null;
}

const STATUS_LABEL: Record<Status, string> = {
  flagged: "Flagged by the audit (hidden on the site)",
  unchecked: "Not yet checked",
  ai_audited: "Passed the AI audit (spot-check)",
};

export default function ReviewPage({ magazines }: { magazines: { id: number; name: string }[] }) {
  const [status, setStatus] = useState<Status>("flagged");
  const [magazineId, setMagazineId] = useState<string>("");
  const [cursor, setCursor] = useState(0);
  const [record, setRecord] = useState<ReviewRecord | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [summary, setSummary] = useState("");
  const [conclusion, setConclusion] = useState("");
  const [reason, setReason] = useState("");
  const [flagging, setFlagging] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(0);

  const load = useCallback(
    async (after: number) => {
      setLoading(true);
      setError("");
      setFlagging(false);
      setReason("");
      try {
        const params = new URLSearchParams({ status, after: String(after) });
        if (magazineId) params.set("magazineId", magazineId);
        const res = await fetch(`/api/review/next?${params}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || `Failed (${res.status})`);
        setRecord(body.record);
        setRemaining(body.remaining);
        setSummary(body.record?.summary ?? "");
        setConclusion(body.record?.conclusion ?? "");
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [status, magazineId],
  );

  useEffect(() => {
    setCursor(0);
    void load(0);
  }, [load]);

  const next = () => {
    if (!record) return;
    setCursor(record.id);
    void load(record.id);
  };

  const submit = async (action: "verify" | "flag") => {
    if (!record) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/review/${record.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "verify" ? { action, summary, conclusion } : { action, reason }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `Failed (${res.status})`);
      setDone((d) => d + 1);
      // Verified records leave this queue; flagging an already-flagged one
      // keeps it, so move past it either way.
      next();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const edited = record && (summary.trim() !== (record.summary ?? "").trim() || conclusion.trim() !== (record.conclusion ?? "").trim());
  const issue = record ? [record.volume && `Vol. ${record.volume}`, record.number && `No. ${record.number}`, record.date].filter(Boolean).join(" · ") : "";

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/" className="text-sm text-blue-600 hover:underline">
            ← Records
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Review summaries</h1>
          {remaining !== null && (
            <span className="rounded-full bg-gray-200 px-2.5 py-0.5 text-sm text-gray-700">{remaining.toLocaleString()} in queue</span>
          )}
          {done > 0 && <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-sm text-green-800">{done} reviewed this session</span>}
          <Link href="/quality" className="ml-auto text-sm text-blue-600 hover:underline">
            Data quality →
          </Link>
        </div>
        <p className="mt-1 text-sm text-gray-600">
          Read the source text, then verify the summary as it is, fix it and verify, or flag it with a reason. Verified
          summaries appear on aryanculture.org; flagged ones stay hidden.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${status === s ? "bg-gray-900 text-white" : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-100"}`}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
          <select
            value={magazineId}
            onChange={(e) => setMagazineId(e.target.value)}
            className="rounded-full bg-white px-3 py-1.5 text-sm ring-1 ring-gray-200"
            aria-label="Journal"
          >
            <option value="">All journals</option>
            {magazines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {loading ? (
          <p className="mt-10 text-center text-gray-500">Loading…</p>
        ) : !record ? (
          <div className="mt-10 rounded-lg bg-white p-10 text-center shadow-sm">
            <p className="text-lg font-medium text-gray-900">{cursor ? "You've reached the end of this queue." : "Nothing to review here."}</p>
            {cursor > 0 && (
              <button type="button" onClick={() => { setCursor(0); void load(0); }} className="mt-3 text-sm text-blue-600 hover:underline">
                Start again from the beginning
              </button>
            )}
          </div>
        ) : (
          <div className="mt-4 rounded-lg bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-semibold text-gray-900">{record.title || "Untitled"}</h2>
                <p className="mt-0.5 text-sm text-gray-600">
                  {[record.authors.join(", "), record.magazine, issue, record.pages && `pp. ${record.pages}`].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex shrink-0 gap-2 text-sm">
                {record.pdfUrl && (
                  <a href={record.pdfUrl} target="_blank" rel="noreferrer" className="rounded bg-gray-100 px-3 py-1.5 text-gray-800 hover:bg-gray-200">
                    Open PDF
                  </a>
                )}
                <a
                  href={`https://www.aryanculture.org/records/${record.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded bg-gray-100 px-3 py-1.5 text-gray-800 hover:bg-gray-200"
                >
                  On the site
                </a>
                <span className="rounded bg-gray-100 px-3 py-1.5 text-gray-500">#{record.id}</span>
              </div>
            </div>

            {record.auditNotes && (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                  Audit notes{typeof record.auditScore === "number" ? ` · score ${record.auditScore}` : ""}
                </p>
                <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-line text-sm text-amber-900">{record.auditNotes}</p>
              </div>
            )}

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <section>
                <h3 className="text-sm font-semibold text-gray-700">
                  Source text
                  {record.textQuality && record.textQuality !== "good" && (
                    <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">OCR {record.textQuality}</span>
                  )}
                </h3>
                <div className="mt-1 h-[28rem] overflow-y-auto whitespace-pre-line rounded border border-gray-200 bg-gray-50 p-3 text-sm leading-relaxed text-gray-800">
                  {record.text || <span className="text-gray-500">No extracted text. Use the PDF.</span>}
                  {record.textTruncated && <p className="mt-3 text-xs text-gray-500">(Showing the first 15,000 characters. See the PDF for the rest.)</p>}
                </div>
              </section>
              <section className="flex flex-col">
                <label htmlFor="rv-summary" className="text-sm font-semibold text-gray-700">
                  Summary
                </label>
                <textarea
                  id="rv-summary"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  className="mt-1 h-72 w-full rounded border border-gray-300 p-3 text-sm leading-relaxed focus:border-blue-500 focus:outline-none"
                />
                <label htmlFor="rv-conclusion" className="mt-3 text-sm font-semibold text-gray-700">
                  Conclusion
                </label>
                <textarea
                  id="rv-conclusion"
                  value={conclusion}
                  onChange={(e) => setConclusion(e.target.value)}
                  className="mt-1 h-28 w-full rounded border border-gray-300 p-3 text-sm leading-relaxed focus:border-blue-500 focus:outline-none"
                />
              </section>
            </div>

            {flagging && (
              <div className="mt-4">
                <label htmlFor="rv-reason" className="text-sm font-semibold text-gray-700">
                  What is wrong with this summary?
                </label>
                <input
                  id="rv-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={1000}
                  autoFocus
                  placeholder="e.g. Describes a different article; wrong author; claims not in the text"
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
              <button
                type="button"
                disabled={busy || !summary.trim()}
                onClick={() => void submit("verify")}
                className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {edited ? "Save edits & verify" : "Verify summary"}
              </button>
              {flagging ? (
                <button
                  type="button"
                  disabled={busy || !reason.trim()}
                  onClick={() => void submit("flag")}
                  className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Flag summary
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setFlagging(true)}
                  className="rounded bg-white px-4 py-2 text-sm font-medium text-red-700 ring-1 ring-red-200 hover:bg-red-50"
                >
                  Flag…
                </button>
              )}
              <button type="button" disabled={busy} onClick={next} className="rounded px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                Skip
              </button>
              {edited && (
                <button
                  type="button"
                  onClick={() => {
                    setSummary(record.summary ?? "");
                    setConclusion(record.conclusion ?? "");
                  }}
                  className="text-sm text-gray-500 hover:underline"
                >
                  Undo edits
                </button>
              )}
              <span className="ml-auto text-xs text-gray-500">Edits keep the previous version in the summary history.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps = async () => {
  // Imported here, not at module level: the build has no Supabase env.
  const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
  const { data } = await supabaseAdmin.from("magazines").select("id, name").eq("is_active", true).order("name");
  return { props: { magazines: data ?? [] } };
};
