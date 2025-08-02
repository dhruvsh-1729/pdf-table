// components/EditTextModal.tsx
import { MouseEvent } from "react";
import { MagazineRecord } from "../types";

interface EditTextModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  value: string;
  onChange: (value: string) => void;
  loading: boolean;
  handleSubmit: (e: MouseEvent<HTMLButtonElement>) => Promise<void>;
  placeholder: string;
  editingRecord: MagazineRecord | null;
  summary: string;
}

export default function EditTextModal({
  isOpen,
  onClose,
  title,
  value,
  onChange,
  loading,
  handleSubmit,
  placeholder,
  editingRecord,
  summary,
}: EditTextModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white/95 backdrop-blur-md shadow-2xl rounded-2xl p-8 w-[90vw] h-[85vh] relative flex flex-col border border-white/20">
        <button
          onClick={onClose}
          className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 text-2xl focus:outline-none focus:ring-2 focus:ring-slate-300 rounded-full w-8 h-8 flex items-center justify-center transition-all duration-200 z-10"
          aria-label="Close"
          disabled={loading}
        >
          ×
        </button>
        <h2 className="text-3xl font-bold bg-gradient-to-r from-slate-800 to-indigo-600 bg-clip-text text-transparent mb-6">
          {title}
        </h2>
        <div className="flex-1 overflow-y-auto pr-2 mb-6">
          <textarea
            className="w-full h-full min-h-[400px] rounded-xl border-2 border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-0 text-slate-700 px-4 py-3 text-base resize-none bg-gradient-to-r from-slate-50 to-gray-50 transition-all duration-200"
            value={value.replace(/\\r\\n|\\n|\\r/g, "\n")}
            onChange={(e) => onChange(e.target.value)}
            disabled={loading}
            placeholder={placeholder}
          />
        </div>
        <div className="flex items-center justify-between gap-4 pt-4 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-3 rounded-xl shadow-lg text-slate-700 bg-gradient-to-r from-slate-200 to-gray-300 hover:from-slate-300 hover:to-gray-400 text-base font-semibold transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-slate-300"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={(e) => {
              if (!summary.trim()) return;
              handleSubmit(e);
            }}
            className={`px-6 py-3 rounded-xl shadow-lg text-white text-base font-semibold transition-all duration-200 transform
            ${
              loading || !summary.trim()
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 hover:shadow-xl hover:scale-[1.02]"
            } focus:outline-none focus:ring-4 focus:ring-emerald-300`}
            disabled={loading || !summary.trim()}
          >
            {loading ? (
              <div className="flex items-center gap-2">
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
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {editingRecord ? "Update Record" : "Save Changes"}
              </div>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
