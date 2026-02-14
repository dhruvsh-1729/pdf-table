import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";

type CompressionEvent = {
  type: "compression-start" | "compression-complete" | "storage-upload";
  attempt?: number;
  level?: string;
  bytes_before?: number;
  bytes_after?: number;
  bytes?: number;
  from_compression?: boolean;
  reason?: string;
  max_bytes?: number;
  status?: string;
  message?: string;
  timestamp?: string;
};

type OcrResult = {
  recordId: number;
  pdf_url: string;
  pdf_public_id: string;
  ocr_language?: string;
  ocr_languages?: string[];
  source_url?: string;
  extracted_text?: string;
  text_extraction_error?: string;
  compression_events?: CompressionEvent[];
};

const OCR_LANGUAGE_OPTIONS = [
  { value: "eng", label: "English (eng)" },
  { value: "hin", label: "Hindi (hin)" },
  { value: "sans", label: "Sanskrit (sans)" },
  { value: "guj", label: "Gujarati (guj)" },
] as const;

const formatBytes = (bytes?: number) => {
  if (!bytes && bytes !== 0) return "unknown size";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
};

export default function OcrTool() {
  const [recordId, setRecordId] = useState("");
  const [deleteOld, setDeleteOld] = useState(false);
  const [keepExtractedText, setKeepExtractedText] = useState(false);
  const [ocrLanguage, setOcrLanguage] = useState<(typeof OCR_LANGUAGE_OPTIONS)[number]["value"]>("eng");
  const [loading, setLoading] = useState(false);
  const [removingWatermark, setRemovingWatermark] = useState(false);
  const [checkingPdf, setCheckingPdf] = useState(false);
  const [result, setResult] = useState<OcrResult | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const resolvedViewerUrl = useMemo(() => {
    if (!result?.pdf_url) return null;
    if (result.pdf_url.startsWith("http")) return result.pdf_url;
    if (typeof window !== "undefined") {
      try {
        return new URL(result.pdf_url, window.location.origin).toString();
      } catch {
        return result.pdf_url;
      }
    }
    return result.pdf_url;
  }, [result?.pdf_url]);

  const validateRecordId = () => {
    const idNum = Number(recordId);
    if (!Number.isFinite(idNum)) {
      toast.error("Please enter a valid numeric record ID.");
      return null;
    }
    return idNum;
  };

  const notifyCompressionEvents = (events?: CompressionEvent[]) => {
    if (!events?.length) return;

    events.forEach((event) => {
      if (event.type === "compression-start") {
        const attemptLabel = event.attempt ? ` (attempt ${event.attempt})` : "";
        const levelLabel = event.level ? ` [${event.level}]` : "";
        const reasonText =
          event.reason === "max-bytes" ? "File exceeds the size limit" : "Upload size limit hit";
        const limitText = event.max_bytes ? ` (${formatBytes(event.max_bytes)} limit)` : "";
        const tail = event.reason === "max-bytes" ? "..." : " before retrying...";
        toast.info(`${reasonText}${limitText}. Compressing${levelLabel}${attemptLabel}${tail}`);
      } else if (event.type === "compression-complete") {
        const levelLabel = event.level ? ` (${event.level})` : "";
        const attemptLabel = event.attempt ? `Attempt ${event.attempt}` : "Compression";
        const sizeText =
          event.bytes_before !== undefined && event.bytes_after !== undefined
            ? `${formatBytes(event.bytes_before)} → ${formatBytes(event.bytes_after)}`
            : "finished";
        toast.success(`${attemptLabel}${levelLabel}: ${sizeText}. Retrying upload...`);
      } else if (event.type === "storage-upload" && event.status === "success" && event.from_compression) {
        toast.success("Upload succeeded after compressing the PDF.");
      }
    });
  };

  const handleCheckPdf = async () => {
    const idNum = validateRecordId();
    if (idNum === null) return;

    setCheckingPdf(true);
    setLastError(null);
    setResult(null);

    try {
      const params = new URLSearchParams({
        page: "0",
        pageSize: "1",
        sortBy: "id",
        sortOrder: "desc",
        filters: JSON.stringify({ id: idNum }),
        noCache: "true",
      });

      const resp = await fetch(`/api/records-paginated?${params.toString()}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "Failed to fetch record.");

      const record = data?.data?.[0];
      if (!record) throw new Error("No record found with that ID.");

      const derivedPdfUrl =
        record.pdf_url || (record.pdf_public_id ? `/api/pdf/view?id=${encodeURIComponent(record.pdf_public_id)}` : "");
      if (!derivedPdfUrl) throw new Error("This record does not have a PDF to display.");

      setResult({
        recordId: record.id,
        pdf_url: derivedPdfUrl,
        pdf_public_id: record.pdf_public_id || "",
        source_url: record.source_url,
      });
      toast.success("Loaded current PDF.");
    } catch (error: any) {
      const message = error?.message || "Failed to fetch the current PDF.";
      setLastError(message);
      toast.error(message);
    } finally {
      setCheckingPdf(false);
    }
  };

  const handleRemoveWatermark = async () => {
    const idNum = validateRecordId();
    if (idNum === null) return;

    setRemovingWatermark(true);
    setResult(null);
    setLastError(null);

    try {
      const resp = await fetch("/api/records/watermark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: idNum }),
      });

      const data: OcrResult & { error?: string } = await resp.json();
      if (!resp.ok) {
        const err: any = new Error(data?.error || "Failed to remove watermark.");
        err.compression_events = (data as any)?.compression_events;
        throw err;
      }

      notifyCompressionEvents(data?.compression_events);
      setResult(data as OcrResult);
      toast.success("Watermark removed and PDF updated.");
    } catch (error: any) {
      const compressionEvents = error?.compression_events || error?.compressionEvents;
      if (compressionEvents) notifyCompressionEvents(compressionEvents);
      const message = error?.message || "Failed to remove watermark.";
      setLastError(message);
      toast.error(message);
    } finally {
      setRemovingWatermark(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const idNum = validateRecordId();
    if (idNum === null) return;

    setLoading(true);
    setResult(null);
    setLastError(null);

    try {
      const resp = await fetch("/api/records/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: idNum,
          deleteOld,
          keepExtractedText,
          ocrLanguage,
        }),
      });

      const data: OcrResult & { error?: string } = await resp.json();
      if (!resp.ok) {
        const err: any = new Error(data?.error || "Failed to OCR this record.");
        err.compression_events = (data as any)?.compression_events;
        throw err;
      }

      notifyCompressionEvents(data?.compression_events);
      setResult(data as OcrResult);
      toast.success("OCR complete and uploaded to UploadThing.");
      if ((data as OcrResult)?.extracted_text) {
        toast.success("Text extracted and saved to this record.");
      } else if ((data as OcrResult)?.text_extraction_error) {
        toast.warning("OCR done, but text extraction failed — check logs.");
      }
    } catch (error: any) {
      const compressionEvents = error?.compression_events || error?.compressionEvents;
      if (compressionEvents) notifyCompressionEvents(compressionEvents);
      const message = error?.message || "Failed to process OCR.";
      setLastError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 text-slate-900">
      <Toaster position="top-right" />
      <main className="mx-auto flex w-full flex-col gap-6 px-4 py-10">
        <div className="space-y-2 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">OCR Utility</p>
          <h1 className="text-3xl font-semibold text-slate-900">Run iLovePDF OCR for a record</h1>
          <p className="text-sm text-slate-600">
            Fetch the current PDF, OCR it via iLovePDF, upload the new PDF to UploadThing, and
            update the record.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Record OCR Runner</CardTitle>
              <CardDescription>
                Requires Supabase service key, UploadThing token, and iLovePDF keys in env.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form className="space-y-4" onSubmit={handleSubmit}>
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-800">Record ID</span>
                  <Input
                    type="number"
                    value={recordId}
                    onChange={(e) => setRecordId(e.target.value)}
                    placeholder="e.g. 123"
                    required
                    min={1}
                />
              </label>

              <div className="flex flex-col gap-3 rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                <label className="space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">OCR language</span>
                  <select
                    value={ocrLanguage}
                    onChange={(e) => setOcrLanguage(e.target.value as (typeof OCR_LANGUAGE_OPTIONS)[number]["value"])}
                    className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                  >
                    {OCR_LANGUAGE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                      checked={deleteOld}
                      onChange={(e) => setDeleteOld(e.target.checked)}
                    />
                    Delete old UploadThing file if the key changes
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                      checked={keepExtractedText}
                      onChange={(e) => setKeepExtractedText(e.target.checked)}
                  />
                  Keep existing extracted text (do not null it out)
                </label>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  type="button"
                  disabled={loading || checkingPdf || removingWatermark}
                  onClick={handleCheckPdf}
                  className="w-full sm:w-auto"
                >
                  {checkingPdf ? "Checking PDF..." : "Check PDF for this record"}
                </Button>
                <Button
                  type="button"
                  disabled={loading || checkingPdf || removingWatermark}
                  onClick={handleRemoveWatermark}
                  className="w-full sm:w-auto"
                  variant="outline"
                >
                  {removingWatermark ? "Removing watermark..." : "Remove watermark"}
                </Button>
                <Button type="submit" disabled={loading || checkingPdf} className="w-full sm:w-auto">
                  {loading ? "Running OCR..." : "Run OCR"}
                </Button>
              </div>
            </form>

            {lastError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {lastError}
                </div>
              )}

              {result && (
                <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  <div className="font-semibold text-emerald-900">Record {result.recordId}</div>
                  {result.extracted_text && (
                    <div className="text-emerald-700">
                      Extracted text saved ({result.extracted_text.length.toLocaleString()} chars)
                    </div>
                  )}
                  {!result.extracted_text && result.text_extraction_error && (
                    <div className="text-amber-800">
                      Text extraction failed: <span className="font-medium">{result.text_extraction_error}</span>
                    </div>
                  )}
                  {result.source_url && (
                    <div className="text-emerald-700">
                      Source:{" "}
                      <a
                        href={result.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-900 underline"
                      >
                        {result.source_url}
                      </a>
                    </div>
                  )}
                  {(result.ocr_language || result.ocr_languages?.length) && (
                    <div>OCR language: {result.ocr_language || result.ocr_languages?.join(", ")}</div>
                  )}
                  <div>UploadThing key: {result.pdf_public_id}</div>
                  {resolvedViewerUrl && (
                    <div>
                      Viewer URL:{" "}
                      <a href={resolvedViewerUrl} target="_blank" rel="noreferrer" className="font-medium underline">
                        {resolvedViewerUrl}
                      </a>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
            <CardFooter className="text-xs text-slate-500">
              Tip: to run outside the UI, use{" "}
              <code className="bg-slate-100 px-1 py-0.5">node scripts/ocr-ilovepdf.mjs --id=123</code>
            </CardFooter>
          </Card>

          <Card className="h-full">
            <CardHeader>
              <CardTitle>PDF Preview</CardTitle>
              <CardDescription>Shows the fetched PDF on submit. Content scrolls within the frame.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!result && (
                <div className="flex h-[640px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-center text-sm text-slate-500">
                  Submit a record ID to preview its PDF here.
                </div>
              )}

              {result && !resolvedViewerUrl && (
                <div className="flex h-[640px] items-center justify-center rounded-lg border border-amber-200 bg-amber-50 px-4 text-center text-sm text-amber-800">
                  No PDF URL was returned for this record.
                </div>
              )}

              {resolvedViewerUrl && (
                <div className="overflow-hidden rounded-lg border border-slate-200 shadow-inner">
                  <iframe
                    title={`PDF preview for record ${result?.recordId ?? ""}`}
                    src={resolvedViewerUrl}
                    className="h-[640px] w-full"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
