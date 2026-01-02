import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { PDFDocument, degrees } from "pdf-lib";
import {
  FileText,
  Upload,
  RotateCcw,
  RotateCw,
  Copy,
  Eye,
  Trash2,
  Scissors,
  Download,
  Loader2,
  Plus,
  RefreshCcw,
} from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.js`;

interface SplitResult {
  id: string;
  blob: Blob;
  pages: number[];
  rotationMap: Record<number, number>;
  name: string;
  text?: string;
  language?: string | null;
  status?: "idle" | "extracting" | "done" | "error";
  error?: string | null;
}

function AddSplits() {
  const [file, setFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageOrder, setPageOrder] = useState<number[]>([]);
  const [rotations, setRotations] = useState<Record<number, number>>({});
  const [splitIndices, setSplitIndices] = useState<Set<number>>(new Set());
  const [autoSplitEnabled, setAutoSplitEnabled] = useState(false);
  const [autoSplitInterval, setAutoSplitInterval] = useState(1);
  const [results, setResults] = useState<SplitResult[]>([]);
  const [processing, setProcessing] = useState(false);
  const [volume, setVolume] = useState("");
  const [number, setNumber] = useState("");
  const [pdfReady, setPdfReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const g: any = globalThis as any;
    if (!g.DOMMatrix) {
      g.DOMMatrix = g.WebKitCSSMatrix || g.DOMMatrixReadOnly;
    }
    if (!g.Path2D && typeof (window as any).Path2D !== "undefined") {
      g.Path2D = (window as any).Path2D;
    }
    if (!g.ImageData && typeof (window as any).ImageData !== "undefined") {
      g.ImageData = (window as any).ImageData;
    }
    try {
      pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.js`;
    } catch (err) {
      console.warn("Failed to set pdfjs workerSrc", err);
    }
    setPdfReady(true);
  }, []);

  const onDocumentLoadSuccess = useCallback(({ numPages: nextNumPages }: { numPages: number }) => {
    setNumPages(nextNumPages);
    setPageOrder(Array.from(Array(nextNumPages).keys()));
    setRotations({});
    setSplitIndices(new Set());
    setResults([]);
  }, []);

  const rotatePage = (logicalIndex: number, direction: "left" | "right") => {
    setRotations((prev) => {
      const current = prev[logicalIndex] || 0;
      const delta = direction === "left" ? -90 : 90;
      const updated = ((current + delta + 360) % 360) as number;
      return { ...prev, [logicalIndex]: updated };
    });
  };

  const duplicatePage = (logicalIndex: number) => {
    setPageOrder((prev) => {
      const insertIndex = prev.indexOf(logicalIndex) + 1;
      const newOrder = [...prev];
      newOrder.splice(insertIndex, 0, logicalIndex);
      return newOrder;
    });
  };

  const deletePageAt = (position: number, logicalIndex: number) => {
    setPageOrder((prev) => {
      if (position < 0 || position >= prev.length) return prev;
      const next = [...prev];
      next.splice(position, 1);
      setSplitIndices((prevSplits) => {
        const updated = new Set<number>();
        const maxPos = Math.max(0, next.length - 1);
        prevSplits.forEach((pos) => {
          if (pos < position && pos <= maxPos) {
            updated.add(pos);
          } else if (pos > position && pos - 1 <= maxPos) {
            updated.add(pos - 1);
          }
        });
        return updated;
      });
      return next;
    });
  };

  const toggleSplit = (position: number) => {
    setSplitIndices((prev) => {
      const next = new Set(prev);
      if (next.has(position)) next.delete(position);
      else next.add(position);
      return next;
    });
  };

  const sections = useMemo(() => {
    if (!pageOrder.length) return [] as number[][];
    if (autoSplitEnabled && autoSplitInterval > 0) {
      const parts: number[][] = [];
      for (let i = 0; i < pageOrder.length; i += autoSplitInterval) {
        parts.push(pageOrder.slice(i, i + autoSplitInterval));
      }
      return parts;
    }
    const sorted = Array.from(splitIndices).sort((a, b) => a - b);
    const parts: number[][] = [];
    let start = 0;
    for (const pos of sorted) {
      const end = Math.min(pos, pageOrder.length - 1);
      if (end >= start) {
        parts.push(pageOrder.slice(start, end + 1));
        start = end + 1;
      }
    }
    parts.push(pageOrder.slice(start));
    return parts;
  }, [autoSplitEnabled, autoSplitInterval, pageOrder, splitIndices]);

  const buildSplits = async () => {
    if (!file || !sections.length) return;
    setProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const originalPdf = await PDFDocument.load(arrayBuffer);

      const built: SplitResult[] = [];
      for (let i = 0; i < sections.length; i++) {
        const indices = sections[i];
        const newPdf = await PDFDocument.create();
        for (const logicalIdx of indices) {
          const [copiedPage] = await newPdf.copyPages(originalPdf, [logicalIdx]);
          const rotation = rotations[logicalIdx] || 0;
          if (rotation) copiedPage.setRotation(degrees(rotation));
          newPdf.addPage(copiedPage);
        }
        const pdfBytes = await newPdf.save();
        const blob = new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" });
        built.push({
          id: `split-${i + 1}`,
          blob,
          pages: indices,
          rotationMap: { ...rotations },
          name: `${file.name.replace(/\\.pdf$/i, "")}-part-${i + 1}.pdf`,
          status: "idle",
        });
      }
      setResults(built);
    } catch (error) {
      console.error("Split error:", error);
      alert("There was an error splitting the PDF.");
    } finally {
      setProcessing(false);
    }
  };

  const runExtraction = async (split: SplitResult) => {
    setResults((prev) =>
      prev.map((r) => (r.id === split.id ? { ...r, status: "extracting", error: null } : r)),
    );
    try {
      const form = new FormData();
      form.append("pdf", split.blob, split.name);
      const resp = await fetch("/api/extract-text-file", { method: "POST", body: form });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "Extraction failed");
      setResults((prev) =>
        prev.map((r) =>
          r.id === split.id
            ? { ...r, text: data.text || "", language: data.language || null, status: "done" }
            : r,
        ),
      );
    } catch (error: any) {
      setResults((prev) =>
        prev.map((r) =>
          r.id === split.id ? { ...r, status: "error", error: error?.message || "Extraction failed" } : r,
        ),
      );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Split & Prepare PDFs</h1>
            <p className="text-gray-600">
              Upload a PDF, split into parts, extract text (with OCR), and prep records before bulk adding.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 shadow-sm hover:bg-gray-50">
              <Upload className="h-4 w-4" />
              <span>Select PDF</span>
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>
            <button
              onClick={buildSplits}
              disabled={!file || !sections.length || processing}
              className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
              <span>Build Splits</span>
            </button>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            {file ? (
              <Document
                key={file.name}
                file={file}
                onLoadSuccess={onDocumentLoadSuccess}
                loading={
                  <div className="flex flex-col items-center justify-center gap-4 p-12">
                    <Loader2 className="h-10 w-10 animate-spin text-gray-900" />
                    <p className="text-sm font-medium text-gray-600">Loading PDF…</p>
                  </div>
                }
                className="w-full"
                options={
                  pdfReady
                    ? undefined
                    : {
                        standardFontDataUrl: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/standard_fonts/`,
                      }
                }
              >
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {pageOrder.map((pageIndex, logicalPosition) => {
                    const rotation = rotations[pageIndex] || 0;
                    const isSplit = splitIndices.has(logicalPosition);
                    const isLast = logicalPosition === pageOrder.length - 1;
                    return (
                      <div key={`${pageIndex}-${logicalPosition}`} className="group relative overflow-visible">
                        <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-gray-300 hover:shadow-md">
                          <div className="relative flex h-[240px] items-center justify-center overflow-hidden bg-gray-50 p-3">
                            <div className="rounded border border-gray-200 bg-white p-2 shadow-sm">
                              <Page
                                key={`page_${pageIndex}_${logicalPosition}`}
                                pageNumber={pageIndex + 1}
                                renderMode="canvas"
                                renderAnnotationLayer={false}
                                renderTextLayer={false}
                                height={200}
                                rotate={rotation}
                                className="pointer-events-none select-none"
                              />
                            </div>
                            <div className="absolute inset-x-0 top-0 flex justify-center gap-1.5 p-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                              <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                                <button
                                  onClick={() => rotatePage(pageIndex, "left")}
                                  className="flex h-8 w-8 items-center justify-center rounded border border-gray-200 bg-white text-xs text-gray-700 transition hover:bg-gray-50 active:scale-95"
                                  title="Rotate left"
                                >
                                  <RotateCcw className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => rotatePage(pageIndex, "right")}
                                  className="flex h-8 w-8 items-center justify-center rounded border border-gray-200 bg-white text-xs text-gray-700 transition hover:bg-gray-50 active:scale-95"
                                  title="Rotate right"
                                >
                                  <RotateCw className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => duplicatePage(pageIndex)}
                                  className="flex h-8 w-8 items-center justify-center rounded border border-gray-200 bg-white text-xs text-gray-700 transition hover:bg-gray-50 active:scale-95"
                                  title="Duplicate page"
                                >
                                  <Copy className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => deletePageAt(logicalPosition, pageIndex)}
                                  className="flex h-8 w-8 items-center justify-center rounded border border-gray-200 bg-white text-xs text-gray-700 transition hover:bg-gray-50 active:scale-95"
                                  title="Delete page"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                            {rotation !== 0 && (
                              <div className="absolute bottom-3 right-3 rounded border border-gray-300 bg-white px-2 py-0.5 text-xs font-semibold text-gray-700 shadow-sm">
                                {rotation}°
                              </div>
                            )}
                          </div>
                          <div className="border-t border-gray-200 bg-gray-50 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex min-w-0 flex-1 items-center gap-2">
                                <FileText className="h-4 w-4 flex-shrink-0 text-gray-400" />
                                <span className="truncate rounded bg-gray-100 px-2 py-1 text-xs font-normal text-gray-700">
                                  {file.name}
                                </span>
                              </div>
                              <span className="flex h-6 min-w-[24px] flex-shrink-0 items-center justify-center rounded bg-gray-900 px-2 text-xs font-semibold text-white">
                                {pageIndex + 1}
                              </span>
                            </div>
                          </div>
                        </div>
                        {!isLast && (
                          <div className="absolute -right-4 top-1/2 z-10 -translate-y-1/2">
                            <button
                              onClick={() => toggleSplit(logicalPosition)}
                              className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-lg shadow-sm transition-all duration-200 hover:scale-110 active:scale-95 ${
                                isSplit
                                  ? "border-gray-900 bg-gray-900 text-white shadow-md"
                                  : "border-gray-300 bg-white text-gray-600 hover:border-gray-400 hover:bg-gray-50"
                              }`}
                              title={isSplit ? "Remove split" : "Split after this page"}
                            >
                              <Scissors className="h-5 w-5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Document>
            ) : (
              <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-3 text-center text-gray-500">
                <Plus className="h-10 w-10 text-gray-400" />
                <p className="text-sm font-medium">Upload a PDF to begin.</p>
              </div>
            )}
          </div>

          <aside className="flex h-fit flex-col gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">Split Controls</h3>
              <span className="text-xs text-gray-500">{sections.length} files</span>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
              <input
                type="checkbox"
                checked={autoSplitEnabled}
                onChange={(e) => setAutoSplitEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-800"
              />
              Auto split every
            </label>
            <input
              type="number"
              min={1}
              value={autoSplitInterval}
              onChange={(e) => setAutoSplitInterval(Math.max(1, Number(e.target.value) || 1))}
              className="w-24 rounded border border-gray-200 bg-white px-2 py-1 text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
            />
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
              <div className="mb-2 font-semibold">Common Fields</div>
              <div className="flex gap-2">
                <input
                  value={volume}
                  onChange={(e) => setVolume(e.target.value)}
                  placeholder="Volume"
                  className="flex-1 rounded border border-gray-200 bg-white px-2 py-1 text-sm"
                />
                <input
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  placeholder="Number"
                  className="flex-1 rounded border border-gray-200 bg-white px-2 py-1 text-sm"
                />
              </div>
            </div>
            <button
              onClick={buildSplits}
              disabled={!file || !sections.length || processing}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-900 bg-gray-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-gray-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {processing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Scissors className="h-5 w-5" />}
              <span>Build Splits</span>
            </button>
          </aside>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Split Results</h2>
              <p className="text-gray-600 text-sm">Run OCR/text extraction for each split, then review before upload.</p>
            </div>
            <button
              onClick={() => results.forEach((r) => runExtraction(r))}
              disabled={!results.length}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCcw className="h-4 w-4" />
              <span>Run OCR for all</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700">Part</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700">Pages</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700">Language</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700">Status</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700">Text Preview</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {results.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="px-3 py-2 font-semibold text-gray-900">{r.name}</td>
                    <td className="px-3 py-2 text-gray-700">
                      {r.pages.map((p) => p + 1).join(", ")}
                    </td>
                    <td className="px-3 py-2 text-gray-700">{r.language || "—"}</td>
                    <td className="px-3 py-2">
                      {r.status === "extracting" && (
                        <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                          <Loader2 className="h-3 w-3 animate-spin" /> Extracting…
                        </span>
                      )}
                      {r.status === "done" && (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                          Ready
                        </span>
                      )}
                      {r.status === "error" && (
                        <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">
                          Error
                        </span>
                      )}
                      {!r.status || r.status === "idle" ? (
                        <span className="text-xs text-gray-500">Idle</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-gray-700 max-w-xs">
                      <div className="line-clamp-4 text-xs">
                        {r.text ? r.text : r.status === "error" ? r.error : "—"}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => runExtraction(r)}
                          className="inline-flex items-center gap-1 rounded bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800"
                        >
                          <RefreshCcw className="h-3 w-3" />
                          OCR
                        </button>
                        <a
                          href={URL.createObjectURL(r.blob)}
                          download={r.name}
                          className="inline-flex items-center gap-1 rounded border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-50"
                        >
                          <Download className="h-3 w-3" />
                          Download
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
                {!results.length && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                      Build splits to see results.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default dynamic(() => Promise.resolve(AddSplits), { ssr: false });
