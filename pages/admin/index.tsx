import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast, Toaster } from "sonner";
import type { AdminUserRow } from "@/pages/api/admin/users";

const MIN_PASSWORD_LENGTH = 8;

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

function statusOf(u: AdminUserRow) {
  if (u.hasPassword && u.confirmed) return { label: "Active", cls: "bg-green-100 text-green-800" };
  if (u.accessRequestedAt) return { label: "Requested access", cls: "bg-amber-100 text-amber-800" };
  return { label: "No password", cls: "bg-gray-100 text-gray-700" };
}

export default function AdminPanel() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [passwords, setPasswords] = useState<Record<number, string>>({});
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "" });
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    if (res.ok) setUsers(data.users);
    else toast.error(data.error || "Failed to load users");
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const call = async (url: string, method: string, body?: unknown, success?: string) => {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "Request failed");
      return false;
    }
    if (success) toast.success(success);
    await load();
    return true;
  };

  const setPassword = async (u: AdminUserRow) => {
    const pw = passwords[u.id] ?? "";
    if (pw.length < MIN_PASSWORD_LENGTH) return toast.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    if (await call(`/api/admin/users/${u.id}`, "PATCH", { password: pw }, `Password set for ${u.email}`)) {
      setPasswords((p) => ({ ...p, [u.id]: "" }));
    }
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await call("/api/admin/users", "POST", newUser, `Created ${newUser.email}`)) {
      setNewUser({ name: "", email: "", password: "" });
    }
  };

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = q ? users.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(q)) : users;
    // Pending requests first, most recent first.
    return [...list].sort((a, b) => {
      const pa = !a.hasPassword && a.accessRequestedAt ? 1 : 0;
      const pb = !b.hasPassword && b.accessRequestedAt ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return a.id - b.id;
    });
  }, [users, filter]);

  const pendingCount = users.filter((u) => !u.hasPassword && u.accessRequestedAt).length;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <Toaster position="top-right" />
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Admin panel — user access</h1>
            <p className="text-sm text-gray-500">
              Users can only sign in once you set a password for them here. Setting or changing a password signs the user
              out everywhere.
            </p>
          </div>
          <div className="flex gap-2">
          <Link href="/admin/ingest" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700">
            Ingest an issue
          </Link>
          <Link href="/" className="px-4 py-2 rounded-lg bg-white border border-gray-200 text-sm hover:bg-gray-100">
            ← Back to portal
          </Link>
          </div>
        </div>

        {pendingCount > 0 && (
          <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            {pendingCount} pending access request{pendingCount > 1 ? "s" : ""} — set a password to grant access.
          </div>
        )}

        <form onSubmit={createUser} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 grid gap-3 md:grid-cols-4">
          <input
            placeholder="Full name"
            value={newUser.name}
            onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
          <input
            placeholder="Email"
            type="email"
            value={newUser.email}
            onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
          <input
            placeholder={`Password (min ${MIN_PASSWORD_LENGTH})`}
            type="text"
            autoComplete="off"
            value={newUser.password}
            onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
          <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700">
            Add user
          </button>
        </form>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
          <div className="p-4 border-b border-gray-100">
            <input
              placeholder="Filter by name or email"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full md:w-80 px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="p-3">User</th>
                <th className="p-3">Status</th>
                <th className="p-3">Role</th>
                <th className="p-3">Last login</th>
                <th className="p-3">Set / reset password</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-gray-500">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading &&
                visible.map((u) => {
                  const status = statusOf(u);
                  return (
                    <tr key={u.id} className="border-t border-gray-100 align-top">
                      <td className="p-3">
                        <div className="font-medium text-gray-800">{u.name || "—"}</div>
                        <div className="text-gray-500">{u.email}</div>
                        {u.accessRequestedAt && (
                          <div className="text-xs text-gray-400">Requested {fmt(u.accessRequestedAt)}</div>
                        )}
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded-full text-xs ${status.cls}`}>{status.label}</span>
                      </td>
                      <td className="p-3">
                        <select
                          value={u.role}
                          onChange={(e) =>
                            call(`/api/admin/users/${u.id}`, "PATCH", { role: e.target.value }, `Role updated for ${u.email}`)
                          }
                          className="px-2 py-1 border border-gray-200 rounded text-sm"
                        >
                          <option value="user">User</option>
                          <option value="super_admin">Super admin</option>
                        </select>
                      </td>
                      <td className="p-3 text-gray-500">{fmt(u.lastLoginAt)}</td>
                      <td className="p-3">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            autoComplete="off"
                            placeholder="New password"
                            value={passwords[u.id] ?? ""}
                            onChange={(e) => setPasswords((p) => ({ ...p, [u.id]: e.target.value }))}
                            className="px-2 py-1 border border-gray-200 rounded text-sm w-40"
                          />
                          <button
                            onClick={() => setPassword(u)}
                            className="px-3 py-1 rounded bg-indigo-600 text-white text-xs hover:bg-indigo-700"
                          >
                            Save
                          </button>
                        </div>
                      </td>
                      <td className="p-3 whitespace-nowrap space-x-2">
                        {u.hasPassword && (
                          <button
                            onClick={() => call(`/api/admin/users/${u.id}`, "PATCH", { revoke: true }, `Access revoked for ${u.email}`)}
                            className="text-xs text-amber-700 hover:underline"
                          >
                            Revoke
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (window.confirm(`Delete ${u.email}? This cannot be undone.`)) {
                              call(`/api/admin/users/${u.id}`, "DELETE", undefined, `Deleted ${u.email}`);
                            }
                          }}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
