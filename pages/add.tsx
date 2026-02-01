import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import dynamic from "next/dynamic";
import { PDFDocument, degrees } from "pdf-lib";
import JSZip from "jszip";
import AsyncCreatableSelect from "react-select/async-creatable";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eye,
  FileText,
  Loader2,
  Plus,
  RotateCcw,
  RotateCw,
  Scissors,
  Trash2,
  Upload,
  X,
  RefreshCw,
  Repeat2,
  CheckCircle2,
  AlertTriangle,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import type { User } from "../types";

type FieldKey =
  | "name"
  | "volume"
  | "number"
  | "timestamp"
  | "title_name"
  | "page_numbers"
  | "summary"
  | "conclusion"
  | "tags"
  | "authors";

type FieldState<T> = {
  value: T;
  status: "idle" | "loading" | "ready" | "error";
  error?: string;
};

type SplitRecord = {
  id: string;
  sectionIndex: number;
  fileName: string;
  pages: number[];
  blob: Blob;
  objectUrl: string;
  extraction: {
    status: "idle" | "running" | "done" | "error";
    text?: string;
    error?: string;
    language?: string | null;
  };
  fields: Record<FieldKey, FieldState<string | string[]>>;
  saving: "idle" | "saving" | "saved" | "error";
  recordId?: number;
  saveError?: string | null;
};

const buildInitialFields = (pageRange: string): Record<FieldKey, FieldState<string | string[]>> => ({
  name: { value: "", status: "idle" },
  volume: { value: "", status: "idle" },
  number: { value: "", status: "idle" },
  timestamp: { value: "", status: "idle" },
  title_name: { value: "", status: "idle" },
  page_numbers: { value: pageRange, status: pageRange ? "ready" : "idle" },
  summary: { value: "", status: "idle" },
  conclusion: { value: "", status: "idle" },
  tags: { value: [], status: "idle" },
  authors: { value: [], status: "idle" },
});

function Add() {
  const [isClient, setIsClient] = useState(false);
  const [reactPdf, setReactPdf] = useState<{ Document: any; Page: any } | null>(null);
  const [user, setUser] = useState<User | null>(null);

  // PDF split state (step 1)
  const [file, setFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageOrder, setPageOrder] = useState<number[]>([]);
  const [rotations, setRotations] = useState<Record<number, number>>({});
  const [splitIndices, setSplitIndices] = useState<Set<number>>(new Set());
  const [autoSplitEnabled, setAutoSplitEnabled] = useState(false);
  const [autoSplitInterval, setAutoSplitInterval] = useState(1);
  const [skippedSections, setSkippedSections] = useState<Set<number>>(new Set());
  const [previewPosition, setPreviewPosition] = useState<number | null>(null);
  const [generatingSplits, setGeneratingSplits] = useState(false);

  // Step 2 state
  const [splitRecords, setSplitRecords] = useState<SplitRecord[]>([]);
  const splitRecordsRef = useRef<SplitRecord[]>([]);
  const [savingAll, setSavingAll] = useState(false);
  const [removingWatermark, setRemovingWatermark] = useState(false);
  const [hoverPreview, setHoverPreview] = useState<{ pageNumber: number; rotation: number } | null>(null);
  const [commonName, setCommonName] = useState("");
  const [commonVolume, setCommonVolume] = useState("");
  const [commonNumber, setCommonNumber] = useState("");
  const [commonTimestamp, setCommonTimestamp] = useState("");
  const DocumentComp = reactPdf?.Document;
  const PageComp = reactPdf?.Page;

  useEffect(() => {
    splitRecordsRef.current = splitRecords;
  }, [splitRecords]);

  useEffect(() => {
    return () => {
      splitRecordsRef.current.forEach((split) => split.objectUrl && URL.revokeObjectURL(split.objectUrl));
    };
  }, []);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient) return;
    let mounted = true;
    import("react-pdf")
      .then((mod) => {
        if (!mounted) return;
        try {
          const cdnWorker = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${mod.pdfjs.version}/pdf.worker.min.js`;
          mod.pdfjs.GlobalWorkerOptions.workerSrc = cdnWorker;
        } catch (err) {
          console.error("Failed to set pdf.js worker source", err);
        }
        setReactPdf({ Document: mod.Document, Page: mod.Page });
      })
      .catch((err) => {
        console.error("Failed to load react-pdf", err);
      });
    return () => {
      mounted = false;
    };
  }, [isClient]);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("user") : null;
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        // ignore parse errors
      }
    }
  }, []);

  const loadMagazineOptions = useCallback(async (inputValue: string) => {
    try {
      const response = await fetch(`/api/magazine-names?q=${encodeURIComponent(inputValue || "")}`);
      if (!response.ok) throw new Error("Failed to fetch magazine names");
      const data = await response.json();
      return (data || []).map((name: string) => ({ label: name, value: name }));
    } catch (error) {
      console.error("Error loading magazine names:", error);
      return [];
    }
  }, []);

  const sections = useMemo(() => {
    if (!pageOrder.length) return [] as number[][];
    if (autoSplitEnabled && autoSplitInterval > 0) {
      const computed: number[][] = [];
      for (let i = 0; i < pageOrder.length; i += autoSplitInterval) {
        computed.push(pageOrder.slice(i, i + autoSplitInterval));
      }
      return computed;
    }
    const sortedPositions = Array.from(splitIndices).sort((a, b) => a - b);
    const computed: number[][] = [];
    let start = 0;
    for (const pos of sortedPositions) {
      const end = Math.min(pos, pageOrder.length - 1);
      if (end >= start) {
        computed.push(pageOrder.slice(start, end + 1));
        start = end + 1;
      }
    }
    computed.push(pageOrder.slice(start));
    return computed;
  }, [pageOrder, autoSplitEnabled, autoSplitInterval, splitIndices]);

  const sectionMeta = useMemo(() => {
    const meta: { start: number; end: number; length: number }[] = [];
    let cursor = 0;
    sections.forEach((section) => {
      const start = cursor;
      const length = section.length;
      const end = cursor + Math.max(length - 1, 0);
      meta.push({ start, end, length });
      cursor += length;
    });
    return meta;
  }, [sections]);

  const applyCommonFields = useCallback(
    (split: SplitRecord) => {
      const name = commonName.trim();
      const volume = commonVolume.trim();
      const number = commonNumber.trim();
      const timestamp = commonTimestamp.trim();
      const statusFor = (val: string): FieldState<string>["status"] => (val ? "ready" : "idle");
      return {
        ...split,
        fields: {
          ...split.fields,
          name: { value: name, status: statusFor(name) },
          volume: { value: volume, status: statusFor(volume) },
          number: { value: number, status: statusFor(number) },
          timestamp: { value: timestamp, status: statusFor(timestamp) },
        },
      };
    },
    [commonName, commonVolume, commonNumber, commonTimestamp],
  );

  const resetSkips = useCallback(() => setSkippedSections(new Set()), []);

  const resetSplits = useCallback(() => {
    setSplitRecords((prev) => {
      prev.forEach((split) => split.objectUrl && URL.revokeObjectURL(split.objectUrl));
      return [];
    });
    setSavingAll(false);
  }, []);

  useEffect(() => {
    if (!splitRecords.length) return;
    setSplitRecords((prev) => prev.map((split) => applyCommonFields(split)));
  }, [applyCommonFields, splitRecords.length]);

  const onDocumentLoadSuccess = useCallback(
    ({ numPages: nextNumPages }: { numPages: number }) => {
      setNumPages(nextNumPages);
      setPageOrder(Array.from(Array(nextNumPages).keys()));
      setRotations({});
      setSplitIndices(new Set());
      setSkippedSections(new Set());
      resetSplits();
    },
    [resetSplits],
  );

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] || null;
    if (selected) {
      setFile(selected);
      resetSplits();
    }
  };

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
    setSkippedSections(new Set());
    resetSplits();
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
    setSkippedSections(new Set());
    resetSplits();
  };

  const toggleSplit = (position: number) => {
    setSplitIndices((prev) => {
      const newSet = new Set(Array.from(prev));
      if (newSet.has(position)) {
        newSet.delete(position);
      } else {
        newSet.add(position);
      }
      return newSet;
    });
    setSkippedSections(new Set());
    resetSplits();
  };

  const previewContext =
    previewPosition !== null && previewPosition >= 0 && previewPosition < pageOrder.length && file
      ? (() => {
          const logicalIndex = pageOrder[previewPosition];
          const occurrence = pageOrder.slice(0, previewPosition + 1).filter((idx) => idx === logicalIndex).length;
          const totalOccurrences = pageOrder.filter((idx) => idx === logicalIndex).length;
          return { logicalIndex, occurrence, totalOccurrences };
        })()
      : null;

  useEffect(() => {
    if (previewPosition === null) return;
    if (!file || previewPosition < 0 || previewPosition >= pageOrder.length) {
      setPreviewPosition(null);
    }
  }, [file, pageOrder, previewPosition]);

  const runFieldGeneration = useCallback(
    async (splitId: string, field: FieldKey, providedText?: string, variant: "primary" | "regen" = "primary") => {
      const split = splitRecordsRef.current.find((s) => s.id === splitId);
      const text = providedText ?? split?.extraction.text ?? "";
      if (!split || !text) {
        toast.error("Extract text before running AI.");
        return;
      }

      setSplitRecords((prev) =>
        prev.map((s) =>
          s.id === splitId
            ? {
                ...s,
                fields: {
                  ...s.fields,
                  [field]: { ...s.fields[field], status: "loading", error: undefined },
                },
              }
            : s,
        ),
      );

      try {
        const response = await fetch("/api/ai/split-fields", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, field, label: split.fileName, variant }),
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "AI generation failed.");
        }

        const value =
          field === "tags"
            ? (payload.tags as string[])
            : field === "authors"
              ? (payload.authors as string[])
              : (payload.value as string);

        setSplitRecords((prev) =>
          prev.map((s) =>
            s.id === splitId
              ? {
                  ...s,
                  fields: {
                    ...s.fields,
                    [field]: {
                      value: field === "tags" || field === "authors" ? value || [] : value || "",
                      status: "ready",
                    },
                  },
                }
              : s,
          ),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "AI generation failed.";
        setSplitRecords((prev) =>
          prev.map((s) =>
            s.id === splitId
              ? { ...s, fields: { ...s.fields, [field]: { ...s.fields[field], status: "error", error: message } } }
              : s,
          ),
        );
        toast.error(message);
      }
    },
    [],
  );

  const runInitialAi = useCallback(
    async (splitId: string, text: string, label?: string) => {
      const order: FieldKey[] = ["title_name", "summary", "conclusion", "authors", "tags"];
      for (const field of order) {
        await runFieldGeneration(splitId, field, text, "primary");
      }
      toast.success(`AI drafted metadata for ${label || "split"}.`);
    },
    [runFieldGeneration],
  );

  const runExtraction = useCallback(
    async (split: SplitRecord) => {
      if (!split.blob) {
        toast.error("Split PDF missing.");
        return;
      }

      setSplitRecords((prev) =>
        prev.map((s) =>
          s.id === split.id ? { ...s, extraction: { ...s.extraction, status: "running", error: undefined } } : s,
        ),
      );

      try {
        const formData = new FormData();
        formData.append("pdf", new File([split.blob], split.fileName, { type: "application/pdf" }));
        formData.append("allowOcr", "false");

        const response = await fetch("/api/extract-text-file", { method: "POST", body: formData });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Failed to extract text.");

        const extractedText = typeof payload.text === "string" ? payload.text.trim() : "";
        setSplitRecords((prev) =>
          prev.map((s) =>
            s.id === split.id
              ? {
                  ...s,
                  extraction: {
                    status: "done",
                    text: extractedText,
                    error: undefined,
                    language: payload.language || null,
                  },
                }
              : s,
          ),
        );

        if (!extractedText) {
          toast.warning("No extractable text found (OCR is disabled for uploads).");
          return;
        }

        await runInitialAi(split.id, extractedText, split.fileName);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Text extraction failed.";
        setSplitRecords((prev) =>
          prev.map((s) =>
            s.id === split.id ? { ...s, extraction: { status: "error", error: message, text: s.extraction.text } } : s,
          ),
        );
        toast.error(message);
      }
    },
    [runInitialAi],
  );

  const generateSplits = useCallback(
    async (opts?: { downloadZip?: boolean }) => {
      if (!file) {
        toast.error("Upload a PDF to start splitting.");
        return;
      }

      setGeneratingSplits(true);
      try {
        const arrayBuffer = await file.arrayBuffer();
        const originalPdf = await PDFDocument.load(arrayBuffer);
        const activeSections = sections
          .map((pages, idx) => ({ pages, idx }))
          .filter(({ idx }) => !skippedSections.has(idx));

        if (!activeSections.length) {
          toast.error("No splits to process. Add cuts or disable removals.");
          return;
        }

        const baseName = file.name.replace(/\.pdf$/i, "") || "split";
        const zip = opts?.downloadZip ? new JSZip() : null;
        const next: SplitRecord[] = [];

        for (let i = 0; i < activeSections.length; i++) {
          const { pages, idx } = activeSections[i];
          const newPdf = await PDFDocument.create();
          for (const logicalIdx of pages) {
            const [copiedPage] = await newPdf.copyPages(originalPdf, [logicalIdx]);
            const rotation = rotations[logicalIdx] || 0;
            if (rotation) copiedPage.setRotation(degrees(rotation));
            newPdf.addPage(copiedPage);
          }
          const pdfBytes = await newPdf.save();
          const blob = new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" });
          const objectUrl = URL.createObjectURL(blob);
          const sectionNumber = next.length + 1;
          const paddedIndex = String(sectionNumber).padStart(3, "0");
          const fileName = `${baseName}_split_${paddedIndex}.pdf`;
          if (zip) zip.file(fileName, pdfBytes);

          const pageNumbers = pages.map((p) => p + 1);
          const rangeLabel =
            pageNumbers.length > 1
              ? `${pageNumbers[0]}-${pageNumbers[pageNumbers.length - 1]}`
              : pageNumbers[0]?.toString() || "";

          next.push({
            id: `${Date.now()}-${i}-${Math.random().toString(16).slice(2)}`,
            sectionIndex: sectionNumber,
            fileName,
            pages: pageNumbers,
            blob,
            objectUrl,
            extraction: { status: "idle", language: null },
            fields: buildInitialFields(rangeLabel),
            saving: "idle",
          });
        }

        setSplitRecords((prev) => {
          prev.forEach((split) => split.objectUrl && URL.revokeObjectURL(split.objectUrl));
          return next.map((split) => applyCommonFields(split));
        });

        toast.success(`Created ${next.length} split${next.length === 1 ? "" : "s"}. Starting extraction...`);

        for (const split of next) {
          // Run sequentially to avoid hammering the API

          await runExtraction(split);
        }

        if (zip) {
          const zipBlob = await zip.generateAsync({ type: "blob" });
          const url = URL.createObjectURL(zipBlob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `${baseName}_splits.zip`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error generating splits.";
        toast.error(message);
      } finally {
        setGeneratingSplits(false);
      }
    },
    [file, sections, skippedSections, rotations, runExtraction, applyCommonFields],
  );

  const setFieldValue = (splitId: string, field: FieldKey, value: string | string[]) => {
    setSplitRecords((prev) =>
      prev.map((s) => (s.id === splitId ? { ...s, fields: { ...s.fields, [field]: { value, status: "ready" } } } : s)),
    );
  };

  const saveRecord = useCallback(
    async (splitId: string) => {
      const split = splitRecordsRef.current.find((s) => s.id === splitId);
      if (!split) return;
      const fields = split.fields;
      const name = commonName.trim();
      if (!name) {
        toast.error("Magazine name is required before saving.");
        return;
      }
      if (!split.blob) {
        toast.error("Split PDF blob is missing.");
        return;
      }

      setSplitRecords((prev) => prev.map((s) => (s.id === split.id ? { ...s, saving: "saving", saveError: null } : s)));

      try {
        const formData = new FormData();
        const jsonPayload = {
          name,
          volume: commonVolume.trim() || null,
          number: commonNumber.trim() || null,
          timestamp: commonTimestamp.trim() || null,
          title_name: (fields.title_name.value as string) || null,
          page_numbers: (fields.page_numbers.value as string) || null,
          summary: (fields.summary.value as string) || null,
          conclusion: (fields.conclusion.value as string) || null,
          authors:
            Array.isArray(fields.authors.value) && fields.authors.value.length
              ? (fields.authors.value as string[]).join(", ")
              : null,
          language: split.extraction.language || null,
          email: user?.email || null,
          creator_name: user?.name || null,
          extracted_text: split.extraction.text || null,
        };

        formData.append("json", JSON.stringify(jsonPayload));
        formData.append("pdf", new File([split.blob], split.fileName, { type: "application/pdf" }));

        const response = await fetch("/api/upload", { method: "POST", body: formData });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Failed to save record.");

        const recordId = payload?.record?.id || payload?.id || null;

        const tags = Array.isArray(fields.tags.value)
          ? (fields.tags.value as string[]).map((t) => t.trim()).filter(Boolean)
          : [];

        if (recordId && tags.length) {
          const resolvedTagIds: number[] = [];
          for (const tag of tags) {
            const createResp = await fetch("/api/tags", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: tag }),
            });

            if (createResp.status === 409) {
              const lookup = await fetch(`/api/tags?q=${encodeURIComponent(tag)}`);
              const lookupData = await lookup.json();
              const match = Array.isArray(lookupData)
                ? lookupData.find((t: any) => (t.name || "").toLowerCase() === tag.toLowerCase())
                : null;
              if (match?.id) resolvedTagIds.push(match.id);
            } else if (createResp.ok) {
              const tagPayload = await createResp.json();
              if (tagPayload?.id) resolvedTagIds.push(tagPayload.id);
            }
          }

          if (resolvedTagIds.length) {
            const tagResp = await fetch("/api/record-tags", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ recordId, tagIds: resolvedTagIds }),
            });
            if (!tagResp.ok) {
              const tagPayload = await tagResp.json();
              throw new Error(tagPayload?.error || "Failed to attach tags to record.");
            }
          }
        }

        const authorsList = Array.isArray(fields.authors.value)
          ? (fields.authors.value as string[])
              .map((a) => a.trim())
              .filter(Boolean)
              .filter((a, idx, arr) => arr.findIndex((b) => b.toLowerCase() === a.toLowerCase()) === idx)
          : [];

        if (recordId && authorsList.length) {
          const resolvedAuthorIds: number[] = [];
          for (const author of authorsList) {
            const createResp = await fetch("/api/authors", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: author }),
            });

            if (createResp.status === 409) {
              const lookup = await fetch(`/api/authors?q=${encodeURIComponent(author)}`);
              const lookupData = await lookup.json();
              const match = Array.isArray(lookupData)
                ? lookupData.find((a: any) => (a.name || "").toLowerCase() === author.toLowerCase())
                : null;
              if (match?.id) resolvedAuthorIds.push(match.id);
            } else if (createResp.ok) {
              const authorPayload = await createResp.json();
              if (authorPayload?.id) resolvedAuthorIds.push(authorPayload.id);
            }
          }

          if (resolvedAuthorIds.length) {
            const authorResp = await fetch("/api/record-authors", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ recordId, authorIds: resolvedAuthorIds }),
            });
            if (!authorResp.ok) {
              const authorPayload = await authorResp.json();
              throw new Error(authorPayload?.error || "Failed to attach authors to record.");
            }
          }
        }

        setSplitRecords((prev) =>
          prev.map((s) => (s.id === split.id ? { ...s, saving: "saved", recordId: recordId || undefined } : s)),
        );
        toast.success(`Saved split ${split.sectionIndex} to Supabase${recordId ? ` (ID ${recordId})` : ""}.`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to save record.";
        setSplitRecords((prev) =>
          prev.map((s) => (s.id === split.id ? { ...s, saving: "error", saveError: message } : s)),
        );
        toast.error(message);
      }
    },
    [user, commonName, commonVolume, commonNumber, commonTimestamp],
  );

  const saveAllRecords = useCallback(async () => {
    setSavingAll(true);
    for (const split of splitRecordsRef.current) {
      if (split.saving === "saved") continue;

      await saveRecord(split.id);
    }
    setSavingAll(false);
  }, [saveRecord]);

  const removeWatermarkForAll = useCallback(async () => {
    if (removingWatermark) return;
    const currentSplits = [...splitRecordsRef.current].sort((a, b) => a.sectionIndex - b.sectionIndex);
    if (!currentSplits.length) {
      toast.error("No split PDFs available to clean.");
      return;
    }

    setRemovingWatermark(true);
    try {
      const mergedPdf = await PDFDocument.create();
      for (const split of currentSplits) {
        if (!split.blob) throw new Error("One or more split PDFs are missing.");
        const bytes = await split.blob.arrayBuffer();
        const pdf = await PDFDocument.load(bytes);
        const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        pages.forEach((p) => mergedPdf.addPage(p));
      }

      const mergedBytes = await mergedPdf.save();
      const baseName = (file?.name || "merged").replace(/\.pdf$/i, "") || "merged";
      const mergedFilename = `${baseName}-merged.pdf`;

      const formData = new FormData();
      const mergedBlob = new Blob([mergedBytes.buffer as ArrayBuffer], { type: "application/pdf" });
      formData.append("pdf", mergedBlob, mergedFilename);

      const response = await fetch("/api/pdf/remove-watermark", { method: "POST", body: formData });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Watermark removal failed.");

      const cleanedUrl = payload.cleaned_url as string | undefined;
      if (!cleanedUrl) throw new Error("No cleaned PDF URL returned.");

      const cleanedResp = await fetch(cleanedUrl);
      if (!cleanedResp.ok) {
        throw new Error(`Failed to download cleaned PDF (status ${cleanedResp.status}).`);
      }
      const cleanedBytes = await cleanedResp.arrayBuffer();
      const cleanedPdf = await PDFDocument.load(cleanedBytes);

      const expectedPages = currentSplits.reduce((sum, split) => sum + (split.pages?.length || 0), 0);
      if (cleanedPdf.getPageCount() < expectedPages) {
        throw new Error(`Cleaned PDF has ${cleanedPdf.getPageCount()} pages but ${expectedPages} were expected.`);
      }

      let cursor = 0;
      const next: SplitRecord[] = [];
      for (const split of currentSplits) {
        const count = split.pages?.length || 0;
        const pageIndices = Array.from({ length: count }, (_, i) => cursor + i);
        const newPdf = await PDFDocument.create();
        const copied = await newPdf.copyPages(cleanedPdf, pageIndices);
        copied.forEach((p) => newPdf.addPage(p));
        const bytes = await newPdf.save();
        const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
        const objectUrl = URL.createObjectURL(blob);
        next.push({ ...split, blob, objectUrl });
        cursor += count;
      }

      setSplitRecords((prev) => {
        prev.forEach((split) => split.objectUrl && URL.revokeObjectURL(split.objectUrl));
        return next;
      });

      toast.success("Watermark removed. Splits refreshed with cleaned PDFs.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Watermark removal failed.";
      toast.error(message);
    } finally {
      setRemovingWatermark(false);
    }
  }, [file, removingWatermark]);

  const extractionInProgress = splitRecords.some((s) => s.extraction.status === "running");
  const aiBusy = splitRecords.some((s) => Object.values(s.fields).some((f) => f.status === "loading"));

  return (
    <div className="min-h-screen bg-zinc-50">
      <Toaster position="top-right" />
      <div className="mx-auto w-full space-y-10 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">Step 1</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-2xl font-semibold text-zinc-900">Split PDF into sections</h1>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => generateSplits({ downloadZip: false })}
                disabled={!file || sections.length === 0 || generatingSplits}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-900 bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-zinc-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {generatingSplits ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
                <span>{generatingSplits ? "Working..." : "Generate splits & start AI"}</span>
              </button>
              <button
                onClick={() => generateSplits({ downloadZip: true })}
                disabled={!file || sections.length === 0 || generatingSplits}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 shadow-sm transition-all hover:border-zinc-300 hover:bg-zinc-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download className="h-4 w-4" />
                <span>Also download ZIP</span>
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
              {file && isClient && DocumentComp && PageComp ? (
                <DocumentComp
                  file={file}
                  onLoadSuccess={({ numPages }: { numPages: number }) => {
                    setSkippedSections(new Set());
                    onDocumentLoadSuccess({ numPages });
                  }}
                  loading={
                    <div className="flex flex-col items-center justify-center gap-4 p-12">
                      <Loader2 className="h-10 w-10 animate-spin text-zinc-900" />
                      <p className="text-sm font-medium text-zinc-600">Loading your PDF...</p>
                    </div>
                  }
                  className="w-full"
                >
                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                    {pageOrder.map((pageIndex, logicalPosition) => {
                      const rotation = rotations[pageIndex] || 0;
                      const isSplit = splitIndices.has(logicalPosition);
                      const isLast = logicalPosition === pageOrder.length - 1;
                      return (
                        <div
                          key={`${pageIndex}-${logicalPosition}`}
                          className="group relative overflow-visible"
                          onMouseEnter={() =>
                            setHoverPreview({
                              pageNumber: pageIndex + 1,
                              rotation: rotation,
                            })
                          }
                          onMouseLeave={() => setHoverPreview(null)}
                        >
                          <div className="relative overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-zinc-300 hover:shadow-md">
                            <div className="relative flex h-[280px] items-center justify-center overflow-hidden bg-zinc-50 p-4">
                              <div className="rounded border border-zinc-200 bg-white p-2 shadow-sm">
                                <PageComp
                                  key={`page_${pageIndex}_${logicalPosition}`}
                                  pageNumber={pageIndex + 1}
                                  renderMode="canvas"
                                  renderAnnotationLayer={false}
                                  renderTextLayer={false}
                                  height={220}
                                  rotate={rotation}
                                  className="pointer-events-none select-none"
                                />
                              </div>

                              <div className="absolute inset-x-0 top-0 flex justify-center gap-2 p-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                                <div className="flex gap-1 rounded-lg border border-zinc-200 bg-white p-1.5 shadow-lg">
                                  <button
                                    onClick={() => rotatePage(pageIndex, "left")}
                                    className="flex h-8 w-8 items-center justify-center rounded border border-zinc-200 bg-white text-base text-zinc-700 transition-all hover:bg-zinc-50 active:scale-95"
                                    title="Rotate left (90°)"
                                  >
                                    <RotateCcw className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => rotatePage(pageIndex, "right")}
                                    className="flex h-8 w-8 items-center justify-center rounded border border-zinc-200 bg-white text-base text-zinc-700 transition-all hover:bg-zinc-50 active:scale-95"
                                    title="Rotate right (90°)"
                                  >
                                    <RotateCw className="h-4 w-4" />
                                  </button>
                                  <div className="mx-0.5 w-px bg-zinc-200" />
                                  <button
                                    onClick={() => duplicatePage(pageIndex)}
                                    className="flex h-8 w-8 items-center justify-center rounded border border-zinc-200 bg-white text-base text-zinc-700 transition-all hover:bg-zinc-50 active:scale-95"
                                    title="Duplicate page"
                                  >
                                    <Copy className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => setPreviewPosition(logicalPosition)}
                                    className="flex h-8 w-8 items-center justify-center rounded border border-zinc-200 bg-white text-base text-zinc-700 transition-all hover:bg-zinc-50 active:scale-95"
                                    title="Preview full size"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => deletePageAt(logicalPosition, pageIndex)}
                                    className="flex h-8 w-8 items-center justify-center rounded border border-zinc-200 bg-white text-base text-zinc-700 transition-all hover:bg-zinc-50 active:scale-95"
                                    title="Delete page"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>

                              {rotation !== 0 && (
                                <div className="absolute bottom-3 right-3 rounded border border-zinc-300 bg-white px-2 py-0.5 text-xs font-semibold text-zinc-700 shadow-sm">
                                  {rotation}°
                                </div>
                              )}
                            </div>

                            <div className="border-t border-zinc-200 bg-zinc-50 p-3">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex min-w-0 flex-1 items-center gap-2">
                                  <FileText className="h-4 w-4 flex-shrink-0 text-zinc-400" />
                                  <span className="truncate rounded bg-red-100 px-2 py-1 text-xs font-normal text-red-600">
                                    {file.name}
                                  </span>
                                </div>
                                <span className="flex h-6 min-w-[24px] flex-shrink-0 items-center justify-center rounded bg-zinc-900 px-2 text-xs font-semibold text-white">
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
                                    ? "border-zinc-900 bg-zinc-900 text-white shadow-md"
                                    : "border-zinc-300 bg-white text-zinc-600 hover:border-zinc-400 hover:bg-zinc-50"
                                }`}
                                title={isSplit ? "Remove split" : "Split after this page"}
                              >
                                <Scissors className="h-5 w-5" />
                              </button>
                              {isSplit && (
                                <div className="absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded border border-zinc-900 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white shadow-sm">
                                  Split here
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </DocumentComp>
              ) : (
                <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-3 text-center text-zinc-500">
                  <Plus className="h-10 w-10 text-zinc-400" />
                  <p className="text-sm font-medium">Upload a PDF from the sidebar to begin.</p>
                </div>
              )}
            </div>
          </div>

          <aside className="flex h-fit flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm lg:sticky lg:top-6">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-zinc-900">Split Controls</h3>
              <span className="text-xs text-zinc-500">{sections.length} files</span>
            </div>
            <label className="group relative inline-flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-800 shadow-sm transition hover:border-zinc-300 hover:bg-white">
              <span className="flex items-center gap-1.5 rounded bg-zinc-900 px-2 py-1 text-xs uppercase tracking-wide text-white">
                <Upload className="h-3 w-3" />
                Add PDF
              </span>
              <span className="max-w-[160px] truncate text-zinc-700">{file ? file.name : "Choose PDF"}</span>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => {
                  resetSkips();
                  handleFileChange(e);
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
            <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
              <label className="flex items-center gap-2 text-sm font-medium text-zinc-800">
                <input
                  type="checkbox"
                  checked={autoSplitEnabled}
                  onChange={(e) => {
                    setAutoSplitEnabled(e.target.checked);
                    resetSkips();
                  }}
                  className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-800"
                />
                Split every
              </label>
              <input
                type="number"
                min={1}
                value={autoSplitInterval}
                onChange={(e) => {
                  const val = Math.max(1, Number(e.target.value) || 1);
                  setAutoSplitInterval(val);
                  resetSkips();
                }}
                className="w-16 rounded border border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
              />
              <span className="text-sm text-zinc-600">pages</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
              <span className="text-zinc-700">Manual splits</span>
              <span className="text-zinc-500">{autoSplitEnabled ? "Disabled" : `${splitIndices.size} cuts`}</span>
            </div>
            <div className="max-h-[320px] space-y-2 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              {sections.map((section, idx) => {
                const meta = sectionMeta[idx];
                const isSkipped = skippedSections.has(idx);
                return (
                  <div
                    key={`section-${idx}`}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition ${
                      isSkipped
                        ? "border-rose-200 bg-rose-50/80 text-rose-700"
                        : "border-zinc-200 bg-white text-zinc-800"
                    }`}
                  >
                    <div>
                      <p className="font-semibold">Split {idx + 1}</p>
                      <p className="text-xs text-zinc-500">
                        Pages {meta.start + 1} - {meta.end + 1} ({meta.length})
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setSkippedSections((prev) => {
                          const next = new Set(prev);
                          if (next.has(idx)) {
                            next.delete(idx);
                          } else {
                            next.add(idx);
                          }
                          return next;
                        });
                      }}
                      className={`rounded px-3 py-1 text-xs font-semibold transition ${
                        isSkipped
                          ? "bg-rose-600 text-white hover:bg-rose-500"
                          : "bg-zinc-900 text-white hover:bg-zinc-800"
                      }`}
                    >
                      {isSkipped ? "Restore" : "Remove"}
                    </button>
                  </div>
                );
              })}
              {sections.length === 0 && <p className="text-center text-xs text-zinc-500">No splits defined</p>}
            </div>
            <p className="text-xs text-zinc-500">
              After splitting, AI will extract text and draft metadata for each split. You can regenerate and edit
              before saving to Supabase.
            </p>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
              {extractionInProgress
                ? "Extraction running..."
                : aiBusy
                  ? "AI drafting metadata..."
                  : "Ready to split or edit."}
            </div>
          </aside>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">Step 2</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-xl font-semibold text-zinc-900">Generate records from split PDFs</h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={saveAllRecords}
                  disabled={!splitRecords.length || savingAll || removingWatermark}
                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-700 bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  <span>{savingAll ? "Saving..." : "Save all to Supabase"}</span>
                </button>
                <button
                  onClick={removeWatermarkForAll}
                  disabled={
                    !splitRecords.length ||
                    removingWatermark ||
                    savingAll ||
                    generatingSplits ||
                    extractionInProgress ||
                    aiBusy
                  }
                  className="inline-flex items-center gap-2 rounded-lg border border-amber-600 bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {removingWatermark ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  <span>{removingWatermark ? "Removing..." : "Remove watermark (all)"}</span>
                </button>
                <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600">
                  Splits ready: {splitRecords.length || 0}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-zinc-900">Common fields</h3>
                <p className="text-xs text-zinc-500">Applied automatically to every split record.</p>
              </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-semibold text-zinc-700">Magazine name</label>
                <AsyncCreatableSelect
                  isClearable
                  cacheOptions
                  defaultOptions
                  loadOptions={loadMagazineOptions}
                  value={commonName ? { label: commonName, value: commonName } : null}
                  onChange={(option) => setCommonName(option ? option.value : "")}
                  onCreateOption={(inputValue) => setCommonName(inputValue)}
                  placeholder="Select or enter magazine name"
                  classNamePrefix="react-select"
                  styles={{
                    control: (base) => ({
                      ...base,
                      minHeight: "36px",
                      borderColor: "#e4e4e7",
                      boxShadow: "none",
                      fontSize: "14px",
                      "&:hover": { borderColor: "#a1a1aa" },
                    }),
                    menu: (base) => ({ ...base, zIndex: 40 }),
                  }}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-700">Volume</label>
                <input
                  value={commonVolume}
                  onChange={(e) => setCommonVolume(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none"
                  placeholder="e.g., 12"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-700">Number</label>
                <input
                  value={commonNumber}
                  onChange={(e) => setCommonNumber(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none"
                  placeholder="e.g., 4"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-700">Timestamp</label>
                <input
                  value={commonTimestamp}
                  onChange={(e) => setCommonTimestamp(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none"
                  placeholder="e.g., 1992-04-15"
                />
              </div>
            </div>
          </div>

          {splitRecords.length === 0 ? (
            <div className="flex items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-white p-10 text-sm text-zinc-600">
              Generate splits to start AI extraction and record creation.
            </div>
          ) : (
            <div className="space-y-6">
              {splitRecords.map((split) => {
                const tagsValue = Array.isArray(split.fields.tags.value) ? (split.fields.tags.value as string[]) : [];
                const authorsValue = Array.isArray(split.fields.authors.value)
                  ? (split.fields.authors.value as string[])
                  : [];
                return (
                  <div
                    key={split.id}
                    className="rounded-xl border border-zinc-200 bg-white shadow-sm transition hover:border-zinc-300"
                  >
                    <div className="flex flex-col gap-3 border-b border-zinc-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Split {split.sectionIndex}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold text-zinc-900">{split.fileName}</h3>
                          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-600">
                            Pages {split.pages.join(", ")}
                          </span>
                          <span
                            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                              split.extraction.status === "done"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : split.extraction.status === "running"
                                  ? "border-amber-200 bg-amber-50 text-amber-700"
                                  : split.extraction.status === "error"
                                    ? "border-rose-200 bg-rose-50 text-rose-700"
                                    : "border-zinc-200 bg-zinc-50 text-zinc-700"
                            }`}
                          >
                            {split.extraction.status === "done" && <CheckCircle2 className="h-4 w-4" />}
                            {split.extraction.status === "running" && <Loader2 className="h-4 w-4 animate-spin" />}
                            {split.extraction.status === "error" && <AlertTriangle className="h-4 w-4" />}
                            {split.extraction.status === "idle" && <Eye className="h-4 w-4" />}
                            <span>
                              {split.extraction.status === "done"
                                ? "Extracted"
                                : split.extraction.status === "running"
                                  ? "Extracting…"
                                  : split.extraction.status === "error"
                                    ? "Extraction failed"
                                    : "Waiting"}
                            </span>
                          </span>
                          {split.saving === "saved" && split.recordId && (
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                              Saved (ID {split.recordId})
                            </span>
                          )}
                        </div>
                        {split.saveError && <p className="text-xs text-rose-600">Save error: {split.saveError}</p>}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <a
                          href={split.objectUrl}
                          download={split.fileName}
                          className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50"
                        >
                          <Download className="h-4 w-4" />
                          Download split
                        </a>
                        <button
                          onClick={() => runExtraction(split)}
                          className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50"
                        >
                          <RefreshCw className="h-4 w-4" />
                          Re-run extraction
                        </button>
                        <button
                          onClick={() => saveRecord(split.id)}
                          disabled={split.saving === "saving"}
                          className="inline-flex items-center gap-2 rounded-lg border border-emerald-700 bg-emerald-700 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {split.saving === "saving" ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                          {split.saving === "saved" ? "Saved" : "Save to Supabase"}
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-4 p-4 lg:grid-cols-3">
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs font-semibold text-zinc-700">
                            <span>Title</span>
                            <button
                              onClick={() => runFieldGeneration(split.id, "title_name")}
                              className="inline-flex items-center gap-1 rounded border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700 shadow-sm transition hover:border-zinc-300"
                            >
                              <Repeat2 className="h-3 w-3" />
                              Regen
                            </button>
                          </div>
                          <input
                            value={split.fields.title_name.value as string}
                            onChange={(e) => setFieldValue(split.id, "title_name", e.target.value)}
                            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none"
                            placeholder="Article title"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs font-semibold text-zinc-700">
                            <span>Page number range (auto)</span>
                          </div>
                          <input
                            value={split.fields.page_numbers.value as string}
                            readOnly
                            className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 shadow-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs font-semibold text-zinc-700">
                            <span>Authors (comma separated)</span>
                            <button
                              onClick={() => runFieldGeneration(split.id, "authors")}
                              className="inline-flex items-center gap-1 rounded border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700 shadow-sm transition hover:border-zinc-300"
                            >
                              <Repeat2 className="h-3 w-3" />
                              Regen
                            </button>
                          </div>
                          <input
                            value={authorsValue.join(", ")}
                            onChange={(e) =>
                              setFieldValue(
                                split.id,
                                "authors",
                                e.target.value
                                  .split(",")
                                  .map((t) => t.trim())
                                  .filter(Boolean),
                              )
                            }
                            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none"
                            placeholder="Author 1, Author 2"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs font-semibold text-zinc-700">
                            <span>Tags (comma separated)</span>
                            <button
                              onClick={() => runFieldGeneration(split.id, "tags")}
                              className="inline-flex items-center gap-1 rounded border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700 shadow-sm transition hover:border-zinc-300"
                            >
                              <Repeat2 className="h-3 w-3" />
                              Regen
                            </button>
                          </div>
                          <input
                            value={tagsValue.join(", ")}
                            onChange={(e) =>
                              setFieldValue(
                                split.id,
                                "tags",
                                e.target.value
                                  .split(",")
                                  .map((t) => t.trim())
                                  .filter(Boolean),
                              )
                            }
                            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none"
                            placeholder="Tag1, Tag2, Tag3"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs font-semibold text-zinc-700">
                          <span>Summary</span>
                          <button
                            onClick={() => runFieldGeneration(split.id, "summary", undefined, "regen")}
                            className="inline-flex items-center gap-1 rounded border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700 shadow-sm transition hover:border-zinc-300"
                          >
                            <Repeat2 className="h-3 w-3" />
                            Re-generate
                          </button>
                        </div>
                        <textarea
                          value={split.fields.summary.value as string}
                          onChange={(e) => setFieldValue(split.id, "summary", e.target.value)}
                          rows={12}
                          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none"
                          placeholder="AI-generated summary will appear here"
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs font-semibold text-zinc-700">
                          <span>Conclusion</span>
                          <button
                            onClick={() => runFieldGeneration(split.id, "conclusion", undefined, "regen")}
                            className="inline-flex items-center gap-1 rounded border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700 shadow-sm transition hover:border-zinc-300"
                          >
                            <Repeat2 className="h-3 w-3" />
                            Re-generate
                          </button>
                        </div>
                        <textarea
                          value={split.fields.conclusion.value as string}
                          onChange={(e) => setFieldValue(split.id, "conclusion", e.target.value)}
                          rows={12}
                          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none"
                          placeholder="AI-generated conclusion will appear here"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 border-t border-zinc-200 bg-zinc-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <details className="w-full rounded-lg border border-zinc-200 bg-white p-3 text-sm text-zinc-700 shadow-sm sm:w-auto">
                        <summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">
                          <Eye className="h-4 w-4" />
                          Extracted text
                        </summary>
                        <div className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded bg-zinc-50 p-2 text-xs text-zinc-700">
                          {split.extraction.text || "No text extracted yet."}
                        </div>
                      </details>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => {
                            runFieldGeneration(split.id, "title_name", undefined, "regen");
                            runFieldGeneration(split.id, "authors", undefined, "regen");
                            runFieldGeneration(split.id, "tags", undefined, "regen");
                          }}
                          className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50"
                        >
                          <Repeat2 className="h-4 w-4" />
                          Re-run metadata
                        </button>
                        <button
                          onClick={() => saveRecord(split.id)}
                          disabled={split.saving === "saving"}
                          className="inline-flex items-center gap-2 rounded-lg border border-zinc-900 bg-zinc-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-zinc-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {split.saving === "saving" ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                          Save this record
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {hoverPreview && DocumentComp && PageComp && file && (
        <div className="pointer-events-none fixed inset-y-4 right-4 z-50 hidden lg:flex items-center">
          <div className="pointer-events-auto flex h-full max-h-[calc(100vh-2rem)] w-[480px] flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/95 shadow-2xl backdrop-blur">
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <div className="flex flex-col">
                <span className="text-xs uppercase tracking-[0.2em] text-zinc-500">Hover preview</span>
                <span className="text-sm font-semibold text-white">Page {hoverPreview.pageNumber}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-zinc-400">
                <span>{hoverPreview.rotation}°</span>
                <button
                  onClick={() => setHoverPreview(null)}
                  className="rounded-full border border-zinc-700 bg-zinc-800 px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-zinc-700"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="flex flex-1 items-center justify-center overflow-auto p-3">
              <DocumentComp file={file}>
                <PageComp
                  pageNumber={hoverPreview.pageNumber}
                  renderAnnotationLayer={false}
                  renderTextLayer={false}
                  height={typeof window !== "undefined" ? Math.min(window.innerHeight - 200, 1200) : 900}
                  rotate={hoverPreview.rotation || 0}
                  loading={
                    <div className="flex h-[400px] w-full items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-zinc-300" />
                    </div>
                  }
                />
              </DocumentComp>
            </div>
          </div>
        </div>
      )}

      {previewPosition !== null && previewContext && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-6"
          onClick={() => setPreviewPosition(null)}
        >
          <div
            className="relative flex max-h-[95vh] w-full max-w-7xl flex-col rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-shrink-0 items-center justify-between border-b border-zinc-800 p-4 sm:p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-100">
                  <Eye className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">Page Preview</h3>
                  <p className="text-sm text-zinc-400">
                    Page {previewContext.logicalIndex + 1} of {numPages}
                    {previewContext.totalOccurrences > 1 && (
                      <span className="ml-2 rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-200">
                        Copy {previewContext.occurrence} of {previewContext.totalOccurrences}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPreviewPosition(null)}
                className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-zinc-700 active:scale-95"
              >
                <X className="h-4 w-4" />
                <span className="hidden sm:inline">Close</span>
              </button>
            </div>

            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-xl bg-zinc-950 p-4 sm:p-6">
              <div className="flex items-center justify-center">
                <div className="rounded-lg bg-white p-3 shadow-xl sm:p-4">
                  {DocumentComp && PageComp ? (
                    <DocumentComp file={file}>
                      <PageComp
                        pageNumber={previewContext.logicalIndex + 1}
                        renderMode="canvas"
                        renderAnnotationLayer={false}
                        renderTextLayer={false}
                        width={(() => {
                          if (typeof window === "undefined") return 600;
                          const maxWidth = Math.min(window.innerWidth - 100, 1200);
                          const maxHeight = window.innerHeight - 300;
                          const widthFromHeight = maxHeight / 1.414;
                          return Math.min(maxWidth, widthFromHeight);
                        })()}
                        rotate={rotations[previewContext.logicalIndex] || 0}
                        loading={
                          <div className="flex h-[600px] w-[424px] items-center justify-center">
                            <Loader2 className="h-10 w-10 animate-spin text-zinc-900" />
                          </div>
                        }
                      />
                    </DocumentComp>
                  ) : (
                    <div className="flex h-[600px] w-[424px] items-center justify-center">
                      <Loader2 className="h-10 w-10 animate-spin text-white" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-shrink-0 items-center justify-between border-t border-zinc-800 p-4 sm:p-6">
              <button
                onClick={() => {
                  if (previewPosition !== null && previewPosition > 0) {
                    setPreviewPosition(previewPosition - 1);
                  }
                }}
                disabled={previewPosition === null || previewPosition === 0}
                className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm font-medium text-white transition-all hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 active:scale-95 sm:px-4"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Previous</span>
              </button>

              <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-800/50 px-3 py-2 sm:px-4">
                <span className="text-xs text-zinc-400 sm:text-sm">Rotation:</span>
                <span className="text-sm font-semibold text-white sm:text-base">
                  {rotations[previewContext.logicalIndex] || 0}°
                </span>
              </div>

              <button
                onClick={() => {
                  if (previewPosition !== null && previewPosition < pageOrder.length - 1) {
                    setPreviewPosition(previewPosition + 1);
                  }
                }}
                disabled={previewPosition === null || previewPosition === pageOrder.length - 1}
                className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm font-medium text-white transition-all hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 active:scale-95 sm:px-4"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default dynamic(() => Promise.resolve(Add), { ssr: false });
