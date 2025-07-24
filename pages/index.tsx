import { useState, useEffect, ChangeEvent, MouseEvent, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  FilterFn,
  flexRender,
} from "@tanstack/react-table";
import { rankItem } from "@tanstack/match-sorter-utils";
import { useRouter } from "next/router";
import BugModal from "@/components/BugModal";
import CreatableSelect from "react-select/creatable";
import { PencilCircleIcon, TagIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

export interface EditHistory {
  count: number;
  editors: string[];
  editorCounts: Record<string, number>;
  latestEditor: {
    name: string;
    email: string;
    editedAt: string;
    timeFromNow: string;
  } | null;
}

export interface Tag {
  id: number;
  name: string;
}

export interface MagazineRecord {
  id: number;
  name: string;
  timestamp: string | null;
  summary: string | null;
  pdf_url: string;
  volume: string | null;
  number: string | null;
  title_name: string | null;
  page_numbers: string | null;
  authors: string | null;
  language: string | null;
  email: string | null;
  creator_name: string | null;
  conclusion: string | null;
  editHistory?: EditHistory;
  tags?: Tag[];
}

const fuzzyFilter: FilterFn<MagazineRecord> = (row, columnId, value, addMeta) => {
  const itemRank = rankItem(row.getValue(columnId), value);
  addMeta({ itemRank });
  return itemRank.passed;
};

export default function Home() {
  const router = useRouter();

  const [records, setRecords] = useState<MagazineRecord[]>([]);
  const [name, setName] = useState<string>("");
  const [summary, setSummary] = useState<string>("");
  const [conclusion, setConclusion] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [volume, setVolume] = useState<string>("");
  const [number, setNumber] = useState<string>("");
  const [timestamp, setTimestamp] = useState<string>("");
  const [titleName, setTitleName] = useState<string>("");
  const [pageNumbers, setPageNumbers] = useState<string>("");
  const [authors, setAuthors] = useState<string>("");
  const [language, setLanguage] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [tagsModalOpen, setTagsModalOpen] = useState<boolean>(false);
  const [summaryOpen, setSummaryOpen] = useState<boolean>(false);
  const [conclusionOpen, setConclusionOpen] = useState<boolean>(false);
  const [editingRecord, setEditingRecord] = useState<MagazineRecord | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [fetchedEmails, setFetchedEmails] = useState<{ creator_name: string; email: string }[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<{ label: string; value: number }[]>([]);

  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);

  const [user, setUser] = useState<{
    name: string;
    email: string;
    access: string;
  } | null>(null);
  const [access, setAccess] = useState<string | null>(null);
  const [bugModalOpen, setBugModalOpen] = useState<boolean>(false);
  const [tableLoading, setTableLoading] = useState<boolean>(false);
  const [showFileSize, setShowFileSize] = useState<boolean>(false);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        if (parsedUser) {
          setUser(parsedUser);
          setAccess(parsedUser.access || null);
        }
      } catch (error) {
        console.error("Error parsing user data:", error);
      }
    }
  }, []);

  useEffect(() => {
    const user = localStorage.getItem("user");
    if (user) {
      try {
        const parsedUser = JSON.parse(user);
        if (parsedUser && parsedUser.name && parsedUser.email && parsedUser.access) {
          fetchEmails();
          fetchRecords();
          fetchAllTags();
        } else {
          router.push("/login");
        }
      } catch (error) {
        console.error("Error parsing user data:", error);
        router.push("/login");
      }
    } else {
      router.push("/login");
    }
  }, []);

  useEffect(() => {
    if (selectedEmail !== null) {
      fetchRecords();
    }
  }, [selectedEmail]);

  const fetchAllTags = async (): Promise<void> => {
    try {
      const response = await fetch("/api/tags");
      if (!response.ok) throw new Error("Failed to fetch tags");
      const data: Tag[] = await response.json();
      setAllTags(data);
    } catch (err) {
      console.error("Error fetching tags:", err);
    }
  };

  const fetchRecords = async (): Promise<void> => {
    try {
      setTableLoading(true);
      const queryParam = selectedEmail ? `?email=${encodeURIComponent(selectedEmail)}` : "";
      const response = await fetch(`/api/records${queryParam}`);
      if (!response.ok) throw new Error("Failed to fetch records");
      const data: MagazineRecord[] = await response.json();
      setRecords(data);
    } catch (err) {
      console.error("Error:", err);
      setError("Failed to load records");
    } finally {
      setTableLoading(false);
    }
  };

  const fetchEmails = async (): Promise<void> => {
    try {
      const response = await fetch("/api/get-emails");
      if (!response.ok) throw new Error("Failed to fetch emails");
      const data = await response.json();
      setFetchedEmails(data);
    } catch (err) {
      console.error("Error fetching emails:", err);
    }
  };

  const handleTagSubmit = async (e: MouseEvent<HTMLButtonElement>): Promise<void> => {
    e.preventDefault();
    if (!editingRecord) return;

    try {
      setLoading(true);
      // Create new tags if they don't exist
      const newTags = selectedTags.filter((tag) => !allTags.some((t) => t.name === tag.label));
      const createdTags = await Promise.all(
        newTags.map(async (tag) => {
          const response = await fetch("/api/tags", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: tag.label }),
          });
          if (!response.ok) throw new Error("Failed to create tag");
          const data = await response.json();
          return data;
        }),
      );

      // Update allTags with newly created tags
      setAllTags([...allTags, ...createdTags]);

      // Get all tag IDs (existing and newly created)
      const tagIds = selectedTags.map((tag) => {
        const existingTag = allTags.find((t) => t.name === tag.label);
        const newTag = createdTags.find((t) => t.name === tag.label);
        return (existingTag || newTag).id;
      });

      // Fetch current tags for the record
      const currentTags = editingRecord.tags || [];
      const currentTagIds = currentTags.map((t) => t.id);

      // Determine tags to add and remove
      const tagsToAdd = tagIds.filter((id) => !currentTagIds.includes(id));
      const tagsToRemove = currentTagIds.filter((id) => !tagIds.includes(id));

      // Add new tags
      if (tagsToAdd.length > 0) {
        await fetch("/api/record-tags", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recordId: editingRecord.id,
            tagIds: tagsToAdd,
          }),
        });
      }

      // Remove tags
      if (tagsToRemove.length > 0) {
        await fetch("/api/record-tags", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recordId: editingRecord.id,
            tagIds: tagsToRemove,
          }),
        });
      }

      // Refresh records
      await fetchRecords();
      setTagsModalOpen(false);
      setSelectedTags([]);
      setEditingRecord(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const columns = useMemo<ColumnDef<MagazineRecord>[]>(
    () => [
      {
        accessorKey: "id",
        header: "ID",
        id: "id",
        cell: ({ row }) => (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200">
            #{row.original.id}
          </span>
        ),
      },
      {
        accessorKey: "name",
        header: "Magazine Name",
        id: "name",
        cell: ({ row }) => <div className="font-semibold text-slate-900 text-sm">{row.original.name}</div>,
      },
      {
        accessorKey: "summary",
        header: "Summary",
        id: "summary",
        size: 500,
        cell: ({ row }) => {
          const summary = row.original.summary || "";
          const isLong = summary.length > 50;
          return (
            <div className="flex flex-col gap-3">
              {summary ? (
                <span className="text-slate-700 text-sm leading-relaxed">
                  {isLong ? summary.slice(0, 50) + "..." : summary}
                </span>
              ) : null}
              <div className="group flex items-center justify-center gap-2 p-3 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100 hover:border-blue-200 transition-all duration-200 cursor-pointer hover:shadow-md">
                <PencilCircleIcon className="w-4 h-4 text-blue-600 group-hover:text-blue-700" />
                <span className="text-blue-600 font-medium text-sm group-hover:text-blue-700">Edit Summary</span>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "conclusion",
        header: "Conclusion",
        id: "conclusion",
        size: 500,
        cell: ({ row }) => {
          const conclusion = row.original.conclusion || "";
          const isLong = conclusion.length > 50;
          return (
            <div className="flex flex-col gap-3">
              {conclusion ? (
                <span className="text-slate-700 text-sm leading-relaxed">
                  {isLong ? conclusion.slice(0, 50) + "..." : conclusion}
                </span>
              ) : null}
              <div className="group flex items-center justify-center gap-2 p-3 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl border border-emerald-100 hover:border-emerald-200 transition-all duration-200 cursor-pointer hover:shadow-md">
                <PencilCircleIcon className="w-4 h-4 text-emerald-600 group-hover:text-emerald-700" />
                <span className="text-emerald-600 font-medium text-sm group-hover:text-emerald-700">
                  Edit Conclusion
                </span>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "tags",
        header: "Tags",
        id: "tags",
        filterFn: (row, columnId, filterValue) => {
          const tags = row.original.tags || [];
          // If no filter value, show all rows
          if (!filterValue) return true;
          // Check if any tag name matches the filter value (case-insensitive)
          return tags.some((tag) => tag.name.toLowerCase() === filterValue.toLowerCase());
        },
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-2 items-center">
            {row.original.tags?.slice(0, 2).map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-gradient-to-r from-purple-100 to-pink-100 text-purple-800 border border-purple-200"
              >
                {tag.name}
              </span>
            ))}
            {row.original.tags && row.original.tags.length > 2 && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-gradient-to-r from-gray-100 to-gray-200 text-gray-800 border border-gray-300 relative group">
                +{row.original.tags.length - 2} more
              </span>
            )}
            <button
              className="group flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 hover:border-indigo-300 hover:shadow-md transition-all duration-200"
              onClick={() => {
                setEditingRecord(row.original);
                setSelectedTags(
                  row.original.tags?.map((tag) => ({
                    label: tag.name,
                    value: tag.id,
                  })) || [],
                );
                setTagsModalOpen(true);
              }}
            >
              <TagIcon size={16} className="text-indigo-600 group-hover:text-indigo-700" />
            </button>
          </div>
        ),
      },
      {
        accessorKey: "timestamp",
        header: "Timestamp",
        id: "timestamp",
        cell: ({ row }) => <span className="text-slate-600 text-sm">{row.original.timestamp}</span>,
      },
      {
        accessorKey: "volume",
        header: "Volume",
        id: "volume",
        cell: ({ row }) => (
          <span className="font-mono text-sm text-slate-700 bg-slate-100 px-2 py-1 rounded">
            {row.original.volume || "—"}
          </span>
        ),
      },
      {
        accessorKey: "number",
        header: "Number",
        id: "number",
        cell: ({ row }) => (
          <span className="font-mono text-sm text-slate-700 bg-slate-100 px-2 py-1 rounded">
            {row.original.number || "—"}
          </span>
        ),
      },
      {
        accessorKey: "title_name",
        header: "Title Name",
        id: "title_name",
        cell: ({ row }) => {
          const title = row.original.title_name || "—";
          const formattedTitle =
            title === "—"
              ? title
              : title
                  .split(" ")
                  .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                  .join(" ");
          return <span className="text-slate-700 text-sm italic">{formattedTitle}</span>;
        },
      },
      {
        accessorKey: "page_numbers",
        header: "Page Numbers",
        id: "page_numbers",
        cell: ({ row }) => (
          <span className="font-mono text-sm bg-amber-50 text-amber-800 px-2 py-1 rounded border border-amber-200">
            {row.original.page_numbers || "—"}
          </span>
        ),
      },
      {
        accessorKey: "authors",
        header: "Authors",
        id: "authors",
        cell: ({ row }) => <span className="text-slate-700 text-sm">{row.original.authors || "—"}</span>,
      },
      {
        accessorKey: "language",
        header: "Language",
        id: "language",
        cell: ({ row }) => (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
            {row.original.language || "—"}
          </span>
        ),
      },
      {
        accessorKey: "pdf_url",
        header: "PDF",
        id: "pdf_url",
        cell: ({ row }) => (
          <div className="space-y-2">
            <button
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow transition-transform transform hover:scale-105"
              onClick={(e) => {
                e.stopPropagation();
                window.open(row.original.pdf_url, "_blank", "noopener,noreferrer");
              }}
            >
              View PDF
            </button>
            <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-2">
              <span className="font-medium">Creator:</span> {row.original.creator_name || "N/A"}
            </div>
          </div>
        ),
      },
      {
        id: "editHistory",
        header: "Edit History",
        cell: ({ row }) => {
          const editHistory = row.original.editHistory;
          if (!editHistory) return <span className="text-slate-400 italic text-sm">No history</span>;
          return (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs space-y-2 w-full">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="font-semibold text-slate-800">Edits:</span>
                <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-medium">
                  {editHistory.count}
                </span>
                {editHistory.latestEditor && (
                  <>
                    <span className="text-slate-400">•</span>
                    <span className="text-slate-700">{editHistory.latestEditor.name}</span>
                    <span className="text-slate-500">({editHistory.latestEditor.timeFromNow})</span>
                  </>
                )}
              </div>
              <div>
                <span className="font-semibold text-slate-800">Editors:</span>{" "}
                <span className="text-slate-600">
                  {editHistory.editors.length ? editHistory.editors.join(", ") : "—"}
                </span>
              </div>
              <div>
                <span className="font-semibold text-slate-800">By Count:</span>{" "}
                <span className="text-slate-600">
                  {Object.entries(editHistory.editorCounts)
                    .map(([editor, count]) => `${editor}: ${count}`)
                    .join(", ")}
                </span>
              </div>
              <div className="flex gap-2 pt-2 border-t border-slate-200">
                <a
                  href={`/summary/${row.original.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-medium transition"
                >
                  Summary
                </a>
                <a
                  href={`/conclusion/${row.original.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-xs font-medium transition"
                >
                  Conclusion
                </a>
              </div>
            </div>
          );
        },
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex flex-col gap-2">
            <button
              className="inline-flex items-center justify-center px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white text-sm font-medium rounded-xl shadow-sm hover:shadow-lg transition-all duration-200 transform hover:scale-105"
              onClick={() => {
                const record = row.original;
                setEditingRecord(record);
                setModalOpen(true);
                setError(null);
                setName(record.name || "");
                setSummary(record.summary || "");
                setConclusion(record.conclusion || "");
                setVolume(record.volume || "");
                setNumber(record.number || "");
                setTimestamp(record.timestamp || "");
                setTitleName(record.title_name || "");
                setPageNumbers(record.page_numbers || "");
                setAuthors(record.authors || "");
                setLanguage(record.language || "");
                setFile(null);
              }}
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
              Update
            </button>
            {access && access === "records" && (
              <button
                className="inline-flex items-center justify-center px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white text-sm font-medium rounded-xl shadow-sm hover:shadow-lg transition-all duration-200 transform hover:scale-105"
                onClick={() => {
                  const record = row.original;
                  setName(record.name || "");
                  setVolume(record.volume || "");
                  setNumber(record.number || "");
                  setTimestamp(record.timestamp || "");
                  setAuthors(record.authors || "");
                  setLanguage(record.language || "");
                  setModalOpen(true);
                  setEditingRecord(null);
                  setError(null);
                  setSummary("");
                  setConclusion("");
                  setFile(null);
                  setTitleName("");
                  setPageNumbers("");
                }}
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                Duplicate
              </button>
            )}
          </div>
        ),
      },
    ],
    [],
  );

  const exportToCSV = () => {
    const headers = columns.map((column) => column.header).filter((header) => typeof header === "string") as string[];
    const rows = records.map((record) =>
      headers.map((header) => {
        const column = columns.find((column) => column.header === header && "accessorKey" in column);
        if (column && column.id) {
          const key = column.id as keyof MagazineRecord;
          if (key === "tags") {
            return record.tags?.map((tag) => tag.name).join(", ") ?? "";
          }
          return record[key] ?? "";
        }
        return "";
      }),
    );

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "records.csv";
    link.click();
  };

  const table = useReactTable({
    data: records,
    columns,
    filterFns: { fuzzy: fuzzyFilter },
    state: { columnFilters, globalFilter, sorting },
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    globalFilterFn: fuzzyFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const handleSubmit = async (e: MouseEvent<HTMLButtonElement>): Promise<void> => {
    e.preventDefault();
    if (!name || !summary || (!file && !editingRecord)) {
      setError("Please provide a name, summary and select a PDF file");
      return;
    }
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("name", name);
    formData.append("summary", summary);
    if (file) formData.append("pdf", file);
    formData.append("volume", volume);
    formData.append("number", number);
    formData.append("title_name", titleName);
    formData.append("page_numbers", pageNumbers);
    formData.append("authors", authors);
    formData.append("language", language);
    formData.append("timestamp", timestamp);
    formData.append("conclusion", conclusion || "");

    const user = localStorage.getItem("user");
    if (user) {
      try {
        const parsedUser = JSON.parse(user);
        if (parsedUser.name) formData.append("creator_name", parsedUser.name);
        if (parsedUser.email) formData.append("email", parsedUser.email);
      } catch (error) {
        console.error("Error parsing user data:", error);
        setError("Failed to retrieve user information");
        setLoading(false);
        return;
      }
    }

    if (editingRecord) {
      formData.append("id", String(editingRecord.id));
    }

    try {
      const url = editingRecord ? "/api/update-record" : "/api/upload";
      const response = await fetch(url, {
        method: "POST",
        body: formData,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed");
      }
      await fetchRecords();
      await fetchEmails();
      setModalOpen(editingRecord ? false : true);
      if (editingRecord) {
        setEditingRecord(null);
        setName("");
        setSummary("");
        setConclusion("");
        setVolume("");
        setNumber("");
        setTimestamp("");
        setTitleName("");
        setPageNumbers("");
        setAuthors("");
        setLanguage("");
        setFile(null);
      } else {
        setSummary("");
        setConclusion("");
        setTitleName("");
        setPageNumbers("");
        setAuthors("");
        setFile(null);
      }
      toast(editingRecord ? "Record updated successfully!" : "Record uploaded successfully!", {
        duration: 2000,
        description: "Your record has been saved.",
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
      setSummaryOpen(false);
      setConclusionOpen(false);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const selectedFile = e.target.files?.[0] || null;
    if (selectedFile && selectedFile.size > 4 * 1024 * 1024) {
      setShowFileSize(true);
      e.target.value = "";
      setFile(null);
      return;
    }
    setShowFileSize(false);
    setFile(selectedFile);
  };

  return (
    <>
      <Toaster position="top-right" />
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        {/* Modals remain the same but with updated styling */}
        {modalOpen && (
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
                      PDF File{" "}
                      {editingRecord ? "(optional, to replace existing)" : <span className="text-red-500">*</span>}
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
                    <svg
                      className="w-5 h-5 text-red-500 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
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
                    setTitleName("");
                    setPageNumbers("");
                    setAuthors("");
                    setLanguage("");
                    setTimestamp("");
                    setEditingRecord(null);
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
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
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
        )}

        {/* Tags Modal - similar styling updates */}
        {tagsModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-white/95 backdrop-blur-md shadow-2xl rounded-2xl p-8 w-full max-w-md relative border border-white/20">
              <button
                onClick={() => setTagsModalOpen(false)}
                className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 text-2xl focus:outline-none focus:ring-2 focus:ring-slate-300 rounded-full w-8 h-8 flex items-center justify-center transition-all duration-200"
                aria-label="Close form"
                disabled={loading}
              >
                ×
              </button>
              <h2 className="text-2xl font-bold bg-gradient-to-r from-slate-800 to-purple-600 bg-clip-text text-transparent mb-6">
                Manage Tags
              </h2>
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
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Tags</label>
                  <CreatableSelect
                    isMulti
                    value={selectedTags}
                    onChange={(options) => setSelectedTags(options as { label: string; value: number }[])}
                    onCreateOption={(inputValue) => {
                      setSelectedTags([...selectedTags, { label: inputValue, value: Date.now() }]);
                    }}
                    options={allTags.map((tag) => ({
                      label: tag.name,
                      value: tag.id,
                    }))}
                    placeholder="Select or create tags"
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
                          borderColor: "#8b5cf6",
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
                <button
                  type="button"
                  onClick={handleTagSubmit}
                  className={`w-full py-4 px-6 rounded-xl shadow-lg text-white text-sm font-semibold transition-all duration-200 transform ${
                    loading
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 hover:shadow-xl hover:scale-[1.02]"
                  } focus:outline-none focus:ring-4 focus:ring-purple-300`}
                  disabled={loading}
                >
                  {loading ? (
                    <div className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      Saving...
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                      <TagIcon size={16} />
                      Save Tags
                    </div>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Summary/Conclusion Modal - similar styling updates */}
        {(summaryOpen || conclusionOpen) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-white/95 backdrop-blur-md shadow-2xl rounded-2xl p-8 w-[90vw] h-[85vh] relative flex flex-col border border-white/20">
              <button
                onClick={() => {
                  setSummaryOpen(false);
                  setConclusionOpen(false);
                }}
                className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 text-2xl focus:outline-none focus:ring-2 focus:ring-slate-300 rounded-full w-8 h-8 flex items-center justify-center transition-all duration-200 z-10"
                aria-label="Close"
                disabled={loading}
              >
                ×
              </button>
              <h2 className="text-3xl font-bold bg-gradient-to-r from-slate-800 to-indigo-600 bg-clip-text text-transparent mb-6">
                {summaryOpen ? "📝 Edit Summary" : "📋 Edit Conclusion"}
              </h2>
              <div className="flex-1 overflow-y-auto pr-2 mb-6">
                <textarea
                  className="w-full h-full min-h-[400px] rounded-xl border-2 border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-0 text-slate-700 px-4 py-3 text-base resize-none bg-gradient-to-r from-slate-50 to-gray-50 transition-all duration-200"
                  value={
                    summaryOpen ? summary.replace(/\\r\\n|\\n|\\r/g, "\n") : conclusion.replace(/\\r\\n|\\n|\\r/g, "\n")
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    if (summaryOpen) {
                      setSummary(val);
                      setEditingRecord((prev) => (prev ? { ...prev, summary: val } : prev));
                    } else {
                      setConclusion(val);
                      setEditingRecord((prev) => (prev ? { ...prev, conclusion: val } : prev));
                    }
                  }}
                  disabled={loading}
                  placeholder={summaryOpen ? "Enter a detailed summary..." : "Enter your conclusion..."}
                />
              </div>
              <div className="flex items-center justify-between gap-4 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setSummaryOpen(false);
                    setConclusionOpen(false);
                  }}
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
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
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
        )}

        {/* Main Content */}
        <div className="w-full">
          {/* Header Section */}
          <div className="mb-8">
            <div className="bg-white/80 backdrop-blur-md rounded-2xl p-6 shadow-xl border border-white/20">
              <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-6">
                <div>
                  <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-800 via-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
                    📚 Magazine Summary Portal
                  </h1>
                  <p className="text-slate-600 text-lg">
                    Manage and organize your magazine summary collection with ease
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-3">
                  {user?.email &&
                    (user.email === "dharmsasanwork99@gmail.com" || user.email === "dhruvshdarshansh@gmail.com") && (
                      <button
                        onClick={() => router.push("/dashboard")}
                        className="inline-flex items-center px-4 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
                      >
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                          />
                        </svg>
                        Dashboard
                      </button>
                    )}

                  <button
                    onClick={() => {
                      localStorage.setItem("user", JSON.stringify(null));
                      router.push("/login");
                    }}
                    className="inline-flex items-center px-4 py-2.5 bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                      />
                    </svg>
                    Logout
                  </button>

                  <select
                    value={selectedEmail || ""}
                    onChange={(e) => setSelectedEmail(e.target.value)}
                    className="px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium shadow-lg bg-white/80 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
                  >
                    <option value="">📋 Show All Users</option>
                    {fetchedEmails.map(({ creator_name, email }) => (
                      <option key={email} value={email}>
                        👤 {`${creator_name} (${email})`}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => setBugModalOpen(true)}
                    className="inline-flex items-center px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    Report Bug
                  </button>

                  <button
                    onClick={exportToCSV}
                    className="inline-flex items-center px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    Export CSV
                  </button>

                  {access && access === "records" && (
                    <button
                      onClick={() => {
                        setModalOpen(true);
                        setError(null);
                        setName("");
                        setSummary("");
                        setConclusion("");
                        setFile(null);
                        setVolume("");
                        setNumber("");
                        setTitleName("");
                        setPageNumbers("");
                        setAuthors("");
                        setLanguage("");
                        setTimestamp("");
                        setEditingRecord(null);
                      }}
                      className="inline-flex items-center px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add Record
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Data Table */}
          <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-2xl border border-white/20 overflow-hidden">
            {tableLoading ? (
              <div className="flex flex-col items-center justify-center p-12 space-y-4">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full border-4 border-slate-200"></div>
                  <div className="w-12 h-12 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin absolute top-0"></div>
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-slate-700 mb-2">Loading Records</h3>
                  <p className="text-slate-500">Please wait while we fetch your data...</p>
                </div>
              </div>
            ) : (
              <div className="overflow-auto max-h-[70vh]">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-gradient-to-r from-slate-50 to-gray-100 sticky top-0 z-20">
                      {table.getHeaderGroups().map((headerGroup) => (
                        <tr key={headerGroup.id}>
                          {headerGroup.headers.map((header) => {
                            // Check if a filter is applied to this column
                            const isFiltered =
                              !!header.column.getFilterValue() &&
                              header.column.getFilterValue() !== "" &&
                              header.column.getCanFilter();

                            return (
                              <th
                                key={header.id}
                                colSpan={header.colSpan}
                                className={`px-2 py-4 text-left text-xs font-bold uppercase tracking-wider bg-gradient-to-r from-slate-50 to-gray-100 border-b border-slate-200
                                ${
                                  isFiltered
                                    ? "bg-pink-200 text-red-900 font-extrabold shadow-lg ring-2 ring-red-400 ring-offset-2"
                                    : "text-slate-700"
                                }
                              `}
                                style={{
                                  position: "sticky",
                                  top: 0,
                                  zIndex: 21,
                                  transition: "background 0.3s, color 0.3s, box-shadow 0.3s",
                                }}
                              >
                                <div
                                  {...{
                                    className: header.column.getCanSort()
                                      ? "cursor-pointer select-none flex items-center font-bold hover:text-indigo-600 transition-colors duration-200"
                                      : "flex items-center font-bold",
                                    onClick: header.column.getToggleSortingHandler(),
                                  }}
                                >
                                  {flexRender(header.column.columnDef.header, header.getContext())}
                                  <span className="ml-2">
                                    {{ asc: "🔼", desc: "🔽" }[header.column.getIsSorted() as string] ?? null}
                                  </span>
                                  {isFiltered && (
                                    <span className="ml-2 px-2 py-0.5 rounded-full bg-red-500 text-white text-xs font-bold animate-pulse border border-red-700 shadow">
                                      Filter
                                    </span>
                                  )}
                                </div>
                                {header.column.getCanFilter() && (
                                  <div className="mt-2">
                                    {["name", "title_name", "authors", "tags"].includes(header.column.id) ? (
                                      header.column.id === "name" ? (
                                        <select
                                          value={(header.column.getFilterValue() as string) ?? ""}
                                          onChange={(e) => {
                                            header.column.setFilterValue(e.target.value);
                                            setSorting([
                                              {
                                                id: "volume",
                                                desc: false,
                                              },
                                              {
                                                id: "number",
                                                desc: false,
                                              },
                                              {
                                                id: "page_numbers",
                                                desc: false,
                                              },
                                            ]);
                                          }}
                                          className={`border-2 rounded-lg px-2 py-1 text-xs w-full bg-white/80 focus:border-indigo-500 focus:ring-0 transition-colors duration-200 ${
                                            isFiltered ? "border-red-400 ring-2 ring-red-300" : "border-slate-200"
                                          }`}
                                        >
                                          <option value="">All</option>
                                          {Array.from(new Set(records.map((r) => r.name).filter(Boolean))).map(
                                            (value) => (
                                              <option key={value as string} value={value as string}>
                                                {value as string}
                                              </option>
                                            ),
                                          )}
                                        </select>
                                      ) : header.column.id === "tags" ? (
                                        <select
                                          value={(header.column.getFilterValue() as string) ?? ""}
                                          onChange={(e) => header.column.setFilterValue(e.target.value)}
                                          className={`border-2 rounded-lg px-2 py-1 text-xs w-full bg-white/80 focus:border-indigo-500 focus:ring-0 transition-colors duration-200 ${
                                            isFiltered ? "border-red-400 ring-2 ring-red-300" : "border-slate-200"
                                          }`}
                                        >
                                          <option value="">All</option>
                                          {(() => {
                                            let filteredRecords = records;
                                            const nameFilter = table
                                              .getState()
                                              .columnFilters.find((f) => f.id === "name")?.value;
                                            if (nameFilter) {
                                              filteredRecords = filteredRecords.filter(
                                                (r) =>
                                                  String(r.name ?? "").toLowerCase() ===
                                                  String(nameFilter).toLowerCase(),
                                              );
                                            }
                                            // Collect unique tag names
                                            const tagNames = Array.from(
                                              new Set(
                                                filteredRecords
                                                  .flatMap((r) => r.tags?.map((t) => t.name) || [])
                                                  .filter(Boolean),
                                              ),
                                            ).sort();
                                            return tagNames.map((name) => (
                                              <option key={name} value={name}>
                                                {name}
                                              </option>
                                            ));
                                          })()}
                                        </select>
                                      ) : (
                                        <select
                                          value={(header.column.getFilterValue() as string) ?? ""}
                                          onChange={(e) => header.column.setFilterValue(e.target.value)}
                                          className={`border-2 rounded-lg px-2 py-1 text-xs w-full bg-white/80 focus:border-indigo-500 focus:ring-0 transition-colors duration-200 ${
                                            isFiltered ? "border-red-400 ring-2 ring-red-300" : "border-slate-200"
                                          }`}
                                        >
                                          <option value="">All</option>
                                          {(() => {
                                            let filteredRecords = records;
                                            const nameFilter = table
                                              .getState()
                                              .columnFilters.find((f) => f.id === "name")?.value;
                                            if (["title_name", "authors"].includes(header.column.id) && nameFilter) {
                                              filteredRecords = filteredRecords.filter(
                                                (r) =>
                                                  String(r.name ?? "").toLowerCase() ===
                                                  String(nameFilter).toLowerCase(),
                                              );
                                            }
                                            const options = [
                                              ...new Set(
                                                filteredRecords
                                                  .map((r) => r[header.column.id as keyof MagazineRecord])
                                                  .filter(Boolean),
                                              ),
                                            ];
                                            return options.map((value) => (
                                              <option key={value as string} value={value as string}>
                                                {value as string}
                                              </option>
                                            ));
                                          })()}
                                        </select>
                                      )
                                    ) : (
                                      <input
                                        type="text"
                                        value={(header.column.getFilterValue() as string) ?? ""}
                                        onChange={(e) => header.column.setFilterValue(e.target.value)}
                                        placeholder={`Filter...`}
                                        className={`border-2 rounded-lg px-2 py-1 text-xs w-full bg-white/80 focus:border-indigo-500 focus:ring-0 transition-colors duration-200 ${
                                          isFiltered ? "border-red-400 ring-2 ring-red-300" : "border-slate-200"
                                        }`}
                                      />
                                    )}
                                  </div>
                                )}
                              </th>
                            );
                          })}
                        </tr>
                      ))}
                    </thead>
                    <tbody className="bg-white/60 backdrop-blur-sm divide-y divide-slate-100">
                      {table.getRowModel().rows.length ? (
                        table.getRowModel().rows.map((row, index) => (
                          <tr
                            key={row.id}
                            className={`hover:bg-indigo-50/50 transition-all duration-200 border-black border-t-2 border-b-2 ${
                              index % 2 === 0 ? "bg-slate-50/30" : "bg-white/50"
                            }`}
                          >
                            {row.getVisibleCells().map((cell) => {
                              const colId = cell.column.id;
                              if (colId === "summary") {
                                return (
                                  <td
                                    key={cell.id}
                                    className="px-2 py-6 whitespace-normal text-sm text-slate-700 max-w-xs cursor-pointer hover:bg-blue-50/80 transition-colors duration-200"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingRecord(row.original);
                                      setSummaryOpen(true);
                                      setName(row.original.name || "");
                                      setSummary(row.original.summary || "");
                                      setConclusion(row.original.conclusion || "");
                                      setVolume(row.original.volume || "");
                                      setNumber(row.original.number || "");
                                      setTimestamp(row.original.timestamp || "");
                                      setTitleName(row.original.title_name || "");
                                      setPageNumbers(row.original.page_numbers || "");
                                      setAuthors(row.original.authors || "");
                                      setLanguage(row.original.language || "");
                                      setFile(null);
                                    }}
                                  >
                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                  </td>
                                );
                              }
                              if (colId === "conclusion") {
                                return (
                                  <td
                                    key={cell.id}
                                    className="px-2 py-6 whitespace-normal text-sm text-slate-700 max-w-xs cursor-pointer hover:bg-emerald-50/80 transition-colors duration-200"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingRecord(row.original);
                                      setConclusionOpen(true);
                                      setName(row.original.name || "");
                                      setSummary(row.original.summary || "");
                                      setConclusion(row.original.conclusion || "");
                                      setVolume(row.original.volume || "");
                                      setNumber(row.original.number || "");
                                      setTimestamp(row.original.timestamp || "");
                                      setTitleName(row.original.title_name || "");
                                      setPageNumbers(row.original.page_numbers || "");
                                      setAuthors(row.original.authors || "");
                                      setLanguage(row.original.language || "");
                                      setFile(null);
                                    }}
                                  >
                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                  </td>
                                );
                              }
                              return (
                                <td
                                  key={cell.id}
                                  className="px-2 py-6 whitespace-normal text-sm text-slate-700 max-w-xs"
                                >
                                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </td>
                              );
                            })}
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={columns.length} className="px-2 py-12 text-center">
                            <div className="flex flex-col items-center space-y-3">
                              <svg
                                className="w-12 h-12 text-slate-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                />
                              </svg>
                              <h3 className="text-lg font-semibold text-slate-600">No records found</h3>
                              <p className="text-slate-500">
                                Try adjusting your filters or add a new record to get started.
                              </p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Pagination */}
          <div className="mt-6 bg-white/80 backdrop-blur-md rounded-2xl p-6 shadow-xl border border-white/20">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  className="inline-flex items-center px-4 py-2 border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                  onClick={() => table.setPageIndex(0)}
                  disabled={!table.getCanPreviousPage()}
                >
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                    />
                  </svg>
                  First
                </button>
                <button
                  className="inline-flex items-center px-4 py-2 border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                >
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Previous
                </button>
                <button
                  className="inline-flex items-center px-4 py-2 border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                >
                  Next
                  <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                <button
                  className="inline-flex items-center px-4 py-2 border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                  onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                  disabled={!table.getCanNextPage()}
                >
                  Last
                  <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-4">
                <span className="ml-4 flex items-center gap-1 text-base text-zinc-900 font-bold">
                  Showing {table.getFilteredRowModel().rows.length} records
                </span>
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <span>Page</span>
                  <span className="inline-flex items-center px-3 py-1 rounded-lg bg-gradient-to-r from-indigo-100 to-purple-100 text-indigo-800 font-bold">
                    {table.getState().pagination.pageIndex + 1}
                  </span>
                  <span>of</span>
                  <span className="inline-flex items-center px-3 py-1 rounded-lg bg-gradient-to-r from-slate-100 to-gray-100 text-slate-800 font-bold">
                    {table.getPageCount()}
                  </span>
                </div>

                <select
                  value={table.getState().pagination.pageSize}
                  onChange={(e) => table.setPageSize(Number(e.target.value))}
                  className="border-2 border-slate-200 rounded-xl px-4 py-2 text-sm font-medium bg-white focus:border-indigo-500 focus:ring-0 transition-all duration-200"
                >
                  {[10, 20, 30, 40, 50, 100, 200].map((pageSize) => (
                    <option key={pageSize} value={pageSize}>
                      Show {pageSize}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        <BugModal isOpen={bugModalOpen} onClose={() => setBugModalOpen(false)} />

        <style jsx global>{`
          .custom-scrollbar::-webkit-scrollbar {
            width: 8px;
            height: 8px;
          }

          .custom-scrollbar::-webkit-scrollbar-track {
            background: #f1f5f9;
            border-radius: 4px;
          }

          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: linear-gradient(135deg, #6366f1, #8b5cf6);
            border-radius: 4px;
          }

          .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: linear-gradient(135deg, #4f46e5, #7c3aed);
          }
        `}</style>
      </div>
    </>
  );
}
