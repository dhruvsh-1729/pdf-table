// pages/requests.tsx — inbox of reader requests from aryanculture.org/request.
// Set a status and an optional note; the reader sees both on the site.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Status = "open" | "planned" | "done" | "declined";

interface ReaderRequest {
  id: number;
  kind: "journal" | "issue" | "article" | "other";
  title: string;
  details: string | null;
  status: Status;
  editor_note: string | null;
  created_at: string;
  email: string | null;
}

const TABS: { key: Status | "all"; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "planned", label: "Planned" },
  { key: "done", label: "Added" },
  { key: "declined", label: "Declined" },
  { key: "all", label: "All" },
];
const KIND_LABEL = { journal: "Journal", issue: "Issue", article: "Article", other: "Other" };
const STATUS_TONE: Record<Status, string> = {
  open: "bg-gray-100 text-gray-700",
  planned: "bg-blue-100 text-blue-800",
  done: "bg-green-100 text-green-800",
  declined: "bg-amber-100 text-amber-800",
};

function RequestRow({ r, onSaved }: { r: ReaderRequest; onSaved: () => void }) {
  const [note, setNote] = useState(r.editor_note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async (status?: Status) => {
    setBusy(true);
    setError("");
    const res = await fetch("/api/requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id, editor_note: note, ...(status ? { status } : {}) }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Save failed");
      return;
    }
    onSaved();
  };

  return (
    <li className="rounded-lg bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900">{r.title}</p>
          <p className="mt-0.5 text-xs text-gray-500">
            {KIND_LABEL[r.kind]} · {new Date(r.created_at).toLocaleString()} · {r.email ?? "unknown reader"}
          </p>
          {r.details && <p className="mt-2 whitespace-pre-line text-sm text-gray-700">{r.details}</p>}
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONE[r.status]}`}>{r.status}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          placeholder="Note for the reader (optional), e.g. “Added 12 issues from 1975–1980”"
          aria-label="Note for the reader"
          className="min-w-[16rem] flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        />
        {(["planned", "done", "declined", "open"] as Status[])
          .filter((s) => s !== r.status)
          .map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy}
              onClick={() => void save(s)}
              className="rounded bg-gray-100 px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-200 disabled:opacity-50"
            >
              {s === "done" ? "Mark added" : s === "open" ? "Reopen" : `Mark ${s}`}
            </button>
          ))}
        {note !== (r.editor_note ?? "") && (
          <button type="button" disabled={busy} onClick={() => void save()} className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">
            Save note
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </li>
  );
}

export default function RequestsPage() {
  const [tab, setTab] = useState<Status | "all">("open");
  const [rows, setRows] = useState<ReaderRequest[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const res = await fetch(`/api/requests?status=${tab}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "Could not load requests");
      setRows([]);
      return;
    }
    setRows(body.requests);
    setCounts(body.counts ?? {});
  }, [tab]);

  useEffect(() => {
    setRows(null);
    void load();
  }, [load]);

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-sm text-blue-600 hover:underline">
            ← Records
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Reader requests</h1>
        </div>
        <p className="mt-1 text-sm text-gray-600">
          Journals, issues and articles readers asked for on aryanculture.org/request. They see the status and your note.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${tab === t.key ? "bg-gray-900 text-white" : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-100"}`}
            >
              {t.label}
              {t.key !== "all" && typeof counts[t.key] === "number" ? ` · ${counts[t.key]}` : ""}
            </button>
          ))}
        </div>
        {error && <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {rows === null ? (
          <p className="mt-8 text-center text-gray-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="mt-8 rounded-lg bg-white p-8 text-center text-gray-500 shadow-sm">No requests here.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {rows.map((r) => (
              <RequestRow key={`${r.id}-${r.status}-${r.editor_note}`} r={r} onSaved={load} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
