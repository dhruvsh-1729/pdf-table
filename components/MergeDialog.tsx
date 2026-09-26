// components/MergeDialog.tsx — fold selected duplicate authors/tags into one.
// The editor picks the survivor (defaults to the one with the most records);
// the others' links move to it and they are deleted (POST /api/{kind}s/merge).
import { useState } from "react";

export interface MergeItem {
  id: number;
  name: string;
  count?: number;
}

export default function MergeDialog({
  kind,
  items,
  onClose,
  onMerged,
}: {
  kind: "author" | "tag";
  items: MergeItem[];
  onClose: () => void;
  onMerged: (message: string) => void;
}) {
  const initial = [...items].sort((a, b) => (b.count ?? 0) - (a.count ?? 0))[0]?.id;
  const [keepId, setKeepId] = useState<number | undefined>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const keep = items.find((i) => i.id === keepId);
  const others = items.filter((i) => i.id !== keepId);

  const merge = async () => {
    if (!keepId) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/${kind}s/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keepId, mergeIds: others.map((o) => o.id) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || `Merge failed (${res.status})`);
      onMerged(`Merged ${others.length} ${kind}${others.length === 1 ? "" : "s"} into “${keep?.name}” (${body.records} records).`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="merge-title">
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
        <h2 id="merge-title" className="text-lg font-semibold text-gray-900">
          Merge {items.length} {kind}s
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Choose the {kind} to keep. Every article linked to the others is linked to it instead, empty details are filled
          from the others, and the others are deleted. This can&apos;t be undone.
        </p>
        <ul className="mt-4 max-h-72 space-y-1 overflow-y-auto">
          {items.map((i) => (
            <li key={i.id}>
              <label className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm ${i.id === keepId ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:bg-gray-50"}`}>
                <input type="radio" name="keep" checked={i.id === keepId} onChange={() => setKeepId(i.id)} />
                <span className="min-w-0 flex-1 truncate font-medium text-gray-900">{i.name}</span>
                <span className="shrink-0 text-xs text-gray-500">
                  #{i.id}
                  {typeof i.count === "number" ? ` · ${i.count} records` : ""}
                </span>
                {i.id === keepId && <span className="shrink-0 rounded bg-blue-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">Keep</span>}
              </label>
            </li>
          ))}
        </ul>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="rounded px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void merge()}
            disabled={busy || !keepId || others.length === 0}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Merging…" : `Merge into “${keep?.name ?? ""}”`}
          </button>
        </div>
      </div>
    </div>
  );
}
