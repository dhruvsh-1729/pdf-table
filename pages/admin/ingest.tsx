import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import { toast, Toaster } from "sonner";

type Magazine = { id: number; name: string };
type Job = {
  id: number;
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  payload: { magazine_name?: string; volume?: string | null; number?: string | null; date?: string; original_filename?: string };
  attempts: number;
  last_error: string | null;
  result: { summary?: string; report?: { start_page: number; end_page: number; title: string; status: string }[] } | null;
  created_at: string;
};

const LANG_OPTIONS = [
  { value: "eng", label: "English" },
  { value: "hin", label: "Hindi / Sanskrit (Devanagari)" },
  { value: "eng+hin", label: "English + Hindi" },
  { value: "guj", label: "Gujarati" },
  { value: "eng+guj", label: "English + Gujarati" },
];

const STATUS_CLS: Record<Job["status"], string> = {
  queued: "bg-gray-100 text-gray-700",
  running: "bg-blue-100 text-blue-800",
  done: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-500",
};

export default function IngestPage() {
  const [magazines, setMagazines] = useState<Magazine[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [form, setForm] = useState({ magazine_id: "", volume: "", number: "", date: "", langs: "eng" });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  const loadJobs = useCallback(async () => {
    const res = await fetch("/api/admin/ingest");
    const data = await res.json();
    if (res.ok) setJobs(data.jobs);
  }, []);

  useEffect(() => {
    fetch("/api/magazines?limit=500")
      .then((r) => r.json())
      .then((d) => setMagazines((Array.isArray(d) ? d : d.magazines ?? d.data ?? []).map((m: any) => ({ id: m.id, name: m.name }))))
      .catch(() => undefined);
    loadJobs();
    const t = setInterval(loadJobs, 30_000);
    return () => clearInterval(t);
  }, [loadJobs]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return toast.error("Choose the issue PDF");
    const body = new FormData();
    Object.entries(form).forEach(([k, v]) => body.append(k, v));
    body.append("file", file);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/ingest", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error(data.error || "Upload failed");
      toast.success(`Queued as job #${data.jobId}. It will be processed within the hour.`);
      setFile(null);
      setForm((f) => ({ ...f, volume: "", number: "", date: "" }));
      loadJobs();
    } finally {
      setBusy(false);
    }
  };

  const input = "px-3 py-2 border border-gray-200 rounded-lg text-sm w-full";

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <Toaster position="top-right" />
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Ingest a full issue</h1>
            <p className="text-sm text-gray-500">
              Upload a whole magazine issue. It is split into articles automatically, and each article gets its text,
              summary, conclusion, authors and subjects. Summaries are checked against the text before they are shown.
              Covers, contents pages and adverts are skipped.
            </p>
          </div>
          <Link href="/admin" className="px-4 py-2 rounded-lg bg-white border border-gray-200 text-sm hover:bg-gray-100">
            ← Admin panel
          </Link>
        </div>

        <form onSubmit={submit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 grid gap-3 md:grid-cols-3">
          <label className="text-sm md:col-span-3">
            <span className="block text-gray-600 mb-1">Issue PDF</span>
            <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className={input} />
          </label>
          <label className="text-sm">
            <span className="block text-gray-600 mb-1">Magazine</span>
            <select value={form.magazine_id} onChange={(e) => setForm({ ...form, magazine_id: e.target.value })} className={input}>
              <option value="">Choose…</option>
              {magazines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-gray-600 mb-1">Issue date (as printed)</span>
            <input placeholder="e.g. July 1976" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={input} />
          </label>
          <label className="text-sm">
            <span className="block text-gray-600 mb-1">Text language (for scanned pages)</span>
            <select value={form.langs} onChange={(e) => setForm({ ...form, langs: e.target.value })} className={input}>
              {LANG_OPTIONS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-gray-600 mb-1">Volume</span>
            <input value={form.volume} onChange={(e) => setForm({ ...form, volume: e.target.value })} className={input} />
          </label>
          <label className="text-sm">
            <span className="block text-gray-600 mb-1">Number</span>
            <input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} className={input} />
          </label>
          <div className="flex items-end">
            <button disabled={busy} className="w-full px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-60">
              {busy ? "Uploading…" : "Queue for ingestion"}
            </button>
          </div>
        </form>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="p-3">Job</th>
                <th className="p-3">Issue</th>
                <th className="p-3">Status</th>
                <th className="p-3">Result</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-gray-500">
                    No issues queued yet.
                  </td>
                </tr>
              )}
              {jobs.map((j) => (
                <Fragment key={j.id}>
                  <tr className="border-t border-gray-100 align-top">
                    <td className="p-3 text-gray-500">
                      #{j.id}
                      <div className="text-xs">{new Date(j.created_at).toLocaleString()}</div>
                    </td>
                    <td className="p-3">
                      <div className="font-medium text-gray-800">{j.payload.magazine_name}</div>
                      <div className="text-gray-500">
                        {[j.payload.volume && `Vol. ${j.payload.volume}`, j.payload.number && `No. ${j.payload.number}`, j.payload.date]
                          .filter(Boolean)
                          .join(", ")}
                      </div>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded-full text-xs ${STATUS_CLS[j.status]}`}>{j.status}</span>
                      {j.attempts > 1 && <div className="text-xs text-gray-400 mt-1">attempt {j.attempts}</div>}
                    </td>
                    <td className="p-3 text-gray-600">
                      {j.result?.summary ?? j.last_error ?? "—"}
                      {j.result?.report && (
                        <button type="button" onClick={() => setOpen(open === j.id ? null : j.id)} className="ml-2 text-xs text-indigo-600 hover:underline">
                          {open === j.id ? "hide" : "details"}
                        </button>
                      )}
                    </td>
                  </tr>
                  {open === j.id && j.result?.report && (
                    <tr className="bg-gray-50">
                      <td colSpan={4} className="p-3">
                        <ul className="text-xs text-gray-600 space-y-1">
                          {j.result.report.map((r) => (
                            <li key={r.start_page}>
                              pp. {r.start_page}–{r.end_page}: <span className="font-medium">{r.title}</span> — {r.status}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
