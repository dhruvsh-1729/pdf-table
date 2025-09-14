import { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";

// The columns should match your CSV headers
export type CsvRow = Record<string, string>;

function slugify(title: string) {
  return (title || "untitled")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export default function BulkRecords() {
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [current, setCurrent] = useState(0);
  const [status, setStatus] = useState<Record<number, string>>({});
  const [pdfMap, setPdfMap] = useState<Map<string, File>>(new Map()); // slug → File
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [autoMatch, setAutoMatch] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const multiPdfRef = useRef<HTMLInputElement | null>(null);

  const currentRow = rows[current];
  const currentSlug = useMemo(
    () => (currentRow ? slugify(currentRow.title_name || currentRow.name || "untitled") : ""),
    [currentRow],
  );

  const completedCount = Object.values(status).filter((s) => s.includes("✅")).length;
  const errorCount = Object.values(status).filter((s) => s.includes("❌")).length;

  function reset() {
    setRows([]);
    setCurrent(0);
    setStatus({});
    setPdfMap(new Map());
    clearPdfInput();
  }

  function clearPdfInput() {
    if (pdfInputRef.current) {
      pdfInputRef.current.value = "";
    }
  }

  function parseCsv(file: File) {
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const clean = res.data.filter((r) => Object.values(r).some((v) => String(v || "").trim() !== ""));
        setRows(clean);
        setCurrent(0);
        setStatus({});
        clearPdfInput();
      },
      error: (err) => alert("CSV parse error: " + err.message),
    });
  }

  function onChoosePdfs(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    const next = new Map(pdfMap);
    for (const f of Array.from(files)) {
      const base = f.name.replace(/\.[^.]+$/, "");
      next.set(base.toLowerCase(), f); // map by raw base name
    }
    setPdfMap(next);
  }

  function pickFileForRow(): File | undefined {
    if (!currentRow) return undefined;
    const candidates = [
      slugify(currentRow.title_name || currentRow.name || "untitled"),
      (currentRow.title_name || currentRow.name || "untitled").toLowerCase().replace(/\.[^.]+$/, ""),
    ];
    for (const key of candidates) {
      const f = pdfMap.get(key);
      if (f) return f;
    }
    return undefined;
  }

  function navigateToRow(newIndex: number) {
    setCurrent(newIndex);
    clearPdfInput();
  }

  async function submitCurrent(pdfFile?: File) {
    if (!currentRow) return;

    const selectedFile = pdfFile || pdfInputRef.current?.files?.[0];
    if (!selectedFile) {
      setStatus((s) => ({ ...s, [current]: "❌ No PDF selected" }));
      return;
    }

    const idx = current;
    setIsUploading(true);
    setStatus((s) => ({ ...s, [idx]: "⏳ Uploading..." }));

    try {
      const form = new FormData();
      form.append("json", JSON.stringify(currentRow));
      form.append("pdf", selectedFile, selectedFile.name);

      const resp = await fetch("/api/records/add", { method: "POST", body: form });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "Upload failed");

      setStatus((s) => ({ ...s, [idx]: "✅ Successfully uploaded" }));

      if (autoAdvance && idx < rows.length - 1) {
        navigateToRow(idx + 1);
      } else {
        clearPdfInput();
      }
    } catch (e: any) {
      setStatus((s) => ({ ...s, [idx]: "❌ " + (e?.message || "Upload failed") }));
    } finally {
      setIsUploading(false);
    }
  }

  function skipCurrent() {
    setStatus((s) => ({ ...s, [current]: "⏭️ Skipped" }));
    if (current < rows.length - 1) {
      navigateToRow(current + 1);
    }
  }

  useEffect(() => {
    if (!autoMatch) return;
    // Attempt an auto-pick whenever row changes and we have a map
    if (currentRow) {
      const f = pickFileForRow();
      if (f && pdfInputRef.current) {
        // There's no safe way to programmatically set <input type=file> value
        // but we can show the guess in UI and call submit directly if auto-advance is on
      }
    }
  }, [current, pdfMap, autoMatch]);

  const getStatusColor = (statusText: string) => {
    if (statusText.includes("✅")) return "text-green-600";
    if (statusText.includes("❌")) return "text-red-600";
    if (statusText.includes("⏳")) return "text-blue-600";
    if (statusText.includes("⏭️")) return "text-gray-500";
    return "text-gray-700";
  };

  const getStatusBgColor = (statusText: string) => {
    if (statusText.includes("✅")) return "bg-green-50 border-green-200";
    if (statusText.includes("❌")) return "bg-red-50 border-red-200";
    if (statusText.includes("⏳")) return "bg-blue-50 border-blue-200";
    if (statusText.includes("⏭️")) return "bg-gray-50 border-gray-200";
    return "";
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Bulk Records Uploader</h1>
          <p className="text-gray-600 mb-6">Upload CSV data with corresponding PDF files for each record</p>

          {/* Step 1: CSV Upload */}
          <div className="mb-8">
            <div className="flex items-center mb-4">
              <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-semibold mr-3">
                1
              </div>
              <h2 className="text-xl font-semibold">Upload CSV File</h2>
            </div>
            <div className="ml-11">
              <input
                type="file"
                accept=".csv"
                onChange={(e) => e.target.files && parseCsv(e.target.files[0])}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              <p className="text-sm text-gray-500 mt-1">Select a CSV file containing your record data</p>
            </div>
          </div>

          {/* Bulk PDF Upload (commented out but improved) */}
          {/* <div className="mb-8">
            <div className="flex items-center mb-4">
              <div className="w-8 h-8 bg-gray-300 text-white rounded-full flex items-center justify-center text-sm font-semibold mr-3">
                2
              </div>
              <h2 className="text-xl font-semibold text-gray-400">Bulk PDF Upload (Optional)</h2>
            </div>
            <div className="ml-11">
              <input
                ref={multiPdfRef}
                type="file"
                accept="application/pdf"
                multiple
                onChange={onChoosePdfs}
                disabled
                className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-gray-100 file:text-gray-400"
              />
              <p className="text-sm text-gray-400 mt-1">Feature coming soon: Auto-match PDFs by filename</p>
            </div>
          </div> */}

          {/* Settings */}
          {rows.length > 0 && (
            <div className="border-t pt-6">
              <h3 className="font-semibold mb-3">Settings</h3>
              <div className="flex flex-wrap gap-4 mb-4">
                {/* <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={autoAdvance}
                    onChange={(e) => setAutoAdvance(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm">Auto-advance after successful upload</span>
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={autoMatch}
                    onChange={(e) => setAutoMatch(e.target.checked)}
                    disabled
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 opacity-50"
                  />
                  <span className="text-sm text-gray-400">Auto-match PDFs by slug (coming soon)</span>
                </label> */}
                <button className="ml-auto text-sm text-red-600 hover:text-red-800 underline" onClick={reset}>
                  Reset All
                </button>
              </div>

              {/* Progress Summary */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">
                    Progress: {current + 1} of {rows.length} records
                  </span>
                  <div className="flex gap-4">
                    <span className="text-green-600">✅ Completed: {completedCount}</span>
                    <span className="text-red-600">❌ Errors: {errorCount}</span>
                    <span className="text-gray-500">⏭️ Remaining: {rows.length - completedCount - errorCount}</span>
                  </div>
                </div>
                <div className="mt-2 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${((completedCount + errorCount) / rows.length) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Main Upload Interface */}
        {rows.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">
                Record {current + 1} of {rows.length}
              </h2>
              <div className="flex gap-2">
                <button
                  disabled={current === 0}
                  onClick={() => navigateToRow(current - 1)}
                  className="px-4 py-2 border rounded-lg disabled:bg-gray-50 disabled:text-gray-400 hover:bg-gray-50 transition-colors"
                >
                  ← Previous
                </button>
                <button
                  disabled={current === rows.length - 1}
                  onClick={() => navigateToRow(current + 1)}
                  className="px-4 py-2 border rounded-lg disabled:bg-gray-50 disabled:text-gray-400 hover:bg-gray-50 transition-colors"
                >
                  Next →
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* CSV Row Preview */}
              <div>
                <h3 className="font-semibold mb-4 text-lg">Record Data</h3>
                <div className="bg-gray-50 rounded-lg p-4 border">
                  <div className="space-y-3">
                    {Object.entries(currentRow || {}).map(([key, value]) => (
                      <div key={key} className="flex">
                        <div className="w-1/3 text-sm font-medium text-gray-600 pr-4 py-1">
                          {key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                        </div>
                        <div className="w-2/3 text-sm py-1 break-words">
                          {String(value) || <span className="text-gray-400 italic">Empty</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* PDF Upload */}
              <div>
                <h3 className="font-semibold mb-4 text-lg">Attach PDF Document</h3>
                <div className="space-y-4">
                  {/* <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div className="text-sm text-blue-700">
                      <strong>Suggested filename:</strong>{" "}
                      <code className="bg-blue-100 px-2 py-1 rounded">{currentSlug}.pdf</code>
                    </div>
                  </div> */}

                  <input
                    ref={pdfInputRef}
                    type="file"
                    accept="application/pdf"
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />

                  <div className="flex gap-3">
                    <button
                      className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
                      onClick={() => submitCurrent()}
                      disabled={isUploading}
                    >
                      {isUploading ? "⏳ Uploading..." : "✅ Upload Record"}
                    </button>
                    <button
                      className="px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      onClick={skipCurrent}
                      disabled={isUploading}
                    >
                      Skip
                    </button>
                  </div>

                  {/* Status for current row */}
                  {status[current] && (
                    <div className={`p-3 rounded-lg border ${getStatusBgColor(status[current])}`}>
                      <div className={`text-sm font-medium ${getStatusColor(status[current])}`}>{status[current]}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Progress Table */}
            <div className="mt-8">
              <h3 className="font-semibold mb-4 text-lg">All Records Status</h3>
              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-80 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="text-left p-3 font-medium text-gray-600">#</th>
                        <th className="text-left p-3 font-medium text-gray-600">Record Name</th>
                        <th className="text-left p-3 font-medium text-gray-600">Status</th>
                        <th className="text-left p-3 font-medium text-gray-600">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, index) => (
                        <tr
                          key={index}
                          className={`border-t hover:bg-gray-50 ${index === current ? "bg-blue-50 border-blue-200" : ""}`}
                        >
                          <td className="p-3 font-medium">{index + 1}</td>
                          <td className="p-3">
                            <div className="font-medium">{row.title_name || row.name || "Untitled"}</div>
                            <div className="text-xs text-gray-500">
                              {slugify(row.title_name || row.name || "untitled")}
                            </div>
                          </td>
                          <td className="p-3">
                            {status[index] ? (
                              <span className={`text-sm ${getStatusColor(status[index])}`}>{status[index]}</span>
                            ) : (
                              <span className="text-gray-400 text-sm">Pending</span>
                            )}
                          </td>
                          <td className="p-3">
                            <button
                              onClick={() => navigateToRow(index)}
                              className="text-blue-600 hover:text-blue-800 text-sm underline"
                            >
                              {index === current ? "Current" : "Go to"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {rows.length === 0 && (
          <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No CSV uploaded yet</h3>
            <p className="text-gray-600">Upload a CSV file to get started with bulk record uploading</p>
          </div>
        )}
      </div>
    </div>
  );
}
