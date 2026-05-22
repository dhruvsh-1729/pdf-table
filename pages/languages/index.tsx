import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import ManagementPagination from "@/components/ManagementPagination";

type Language = {
  id: number;
  name: string;
  created_at?: string | null;
  records_count?: number;
  magazines_count?: number;
};

type LanguageResponse = {
  languages?: Language[];
  count?: number;
  limit?: number;
  offset?: number;
  error?: string;
};

const ADMIN_EMAILS = ["dharmsasanwork99@gmail.com", "dhruvshdarshansh@gmail.com"];

function formatDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

export default function LanguagesPage() {
  const router = useRouter();
  const [languages, setLanguages] = useState<Language[]>([]);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Language | null>(null);
  const [formName, setFormName] = useState("");

  const [userEmail, setUserEmail] = useState<string>("");
  const [authReady, setAuthReady] = useState(false);

  const isAdmin = useMemo(() => ADMIN_EMAILS.includes(userEmail.toLowerCase()), [userEmail]);

  useEffect(() => {
    const raw = localStorage.getItem("user");
    if (!raw) {
      router.push("/login");
      setAuthReady(true);
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      const email = String(parsed?.email || "").trim();
      if (!email) {
        router.push("/login");
        setAuthReady(true);
        return;
      }
      setUserEmail(email);
      setAuthReady(true);
    } catch {
      router.push("/login");
      setAuthReady(true);
    }
  }, [router]);

  const loadLanguages = useCallback(async (q = "", page = 1, nextPageSize = pageSize) => {
    setLoading(true);
    setError(null);
    try {
      const offset = (page - 1) * nextPageSize;
      const resp = await fetch(`/api/languages?q=${encodeURIComponent(q)}&limit=${nextPageSize}&offset=${offset}`);
      const payload: LanguageResponse = await resp.json();
      if (!resp.ok) throw new Error(payload?.error || "Failed to fetch languages");
      setLanguages(Array.isArray(payload.languages) ? payload.languages : []);
      setTotalCount(Number(payload.count || 0));
      setCurrentPage(page);
      setPageSize(nextPageSize);
    } catch (err: any) {
      setError(err?.message || "Failed to fetch languages");
      setLanguages([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [pageSize]);

  useEffect(() => {
    loadLanguages("", 1, pageSize);
  }, [loadLanguages, pageSize]);

  const openCreate = () => {
    setEditing(null);
    setFormName("");
    setModalOpen(true);
  };

  const openEdit = (language: Language) => {
    setEditing(language);
    setFormName(language.name || "");
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const isEdit = Boolean(editing?.id);
      const url = isEdit ? `/api/languages/${editing!.id}` : "/api/languages";
      const method = isEdit ? "PUT" : "POST";

      const resp = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formName }),
      });
      const body = await resp.json();
      if (!resp.ok) {
        throw new Error(body?.error || "Failed to save language");
      }

      setModalOpen(false);
      await loadLanguages(search, currentPage, pageSize);
    } catch (err: any) {
      alert(err?.message || "Failed to save language");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (language: Language) => {
    if (!confirm(`Delete language "${language.name}"?`)) return;

    try {
      const resp = await fetch(`/api/languages/${language.id}`, { method: "DELETE" });
      const body = await resp.json();
      if (!resp.ok) {
        const linkedRecords = Number(body?.linkedRecords || 0);
        const linkedMagazines = Number(body?.linkedMagazines || 0);
        const suffix =
          linkedRecords > 0 || linkedMagazines > 0 ? ` (linked records: ${linkedRecords}, linked magazines: ${linkedMagazines})` : "";
        throw new Error((body?.error || "Failed to delete language") + suffix);
      }
      const nextPage = languages.length === 1 && currentPage > 1 ? currentPage - 1 : currentPage;
      await loadLanguages(search, nextPage, pageSize);
    } catch (err: any) {
      alert(err?.message || "Failed to delete language");
    }
  };

  if (!authReady) {
    return (
      <main className="min-h-screen bg-slate-50 p-8">
        <div className="max-w-4xl mx-auto rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-slate-600">Checking access...</p>
        </div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="min-h-screen bg-slate-50 p-8">
        <div className="max-w-4xl mx-auto rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-800">Language Management</h1>
          <p className="mt-3 text-slate-600">Admin access is required.</p>
          <button
            onClick={() => router.push("/")}
            className="mt-4 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white"
          >
            Back to Home
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Language Master</h1>
              <p className="text-sm text-slate-600">Manage language names used across records and magazine mappings.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => router.push("/")}
                className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-300"
              >
                Back
              </button>
              <button
                onClick={openCreate}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Add Language
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2 md:flex-row">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  loadLanguages(search, 1, pageSize);
                }
              }}
              placeholder="Search languages..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            />
            <button
              onClick={() => loadLanguages(search, 1, pageSize)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Search
            </button>
          </div>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">Loading languages...</div>
        ) : languages.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">No languages found.</div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {languages.map((language) => (
                <div key={language.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">{language.name}</h2>
                      <p className="text-xs text-slate-500">#{language.id}</p>
                    </div>
                    <span className="rounded-full bg-teal-100 px-2 py-1 text-xs font-semibold text-teal-700">Language</span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <div>
                      Records: <span className="font-semibold">{language.records_count || 0}</span>
                    </div>
                    <div>
                      Magazines: <span className="font-semibold">{language.magazines_count || 0}</span>
                    </div>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => openEdit(language)}
                      className="rounded-lg bg-blue-100 px-3 py-1.5 text-sm font-semibold text-blue-800 hover:bg-blue-200"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(language)}
                      className="rounded-lg bg-red-100 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-200"
                    >
                      Delete
                    </button>
                  </div>

                  <p className="mt-3 text-[11px] text-slate-400">Created: {formatDate(language.created_at)}</p>
                </div>
              ))}
            </div>
            <ManagementPagination
              currentPage={currentPage}
              totalPages={Math.max(1, Math.ceil(totalCount / pageSize))}
              pageSize={pageSize}
              totalItems={totalCount}
              visibleCount={languages.length}
              onPageChange={(page) => loadLanguages(search, page, pageSize)}
              onPageSizeChange={(nextPageSize) => loadLanguages(search, 1, nextPageSize)}
            />
          </>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={closeModal}>
          <div
            className="w-full max-w-lg rounded-xl bg-white p-4 shadow-xl md:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900">{editing ? "Edit Language" : "Create Language"}</h3>
              <button onClick={closeModal} className="text-2xl text-slate-500 hover:text-slate-700" disabled={saving}>
                ×
              </button>
            </div>

            <label className="mt-4 block text-sm font-medium text-slate-700">
              Language Name *
              <input
                className="mt-1 w-full rounded border px-3 py-2"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. English"
                autoFocus
              />
            </label>

            <p className="mt-2 text-xs text-slate-500">Names are normalized when saved (trimmed/title case).</p>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={closeModal}
                disabled={saving}
                className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-300 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {saving ? "Saving..." : editing ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
