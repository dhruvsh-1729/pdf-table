// components/RecordFormModal.tsx
import { ChangeEvent, MouseEvent } from "react";
import CreatableSelect from "react-select/creatable";
import { MagazineRecord, User } from "../types";

interface RecordFormModalProps {
  modalOpen: boolean;
  setModalOpen: (open: boolean) => void;
  editingRecord: MagazineRecord | null;
  name: string;
  setName: (name: string) => void;
  summary: string;
  setSummary: (summary: string) => void;
  conclusion: string;
  setConclusion: (conclusion: string) => void;
  file: File | null;
  setFile: (file: File | null) => void;
  volume: string;
  setVolume: (volume: string) => void;
  number: string;
  setNumber: (number: string) => void;
  timestamp: string;
  setTimestamp: (timestamp: string) => void;
  titleName: string;
  setTitleName: (titleName: string) => void;
  pageNumbers: string;
  setPageNumbers: (pageNumbers: string) => void;
  authors: string;
  setAuthors: (authors: string) => void;
  language: string;
  setLanguage: (language: string) => void;
  loading: boolean;
  error: string | null;
  user: User | null;
  records: MagazineRecord[];
  handleSubmit: (e: MouseEvent<HTMLButtonElement>) => Promise<void>;
  handleFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  showFileSize: boolean;
  setShowFileSize: (show: boolean) => void;
  setError: (error: string | null) => void;
}

export default function RecordFormModal({
  modalOpen,
  setModalOpen,
  editingRecord,
  name,
  setName,
  summary,
  setSummary,
  conclusion,
  setConclusion,
  file,
  setFile,
  volume,
  setVolume,
  number,
  setNumber,
  timestamp,
  setTimestamp,
  titleName,
  setTitleName,
  pageNumbers,
  setPageNumbers,
  authors,
  setAuthors,
  language,
  setLanguage,
  loading,
  error,
  user,
  records,
  handleSubmit,
  handleFileChange,
  showFileSize,
  setShowFileSize,
  setError,
}: RecordFormModalProps) {
  if (!modalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white/95 backdrop-blur-md shadow-2xl rounded-2xl w-[80vw] p-4 relative h-[80vh] overflow-hidden border border-white/20">
        <button
          onClick={() => setModalOpen(false)}
          className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 text-2xl focus:outline-none focus:ring-2 focus:ring-slate-300 rounded-full w-8 h-8 flex items-center justify-center transition-all duration-200"
          aria-label="Close form"
          disabled={loading}
        >
          ×
        </button>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-8 gap-4">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-800 to-indigo-600 bg-clip-text text-transparent">
            {editingRecord ? "Update" : "Upload New"} Record
          </h1>
          {user && (
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl px-4 py-3">
              <div className="text-sm text-slate-600 flex flex-col lg:flex-row lg:items-center gap-2 mr-12">
                <div className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="font-semibold">User:</span>
                  <span className="text-slate-800">{user?.name || ""}</span>
                </div>
                <span className="mx-2 hidden lg:inline text-slate-400">•</span>
                <div className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                  <span className="font-semibold">Email:</span>
                  <span className="text-slate-800">{user?.email || ""}</span>
                </div>
              </div>
            </div>
          )}
        </div>
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-gradient-to-r from-red-50 to-pink-50 border border-red-200 flex items-center gap-3">
            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-red-700 text-sm font-medium">{error}</p>
          </div>
        )}
        <div className="space-y-6 overflow-y-auto h-[calc(100%-8rem)] pr-4 custom-scrollbar">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Magazine Name <span className="text-red-500">*</span>
              </label>
              <CreatableSelect
                isClearable
                value={name ? { label: name, value: name } : null}
                onChange={(option) => setName(option ? option.value : "")}
                onCreateOption={(inputValue) => setName(inputValue)}
                options={Array.from(new Set(records.map((r) => r.name).filter(Boolean))).map((n) => ({
                  label: n,
                  value: n,
                }))}
                placeholder="Select or enter magazine name"
                isDisabled={loading}
                classNamePrefix="react-select"
                styles={{
                  control: (base) => ({
                    ...base,
                    minHeight: "44px",
                    borderRadius: "12px",
                    borderColor: "#e2e8f0",
                    borderWidth: "2px",
                    boxShadow: "none",
                    fontSize: "14px",
                    paddingLeft: "8px",
                    paddingRight: "8px",
                    background: "linear-gradient(to right, #f8fafc, #f1f5f9)",
                    "&:hover": {
                      borderColor: "#3b82f6",
                    },
                  }),
                  menu: (base) => ({
                    ...base,
                    zIndex: 9999,
                    borderRadius: "12px",
                    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
                  }),
                }}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                PDF File {editingRecord ? "(optional, to replace existing)" : <span className="text-red-500">*</span>}
              </label>
              <div className="relative">
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-slate-500 file:mr-4 file:py-3 file:px-6 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-gradient-to-r file:from-indigo-50 file:to-purple-50 file:text-indigo-700 hover:file:bg-gradient-to-r hover:file:from-indigo-100 hover:file:to-purple-100 disabled:file:bg-gray-200 border-2 border-slate-200 rounded-xl p-3 bg-gradient-to-r from-slate-50 to-gray-50"
                  disabled={loading}
                />
              </div>
              <p className="mt-2 text-xs text-slate-500 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Only PDF files are accepted (max 4MB)
              </p>
            </div>
          </div>
          {showFileSize && (
            <div className="p-4 rounded-xl border-2 border-red-200 bg-gradient-to-r from-red-50 to-pink-50 flex items-center gap-3">
              <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="text-sm text-red-700">
                <span className="font-semibold">File too large (&gt;4MB).</span>
                <span className="ml-1">Compress at </span>
                <a
                  href="https://www.ilovepdf.com/compress_pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-semibold text-red-800 hover:text-red-900"
                >
                  ilovepdf.com
                </a>
                <span> and re-upload.</span>
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Summary <span className="text-red-500">*</span>
            </label>
            <textarea
              value={summary.replace(/\\r\\n|\\n|\\r/g, "\n")}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Enter a detailed summary of the magazine content..."
              className="w-full rounded-xl border-2 border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-0 text-sm disabled:bg-gray-100 px-4 py-3 bg-gradient-to-r from-slate-50 to-gray-50 transition-all duration-200"
              disabled={loading}
              rows={6}
            />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Title Name</label>
              <input
                type="text"
                value={titleName}
                onChange={(e) => setTitleName(e.target.value)}
                placeholder="Enter the specific title name"
                className="w-full rounded-xl border-2 border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-0 text-sm disabled:bg-gray-100 px-4 py-3 bg-gradient-to-r from-slate-50 to-gray-50"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Authors</label>
              <input
                type="text"
                value={authors}
                onChange={(e) => setAuthors(e.target.value)}
                placeholder="Enter authors separated by commas"
                className="w-full rounded-xl border-2 border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-0 text-sm disabled:bg-gray-100 px-4 py-3 bg-gradient-to-r from-slate-50 to-gray-50"
                disabled={loading}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Volume</label>
              <input
                type="text"
                value={volume}
                onChange={(e) => setVolume(e.target.value)}
                placeholder="e.g., Vol 1"
                className="w-full rounded-xl border-2 border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-0 text-sm disabled:bg-gray-100 px-4 py-3 bg-gradient-to-r from-slate-50 to-gray-50"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Number</label>
              <input
                type="text"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="e.g., No 1"
                className="w-full rounded-xl border-2 border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-0 text-sm disabled:bg-gray-100 px-4 py-3 bg-gradient-to-r from-slate-50 to-gray-50"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Timestamp</label>
              <input
                type="text"
                value={timestamp}
                onChange={(e) => setTimestamp(e.target.value)}
                placeholder="e.g., Jan 2024"
                className="w-full rounded-xl border-2 border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-0 text-sm disabled:bg-gray-100 px-4 py-3 bg-gradient-to-r from-slate-50 to-gray-50"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Page Numbers</label>
              <input
                type="text"
                value={pageNumbers}
                onChange={(e) => setPageNumbers(e.target.value)}
                placeholder="e.g., 100-105"
                className="w-full rounded-xl border-2 border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-0 text-sm disabled:bg-gray-100 px-4 py-3 bg-gradient-to-r from-slate-50 to-gray-50"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Language</label>
              <input
                type="text"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                placeholder="e.g., English, Hindi, etc."
                className="w-full rounded-xl border-2 border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-0 text-sm disabled:bg-gray-100 px-4 py-3 bg-gradient-to-r from-slate-50 to-gray-50"
                disabled={loading}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Conclusion <span className="text-slate-500">(by maharaj saheb)</span>
            </label>
            <textarea
              value={conclusion}
              onChange={(e) => setConclusion(e.target.value)}
              placeholder="Enter conclusion or final thoughts..."
              className="w-full rounded-xl border-2 border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-0 text-sm disabled:bg-gray-100 px-4 py-3 bg-gradient-to-r from-slate-50 to-gray-50"
              disabled={loading}
              rows={5}
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => {
              setModalOpen(false);
              setName("");
              setSummary("");
              setConclusion("");
              setFile(null);
              setVolume("");
              setNumber("");
              setTimestamp("");
              setTitleName("");
              setPageNumbers("");
              setAuthors("");
              setLanguage("");
              setError(null);
            }}
            className="py-4 px-6 rounded-xl shadow-sm text-slate-700 bg-gradient-to-r from-slate-200 to-gray-300 hover:from-slate-300 hover:to-gray-400 text-sm font-semibold transition-all duration-200 transform focus:outline-none focus:ring-4 focus:ring-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className={`py-4 px-6 rounded-xl shadow-lg text-white text-sm font-semibold transition-all duration-200 transform ${
              loading
                ? "bg-gray-400 cursor-not-allowed"
                : editingRecord
                  ? "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 hover:shadow-xl hover:scale-[1.02]"
                  : "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 hover:shadow-xl hover:scale-[1.02]"
            } focus:outline-none focus:ring-4 focus:ring-indigo-300`}
            disabled={loading}
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                {editingRecord ? "Updating..." : "Uploading..."}
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                {editingRecord ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                )}
                {editingRecord ? "Update Record" : "Upload New Record"}
              </div>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
