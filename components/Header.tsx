// components/Header.tsx
import { useRouter } from "next/router";
import { memo, useMemo } from "react";
import { User } from "../types";

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

const ADMIN_EMAILS = ["dharmsasanwork99@gmail.com", "dhruvshdarshansh@gmail.com"];

const Header = memo<HeaderProps>(
  ({ user, access, selectedEmail, setSelectedEmail, fetchedEmails, setModalOpen, setBugModalOpen, exportToCSV }) => {
    const router = useRouter();

    const isAdmin = useMemo(() => user?.email && ADMIN_EMAILS.includes(user.email), [user?.email]);

    const handleLogout = () => {
      localStorage.removeItem("user");
      router.push("/login");
    };

    const adminButtons = [
      { label: "Dashboard", path: "/dashboard", colors: "bg-blue-200" },
      { label: "Authors", path: "/authors", colors: "bg-green-200" },
      { label: "Tags", path: "/tags", colors: "bg-purple-200" },
      { label: "Bulk Add", path: "/add", colors: "bg-indigo-200" },
    ];

    return (
      <header className="mb-4">
        <div className="bg-white/90 backdrop-blur-sm rounded-xl p-4 shadow-md border border-gray-100">
          {/* Single Row Layout */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex-shrink-0">
              <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-800 to-indigo-600 bg-clip-text text-transparent">
                📚 Magazine Portal
              </h1>
            </div>

            {/* User Filter */}
            <select
              value={selectedEmail || ""}
              onChange={(e) => setSelectedEmail(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent flex-shrink-0"
            >
              <option value="">All Users</option>
              {fetchedEmails.map(({ creator_name, email }) => (
                <option key={email} value={email}>
                  {creator_name} ({email})
                </option>
              ))}
            </select>

            {/* All Buttons in One Row */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Admin Buttons */}
              {isAdmin &&
                adminButtons.map(({ label, path, colors }) => (
                  <button
                    key={path}
                    onClick={() => router.push(path)}
                    className={`px-3 py-1.5 text-sm font-bold text-black bg-gradient-to-r ${colors} rounded-lg hover:shadow-md transition-all duration-200 whitespace-nowrap`}
                  >
                    {label}
                  </button>
                ))}

              {/* Add Record Button */}
              {access === "records" && (
                <button
                  onClick={() => setModalOpen(true)}
                  className="px-3 py-1.5 text-sm font-bold text-black bg-indigo-200 rounded-lg hover:shadow-md transition-all duration-200 flex items-center gap-1 whitespace-nowrap"
                >
                  <span className="text-xs">+</span>
                  Add Record
                </button>
              )}

              {/* Utility Buttons */}
              <button
                onClick={() => setBugModalOpen(true)}
                className="px-3 py-1.5 text-sm font-bold text-black bg-amber-200 rounded-lg hover:shadow-md transition-all duration-200 whitespace-nowrap"
              >
                Report Bug
              </button>

              {isAdmin && (
                <button
                  onClick={exportToCSV}
                  className="px-3 py-1.5 text-sm font-bold text-black bg-emerald-200 rounded-lg hover:shadow-md transition-all duration-200 whitespace-nowrap"
                >
                  Export
                </button>
              )}

              {/* Logout Button */}
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 text-sm font-bold text-black bg-red-200 rounded-lg hover:shadow-md transition-all duration-200 whitespace-nowrap"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>
    );
  },
);

Header.displayName = "Header";

export default Header;
