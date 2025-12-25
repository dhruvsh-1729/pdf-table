import { MouseEvent } from "react";

interface ExtractedTextModalProps {
  isOpen: boolean;
  onClose: (e?: MouseEvent<HTMLButtonElement>) => void;
  title: string;
  text: string;
  loading: boolean;
  error: string | null;
  pdfUrl?: string | null;
  onReextract?: () => Promise<void>;
  reextracting?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  disablePrev?: boolean;
  disableNext?: boolean;
}

export default function ExtractedTextModal({
  isOpen,
  onClose,
  title,
  text,
  loading,
  error,
  pdfUrl,
  onReextract,
  reextracting,
  onPrev,
  onNext,
  disablePrev,
  disableNext,
}: ExtractedTextModalProps) {
  if (!isOpen) return null;

  const hasContent = Boolean(text?.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="bg-white/95 backdrop-blur-md shadow-2xl rounded-2xl p-8 w-full max-w-6xl h-[85vh] relative flex flex-col border border-white/20">
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={onPrev}
              disabled={!onPrev || disablePrev || loading}
              className="px-3 py-2 rounded-lg bg-slate-200 text-slate-800 font-semibold hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              ← Prev
            </button>
            <button
              onClick={onNext}
              disabled={!onNext || disableNext || loading}
              className="px-3 py-2 rounded-lg bg-slate-200 text-slate-800 font-semibold hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              Next →
            </button>
            <button
              onClick={onClose}
              className="text-slate-500 hover:text-slate-700 text-2xl focus:outline-none focus:ring-2 focus:ring-slate-300 rounded-full w-9 h-9 flex items-center justify-center transition-all duration-200"
              aria-label="Close extracted text viewer"
            >
              ×
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          <div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="flex flex-col min-h-0 border-b border-slate-200 lg:border-b-0 lg:border-r bg-white">
              <div className="px-4 py-3 border-b border-slate-200 font-semibold text-slate-800">Extracted Text</div>
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex h-full items-center justify-center text-slate-600 font-semibold">
                    Extracting text…
                  </div>
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
            <div className="flex flex-col min-h-0 bg-slate-100 border-l border-slate-200">
              <div className="px-4 py-3 border-b border-slate-200 font-semibold text-slate-800">PDF Preview</div>
              <div className="flex-1 min-h-0 overflow-hidden">
                {pdfUrl ? (
                  <iframe
                    key={pdfUrl}
                    src={pdfUrl}
                    title="PDF preview"
                    className="w-full h-full rounded-br-xl border-0"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-600 font-semibold">
                    No PDF available for preview.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center pt-4">
          <div className="text-xs text-slate-500">
            Need a fresh OCR pass? Use the button to re-run text extraction for this PDF.
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-slate-200 text-slate-800 font-semibold hover:bg-slate-300 transition-all duration-200"
          >
            Close
          </button>
          {onReextract && (
            <button
              onClick={() => onReextract()}
              disabled={loading || reextracting}
              className="px-5 py-2 rounded-lg bg-emerald-500 text-white font-semibold hover:bg-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200"
            >
              {reextracting ? "Re-running OCR…" : "Re-run OCR"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
