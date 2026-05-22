import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import ManagementPagination from "@/components/ManagementPagination";

type MagazineAuthor = {
  id: number;
  name: string;
  short_name?: string | null;
  designation?: string | null;
};

type MagazineLanguage = {
  id: number;
  name: string;
};

type Magazine = {
  id: number;
  name: string;
  short_name?: string | null;
  slug?: string | null;
  description?: string | null;
  cover_image_url?: string | null;
  cover_image_public_id?: string | null;
  logo_image_url?: string | null;
  logo_image_public_id?: string | null;
  website_url?: string | null;
  contact_email?: string | null;
  headquarters?: string | null;
  founded_year?: number | null;
  issn_print?: string | null;
  issn_online?: string | null;
  is_active: boolean;
  metadata?: Record<string, unknown>;
  created_at?: string | null;
  updated_at?: string | null;
  records_count?: number;
  authors?: MagazineAuthor[];
  languages?: MagazineLanguage[];
};

type Author = {
  id: number;
  name: string;
  short_name?: string | null;
  designation?: string | null;
};

type MagazineFormState = {
  name: string;
  short_name: string;
  slug: string;
  description: string;
  cover_image_url: string;
  cover_image_public_id: string;
  logo_image_url: string;
  logo_image_public_id: string;
  website_url: string;
  contact_email: string;
  headquarters: string;
  founded_year: string;
  issn_print: string;
  issn_online: string;
  is_active: boolean;
  metadata_json: string;
};

const ADMIN_EMAILS = ["dharmsasanwork99@gmail.com", "dhruvshdarshansh@gmail.com"];

const EMPTY_FORM: MagazineFormState = {
  name: "",
  short_name: "",
  slug: "",
  description: "",
  cover_image_url: "",
  cover_image_public_id: "",
  logo_image_url: "",
  logo_image_public_id: "",
  website_url: "",
  contact_email: "",
  headquarters: "",
  founded_year: "",
  issn_print: "",
  issn_online: "",
  is_active: true,
  metadata_json: "{}",
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

export default function MagazinesPage() {
  const router = useRouter();
  const [magazines, setMagazines] = useState<Magazine[]>([]);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Magazine | null>(null);
  const [form, setForm] = useState<MagazineFormState>(EMPTY_FORM);
  const [selectedAuthorIds, setSelectedAuthorIds] = useState<number[]>([]);

  const [authorSearch, setAuthorSearch] = useState("");
  const [authorLoading, setAuthorLoading] = useState(false);
  const [authorOptions, setAuthorOptions] = useState<Author[]>([]);

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

  const loadMagazines = useCallback(async (q = "", page = 1, nextPageSize = pageSize) => {
    setLoading(true);
    setError(null);
    try {
      const offset = (page - 1) * nextPageSize;
      const resp = await fetch(`/api/magazines?q=${encodeURIComponent(q)}&limit=${nextPageSize}&offset=${offset}`);
      const payload = await resp.json();
      if (!resp.ok) throw new Error(payload?.error || "Failed to fetch magazines");
      setMagazines(payload.magazines || []);
      setTotalCount(Number(payload.count || 0));
      setCurrentPage(page);
      setPageSize(nextPageSize);
    } catch (err: any) {
      setError(err?.message || "Failed to fetch magazines");
      setMagazines([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [pageSize]);

  const loadAuthors = useCallback(async (q = "") => {
    setAuthorLoading(true);
    try {
      const resp = await fetch(`/api/authors?q=${encodeURIComponent(q)}`);
      const payload = await resp.json();
      if (!resp.ok) throw new Error(payload?.error || "Failed to fetch authors");
      setAuthorOptions(Array.isArray(payload) ? payload : []);
    } catch (err) {
      console.error("Failed to load authors", err);
      setAuthorOptions([]);
    } finally {
      setAuthorLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMagazines("", 1, pageSize);
  }, [loadMagazines, pageSize]);

  useEffect(() => {
    const t = setTimeout(() => {
      loadAuthors(authorSearch);
    }, 250);
    return () => clearTimeout(t);
  }, [authorSearch, loadAuthors]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setSelectedAuthorIds([]);
    setAuthorSearch("");
    setModalOpen(true);
    loadAuthors("");
  };

  const openEdit = (magazine: Magazine) => {
    setEditing(magazine);
    setForm({
      name: magazine.name || "",
      short_name: magazine.short_name || "",
      slug: magazine.slug || "",
      description: magazine.description || "",
      cover_image_url: magazine.cover_image_url || "",
      cover_image_public_id: magazine.cover_image_public_id || "",
      logo_image_url: magazine.logo_image_url || "",
      logo_image_public_id: magazine.logo_image_public_id || "",
      website_url: magazine.website_url || "",
      contact_email: magazine.contact_email || "",
      headquarters: magazine.headquarters || "",
      founded_year: magazine.founded_year ? String(magazine.founded_year) : "",
      issn_print: magazine.issn_print || "",
      issn_online: magazine.issn_online || "",
      is_active: magazine.is_active !== false,
      metadata_json: JSON.stringify(magazine.metadata || {}, null, 2),
    });
    setSelectedAuthorIds((magazine.authors || []).map((a) => a.id));
    setAuthorSearch("");
    setModalOpen(true);
    loadAuthors("");
  };

  const handleSave = async () => {
    try {
      let metadata: Record<string, unknown> = {};
      if (form.metadata_json.trim()) {
        metadata = JSON.parse(form.metadata_json);
      }

      const payload = {
        ...form,
        founded_year: form.founded_year ? Number(form.founded_year) : null,
        metadata,
        author_ids: selectedAuthorIds,
      };

      const isEdit = Boolean(editing?.id);
      const url = isEdit ? `/api/magazines/${editing!.id}` : "/api/magazines";
      const method = isEdit ? "PUT" : "POST";

      const resp = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await resp.json();
      if (!resp.ok) {
        const details = Array.isArray(body?.details) ? body.details.join(" ") : "";
        throw new Error([body?.error, details].filter(Boolean).join(" ") || "Failed to save magazine");
      }

      setModalOpen(false);
      await loadMagazines(search, currentPage, pageSize);
    } catch (err: any) {
      alert(err?.message || "Failed to save magazine");
    }
  };

  const handleDelete = async (magazine: Magazine) => {
    if (!confirm(`Delete magazine \"${magazine.name}\"?`)) return;

    try {
      const resp = await fetch(`/api/magazines/${magazine.id}`, { method: "DELETE" });
      const body = await resp.json();
      if (!resp.ok) {
        throw new Error(body?.error || "Failed to delete magazine");
      }
      const nextPage = magazines.length === 1 && currentPage > 1 ? currentPage - 1 : currentPage;
      await loadMagazines(search, nextPage, pageSize);
    } catch (err: any) {
      alert(err?.message || "Failed to delete magazine");
    }
  };

  const toggleAuthor = (authorId: number) => {
    setSelectedAuthorIds((prev) => {
      if (prev.includes(authorId)) return prev.filter((id) => id !== authorId);
      return [...prev, authorId];
    });
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
          <h1 className="text-2xl font-bold text-slate-800">Magazine Management</h1>
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
      <div className="mx-auto max-w-7xl">
        <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Magazines</h1>
              <p className="text-sm text-slate-600">Manage magazine metadata, branding assets, websites, and author mappings.</p>
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
                Add Magazine
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2 md:flex-row">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  loadMagazines(search, 1, pageSize);
                }
              }}
              placeholder="Search by name, short name, slug..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            />
            <button
              onClick={() => loadMagazines(search, 1, pageSize)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Search
            </button>
          </div>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">Loading magazines...</div>
        ) : magazines.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">No magazines found.</div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
              {magazines.map((magazine) => (
                <div key={magazine.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">{magazine.name}</h2>
                      <p className="text-xs text-slate-500">#{magazine.id} • {magazine.slug || "-"}</p>
                      {magazine.short_name ? <p className="text-sm text-slate-600">{magazine.short_name}</p> : null}
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        magazine.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {magazine.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>

                  {magazine.description ? <p className="mt-3 text-sm text-slate-700">{magazine.description}</p> : null}

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <div>Records: <span className="font-semibold">{magazine.records_count || 0}</span></div>
                    <div>Authors: <span className="font-semibold">{magazine.authors?.length || 0}</span></div>
                    <div>Languages: <span className="font-semibold">{magazine.languages?.length || 0}</span></div>
                    <div>Founded: <span className="font-semibold">{magazine.founded_year || "-"}</span></div>
                  </div>

                  {magazine.website_url ? (
                    <a href={magazine.website_url} target="_blank" rel="noreferrer" className="mt-2 block text-xs text-blue-600 underline">
                      {magazine.website_url}
                    </a>
                  ) : null}

                  {!!magazine.authors?.length && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {magazine.authors!.slice(0, 8).map((author) => (
                        <span key={author.id} className="rounded-full bg-indigo-100 px-2 py-1 text-xs text-indigo-700">
                          {author.short_name || author.name}
                        </span>
                      ))}
                      {(magazine.authors?.length || 0) > 8 && (
                        <span className="rounded-full bg-slate-200 px-2 py-1 text-xs text-slate-700">
                          +{(magazine.authors?.length || 0) - 8}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => openEdit(magazine)}
                      className="rounded-lg bg-blue-100 px-3 py-1.5 text-sm font-semibold text-blue-800 hover:bg-blue-200"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(magazine)}
                      className="rounded-lg bg-red-100 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-200"
                    >
                      Delete
                    </button>
                  </div>

                  <p className="mt-3 text-[11px] text-slate-400">Updated: {formatDate(magazine.updated_at || magazine.created_at)}</p>
                </div>
              ))}
            </div>
            <ManagementPagination
              currentPage={currentPage}
              totalPages={Math.max(1, Math.ceil(totalCount / pageSize))}
              pageSize={pageSize}
              totalItems={totalCount}
              visibleCount={magazines.length}
              onPageChange={(page) => loadMagazines(search, page, pageSize)}
              onPageSizeChange={(nextPageSize) => loadMagazines(search, 1, nextPageSize)}
            />
          </>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={() => setModalOpen(false)}>
          <div
            className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-4 shadow-xl md:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900">{editing ? "Edit Magazine" : "Create Magazine"}</h3>
              <button onClick={() => setModalOpen(false)} className="text-2xl text-slate-500 hover:text-slate-700">
                ×
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">
                Name *
                <input className="mt-1 w-full rounded border px-3 py-2" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Short Name
                <input className="mt-1 w-full rounded border px-3 py-2" value={form.short_name} onChange={(e) => setForm((f) => ({ ...f, short_name: e.target.value }))} />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Slug
                <input className="mt-1 w-full rounded border px-3 py-2" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Website URL
                <input className="mt-1 w-full rounded border px-3 py-2" value={form.website_url} onChange={(e) => setForm((f) => ({ ...f, website_url: e.target.value }))} />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Contact Email
                <input className="mt-1 w-full rounded border px-3 py-2" value={form.contact_email} onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))} />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Headquarters
                <input className="mt-1 w-full rounded border px-3 py-2" value={form.headquarters} onChange={(e) => setForm((f) => ({ ...f, headquarters: e.target.value }))} />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Founded Year
                <input type="number" className="mt-1 w-full rounded border px-3 py-2" value={form.founded_year} onChange={(e) => setForm((f) => ({ ...f, founded_year: e.target.value }))} />
              </label>
              <label className="text-sm font-medium text-slate-700">
                ISSN Print
                <input className="mt-1 w-full rounded border px-3 py-2" value={form.issn_print} onChange={(e) => setForm((f) => ({ ...f, issn_print: e.target.value }))} />
              </label>
              <label className="text-sm font-medium text-slate-700">
                ISSN Online
                <input className="mt-1 w-full rounded border px-3 py-2" value={form.issn_online} onChange={(e) => setForm((f) => ({ ...f, issn_online: e.target.value }))} />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Cover Image URL
                <input className="mt-1 w-full rounded border px-3 py-2" value={form.cover_image_url} onChange={(e) => setForm((f) => ({ ...f, cover_image_url: e.target.value }))} />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Cover Image Public ID
                <input className="mt-1 w-full rounded border px-3 py-2" value={form.cover_image_public_id} onChange={(e) => setForm((f) => ({ ...f, cover_image_public_id: e.target.value }))} />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Logo Image URL
                <input className="mt-1 w-full rounded border px-3 py-2" value={form.logo_image_url} onChange={(e) => setForm((f) => ({ ...f, logo_image_url: e.target.value }))} />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Logo Image Public ID
                <input className="mt-1 w-full rounded border px-3 py-2" value={form.logo_image_public_id} onChange={(e) => setForm((f) => ({ ...f, logo_image_public_id: e.target.value }))} />
              </label>

              <label className="col-span-full text-sm font-medium text-slate-700">
                Description
                <textarea className="mt-1 h-24 w-full rounded border px-3 py-2" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              </label>

              <label className="col-span-full text-sm font-medium text-slate-700">
                Metadata JSON
                <textarea className="mt-1 h-28 w-full rounded border px-3 py-2 font-mono text-xs" value={form.metadata_json} onChange={(e) => setForm((f) => ({ ...f, metadata_json: e.target.value }))} />
              </label>

              <label className="col-span-full flex items-center gap-2 text-sm font-medium text-slate-700">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
                Active Magazine
              </label>
            </div>

            <div className="mt-6 rounded-lg border border-slate-200 p-4">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-800">Attach Authors</h4>
                <span className="text-xs text-slate-500">Selected: {selectedAuthorIds.length}</span>
              </div>
              <input
                value={authorSearch}
                onChange={(e) => setAuthorSearch(e.target.value)}
                placeholder="Search authors..."
                className="mb-3 w-full rounded border px-3 py-2 text-sm"
              />
              {authorLoading ? (
                <p className="text-sm text-slate-500">Loading authors...</p>
              ) : (
                <div className="max-h-52 overflow-y-auto rounded border border-slate-200 p-2">
                  {authorOptions.length === 0 ? (
                    <p className="text-sm text-slate-500">No authors found.</p>
                  ) : (
                    authorOptions.map((author) => {
                      const checked = selectedAuthorIds.includes(author.id);
                      return (
                        <label key={author.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-slate-50">
                          <input type="checkbox" checked={checked} onChange={() => toggleAuthor(author.id)} />
                          <span className="text-sm text-slate-700">{author.name}</span>
                          {author.short_name ? <span className="text-xs text-slate-500">({author.short_name})</span> : null}
                        </label>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setModalOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
                Cancel
              </button>
              <button onClick={handleSave} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                {editing ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
