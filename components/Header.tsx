// components/Header.tsx
import { useRouter } from "next/router";
import { PencilCircleIcon, TagIcon } from "@phosphor-icons/react";
import { MagazineRecord, User } from "../types";

interface HeaderProps {
  user: User | null;
  access: string | null;
  selectedEmail: string | null;
  setSelectedEmail: (email: string | null) => void;
  fetchedEmails: { creator_name: string; email: string }[];
  setModalOpen: (open: boolean) => void;
  setBugModalOpen: (open: boolean) => void;
  exportToCSV: () => void;
}

export default function Header({
  user,
  access,
  selectedEmail,
  setSelectedEmail,
  fetchedEmails,
  setModalOpen,
  setBugModalOpen,
  exportToCSV,
}: HeaderProps) {
  const router = useRouter();

  return (
    <div className="mb-8">
      <div className="bg-white/80 backdrop-blur-md rounded-2xl p-6 shadow-xl border border-white/20">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-6">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-800 via-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
              📚 Magazine Summary Portal
            </h1>
            <p className="text-slate-600 text-lg">Manage and organize your magazine summary collection with ease</p>
          </div>
          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            {user?.email &&
              (user.email === "dharmsasanwork99@gmail.com" || user.email === "dhruvshdarshansh@gmail.com") && (
                <button
                  onClick={() => router.push("/dashboard")}
                  className="inline-flex items-center px-4 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
                  Dashboard
                </button>
              )}
            <button
              onClick={() => {
                localStorage.setItem("user", JSON.stringify(null));
                router.push("/login");
              }}
              className="inline-flex items-center px-4 py-2.5 bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              Logout
            </button>
            <select
              value={selectedEmail || ""}
              onChange={(e) => setSelectedEmail(e.target.value)}
              className="px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium shadow-lg bg-white/80 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
            >
              <option value="">📋 Show All Users</option>
              {fetchedEmails.map(({ creator_name, email }) => (
                <option key={email} value={email}>
                  👤 {`${creator_name} (${email})`}
                </option>
              ))}
            </select>
            <button
              onClick={() => setBugModalOpen(true)}
              className="inline-flex items-center px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Report Bug
            </button>
            <button
              onClick={exportToCSV}
              className="inline-flex items-center px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Export CSV
            </button>
            {access && access === "records" && (
              <button
                onClick={() => {
                  setModalOpen(true);
                }}
                className="inline-flex items-center px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Record
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
