import { MouseEvent } from "react";

interface ExtractedTextModalProps {
  isOpen: boolean;
  onClose: (e?: MouseEvent<HTMLButtonElement>) => void;
  title: string;
  text: string;
  loading: boolean;
  error: string | null;
}

export default function ExtractedTextModal({ isOpen, onClose, title, text, loading, error }: ExtractedTextModalProps) {
  if (!isOpen) return null;

  const hasContent = Boolean(text?.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="bg-white/95 backdrop-blur-md shadow-2xl rounded-2xl p-8 w-full max-w-6xl h-[85vh] relative flex flex-col border border-white/20">
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700 text-2xl focus:outline-none focus:ring-2 focus:ring-slate-300 rounded-full w-9 h-9 flex items-center justify-center transition-all duration-200"
            aria-label="Close extracted text viewer"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          <div className="h-full overflow-y-auto">
            {loading ? (
              <div className="flex h-full items-center justify-center text-slate-600 font-semibold">Extracting text…</div>
            ) : error ? (
              <div className="p-6 text-red-700 bg-red-50 border-b border-red-200 font-semibold">{error}</div>
            ) : hasContent ? (
              <pre className="whitespace-pre-wrap break-words font-mono text-sm text-slate-800 p-6 leading-relaxed">
                {text}
              </pre>
            ) : (
              <div className="p-6 text-slate-600 font-semibold">No extracted text available for this PDF.</div>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-slate-200 text-slate-800 font-semibold hover:bg-slate-300 transition-all duration-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
