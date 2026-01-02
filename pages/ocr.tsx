import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";

type OcrResult = {
  recordId: number;
  pdf_url: string;
  pdf_public_id: string;
  source_url?: string;
};

export default function OcrTool() {
  const [recordId, setRecordId] = useState("");
  const [deleteOld, setDeleteOld] = useState(false);
  const [keepExtractedText, setKeepExtractedText] = useState(false);
  const [loading, setLoading] = useState(false);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const idNum = Number(recordId);
    if (!Number.isFinite(idNum)) {
      toast.error("Please enter a valid numeric record ID.");
      return;
    }

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
        }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data?.error || "Failed to OCR this record.");
      }

      setResult(data as OcrResult);
      toast.success("OCR complete and uploaded to Cloudinary.");
    } catch (error: any) {
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
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
        <div className="space-y-2 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">OCR Utility</p>
          <h1 className="text-3xl font-semibold text-slate-900">Run iLovePDF OCR for a record</h1>
          <p className="text-sm text-slate-600">
            Fetch the current PDF from Supabase/Cloudinary, OCR it via iLovePDF, upload the new PDF to Cloudinary, and
            update the record.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Record OCR Runner</CardTitle>
            <CardDescription>Requires Supabase service key, Cloudinary keys, and iLovePDF keys in env.</CardDescription>
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
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                    checked={deleteOld}
                    onChange={(e) => setDeleteOld(e.target.checked)}
                  />
                  Delete old Cloudinary asset if the public ID changes
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

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Running OCR..." : "Run OCR"}
              </Button>
            </form>

            {lastError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {lastError}
              </div>
            )}

            {result && (
              <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <div className="font-semibold text-emerald-900">Updated record {result.recordId}</div>
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
                <div>Cloudinary ID: {result.pdf_public_id}</div>
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
            Tip: to run outside the UI, use <code className="bg-slate-100 px-1 py-0.5">node scripts/ocr-ilovepdf.mjs --id=123</code>
          </CardFooter>
        </Card>
      </main>
    </div>
  );
}
