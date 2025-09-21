// pages/index.tsx or Home.tsx
import { useState, useEffect, ChangeEvent, MouseEvent, useMemo } from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useRouter } from "next/router";
import BugModal from "@/components/BugModal";
import { PencilCircleIcon, TagIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { MagazineRecord, Tag, User } from "../types";
import { fuzzyFilter } from "../utils/fuzzyFilter";
import Header from "../components/Header";
import DataTable from "../components/DataTable";
import Pagination from "../components/Pagination";
import RecordFormModal from "../components/RecordFormModal";
import TagsModal from "../components/TagsModal";
import EditTextModal from "../components/EditTextModal";
import AuthorsModal from "@/components/AuthorsModal";
import ExportColumnsModal from "@/components/ExportColumnsModal";

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
  const [authorsModalOpen, setAuthorsModalOpen] = useState(false);
  const [selectedAuthors, setSelectedAuthors] = useState<{ label: string; value: number }[]>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [user, setUser] = useState<User | null>(null);
  const [access, setAccess] = useState<string | null>(null);
  const [bugModalOpen, setBugModalOpen] = useState<boolean>(false);
  const [tableLoading, setTableLoading] = useState<boolean>(false);
  const [showFileSize, setShowFileSize] = useState<boolean>(false);
  // Add this state alongside your other table states:
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  });

  // NEW: export modal open state & which columns are selected
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [selectedExportColumnIds, setSelectedExportColumnIds] = useState<string[]>([]);

  const [filteredData, setFilteredData] = useState<MagazineRecord[]>([]);

  const handleFilteredDataChange = (filteredRows: MagazineRecord[]) => {
    setFilteredData(filteredRows);
  };

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
      const data: any = await response.json();
      let recordsArray: MagazineRecord[];
      if (Array.isArray(data)) {
        recordsArray = data;
      } else if (data && Array.isArray(data.records)) {
        recordsArray = data.records;
      } else {
        recordsArray = [];
      }
      setRecords(recordsArray);
    } catch (err) {
      console.error("Error:", err);
      setError("Failed to load records");
      setRecords([]);
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

      // Resolve selectedTags → DB ids
      const resolvedTagIds: number[] = [];
      for (const tag of selectedTags) {
        if (tag.value < 10000000) {
          // Already an existing tag
          resolvedTagIds.push(tag.value);
        } else {
          // New tag → create it in DB
          const response = await fetch("/api/tags", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: tag.label }),
          });
          if (!response.ok) throw new Error("Failed to create tag");
          const data = await response.json();
          resolvedTagIds.push(data.id);
        }
      }

      // Current tags from record
      const currentTags = editingRecord.tags || [];
      const currentTagIds = currentTags.map((t) => t.id);

      // Diff to find adds/removes
      const tagsToAdd = resolvedTagIds.filter((id) => !currentTagIds.includes(id));
      const tagsToRemove = currentTagIds.filter((id) => !resolvedTagIds.includes(id));

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

  // submit handler (similar to tags)
  const handleAuthorSubmit = async (e: MouseEvent<HTMLButtonElement>): Promise<void> => {
    e.preventDefault();
    if (!editingRecord) return;
    try {
      setLoading(true);

      const resolvedAuthorIds: number[] = [];
      for (const author of selectedAuthors) {
        if (author.value < 10000000) {
          resolvedAuthorIds.push(author.value);
        } else {
          const response = await fetch("/api/authors", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: author.label }),
          });
          if (!response.ok) throw new Error("Failed to create author");
          const data = await response.json();
          resolvedAuthorIds.push(data.id);
        }
      }

      const currentAuthors = editingRecord.authors_linked || [];
      const currentAuthorIds = currentAuthors.map((a) => a.id);

      const authorsToAdd = resolvedAuthorIds.filter((id) => !currentAuthorIds.includes(id));
      const authorsToRemove = currentAuthorIds.filter((id) => !resolvedAuthorIds.includes(id));

      if (authorsToAdd.length > 0) {
        await fetch("/api/record-authors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recordId: editingRecord.id, authorIds: authorsToAdd }),
        });
      }

      if (authorsToRemove.length > 0) {
        await fetch("/api/record-authors", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recordId: editingRecord.id, authorIds: authorsToRemove }),
        });
      }

      await fetchRecords();
      setAuthorsModalOpen(false);
      setSelectedAuthors([]);
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
              <div
                onClick={() => {
                  // Set the editing record to the current row
                  setEditingRecord(row.original);
                  // Set the summary state to the current row's summary
                  setSummary(row.original.summary || "");
                  // Also set other fields if editing an existing record
                  setName(row.original.name || "");
                  setVolume(row.original.volume || "");
                  setNumber(row.original.number || "");
                  setTitleName(row.original.title_name || "");
                  setPageNumbers(row.original.page_numbers || "");
                  setAuthors(row.original.authors || "");
                  setLanguage(row.original.language || "");
                  setTimestamp(row.original.timestamp || "");
                  setConclusion(row.original.conclusion || "");
                  // Open the summary modal
                  setSummaryOpen(true);
                }}
                className="group w-8 h-8 flex items-center justify-center gap-2 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100 hover:border-blue-200 transition-all duration-200 cursor-pointer hover:shadow-md"
              >
                <PencilCircleIcon className="w-4 h-4 text-blue-600 group-hover:text-blue-700" />
                {/* <span className="text-blue-600 font-medium text-sm group-hover:text-blue-700">Edit Summary</span> */}
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
              <div
                onClick={() => {
                  // Set the editing record to the current row
                  setEditingRecord(row.original);
                  // Set all the fields from the current row
                  setName(row.original.name || "");
                  setSummary(row.original.summary || "");
                  setVolume(row.original.volume || "");
                  setNumber(row.original.number || "");
                  setTitleName(row.original.title_name || "");
                  setPageNumbers(row.original.page_numbers || "");
                  setAuthors(row.original.authors || "");
                  setLanguage(row.original.language || "");
                  setTimestamp(row.original.timestamp || "");
                  setConclusion(row.original.conclusion || "");
                  // Open the conclusion modal
                  setConclusionOpen(true);
                }}
                className="group w-8 h-8 flex items-center justify-center gap-2 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl border border-emerald-100 hover:border-emerald-200 transition-all duration-200 cursor-pointer hover:shadow-md"
              >
                <PencilCircleIcon className="w-4 h-4 text-emerald-600 group-hover:text-emerald-700" />
                {/* <span className="text-emerald-600 font-medium text-sm group-hover:text-emerald-700">
                  Edit Conclusion
                </span> */}
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "tags",
        header: "Tags",
        id: "tags",
        // NEW: filter understands special values
        filterFn: (row, columnId, filterValue) => {
          const tags = row.original.tags || [];
          if (!filterValue) return true;
          if (filterValue === "__EMPTY__") return tags.length === 0;
          if (filterValue === "__NONEMPTY__") return tags.length > 0;
          // exact-name match option kept
          return tags.some((tag) => tag.name.toLowerCase() === String(filterValue).toLowerCase());
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
        // NEW: filter understands special values, uses authors_linked
        filterFn: (row, columnId, filterValue) => {
          const linked = (row.original.authors_linked || []) as { id: number; name: string }[];
          if (!filterValue) return true;
          if (filterValue === "__EMPTY__") return linked.length === 0;
          if (filterValue === "__NONEMPTY__") return linked.length > 0;
          // exact-name match if a specific author is selected
          return linked.some((a) => a.name.toLowerCase() === String(filterValue).toLowerCase());
        },
        cell: ({ row }) => {
          const linked = row.original.authors_linked as { id: number; name: string }[] | undefined;
          return (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-slate-700 text-sm">
                {linked?.length ? linked.map((a) => a.name).join(", ") : "—"}
              </span>
              <button
                className="ml-2 px-2 py-1 text-xs bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100"
                onClick={() => {
                  setEditingRecord(row.original);
                  setSelectedAuthors(row.original.authors_linked?.map((a) => ({ label: a.name, value: a.id })) || []);
                  setAuthorsModalOpen(true);
                }}
              >
                Edit
              </button>
            </div>
          );
        },
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
              className="px-4 py-2 bg-slate-300 hover:bg-slate-400 text-black text-sm font-bold rounded-lg shadow transition-transform transform hover:scale-105"
              onClick={(e) => {
                e.stopPropagation();
                window.open(row.original.pdf_url, "_blank", "noopener,noreferrer");
              }}
            >
              PDF
            </button>
            <div className="text-xs text-black bg-slate-50 border border-slate-200 rounded-lg p-2">
              <span className="font-bold">Creator:</span> {row.original.creator_name || "N/A"}
            </div>
          </div>
        ),
      },
      {
        id: "editHistory",
        header: "Edit History",
        cell: ({ row }) => {
          const editHistory = row.original.editHistory;
          if (!editHistory) return <span className="text-black italic text-sm font-bold">No history</span>;
          return (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs space-y-2 w-full">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-emerald-300 rounded-full"></div>
                <span className="font-bold text-black">Edits:</span>
                <span className="bg-emerald-100 text-black px-2 py-0.5 rounded-full font-bold">
                  {editHistory.count}
                </span>
                {editHistory.latestEditor && (
                  <>
                    <span className="text-black font-bold">•</span>
                    <span className="text-black font-bold">{editHistory.latestEditor.name}</span>
                    <span className="text-black font-bold">({editHistory.latestEditor.timeFromNow})</span>
                  </>
                )}
              </div>
              <div>
                <span className="font-bold text-black">Editors:</span>{" "}
                <span className="text-black font-bold">
                  {editHistory.editors.length ? editHistory.editors.join(", ") : "—"}
                </span>
              </div>
              <div>
                <span className="font-bold text-black">By Count:</span>{" "}
                <span className="text-black font-bold">
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
                  className="px-3 py-1 bg-sky-200 hover:bg-sky-300 text-black rounded-lg text-xs font-bold transition"
                >
                  Summary
                </a>
                <a
                  href={`/conclusion/${row.original.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1 bg-violet-200 hover:bg-violet-300 text-black rounded-lg text-xs font-bold transition"
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
              className="inline-flex items-center justify-center px-4 py-2 bg-gradient-to-r from-blue-200 to-indigo-200 hover:from-blue-300 hover:to-indigo-300 text-black text-sm font-bold rounded-xl shadow-sm hover:shadow-lg transition-all duration-200 transform hover:scale-105"
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
            {/* {access && access === "records" && (
              <button
                className="inline-flex items-center justify-center px-4 py-2 bg-gradient-to-r from-emerald-200 to-teal-200 hover:from-emerald-300 hover:to-teal-300 text-black text-sm font-bold rounded-xl shadow-sm hover:shadow-lg transition-all duration-200 transform hover:scale-105"
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
            )} */}
          </div>
        ),
      },
    ],
    [],
  );

  // NEW: map which columns are “exportable” and give them clean labels
  const exportableColumns = useMemo(() => {
    // Only list columns that map to real data fields (exclude UI-only columns)
    // The 'id' keys here must match the record key/extractor switch below.
    const candidates: { id: string; label: string }[] = [
      { id: "id", label: "ID" },
      { id: "name", label: "Magazine Name" },
      { id: "summary", label: "Summary" },
      { id: "conclusion", label: "Conclusion" },
      { id: "tags", label: "Tags" },
      { id: "timestamp", label: "Timestamp" },
      { id: "volume", label: "Volume" },
      { id: "number", label: "Number" },
      { id: "title_name", label: "Title Name" },
      { id: "page_numbers", label: "Page Numbers" },
      { id: "authors", label: "Authors" }, // derived from authors_linked
      { id: "language", label: "Language" },
      { id: "pdf_url", label: "PDF URL" },
      { id: "creator_name", label: "Creator" }, // present on record
      // add more if you store them on each record
    ];

    // Optional: Only include those that actually exist in your current `columns`
    // or that we know how to extract below.
    const knownIds = new Set(candidates.map((c) => c.id));
    const presentIds = new Set<string>();
    columns.forEach((c: any) => {
      if (c?.id && knownIds.has(c.id)) presentIds.add(c.id);
      if (c?.accessorKey && knownIds.has(c.accessorKey)) presentIds.add(c.accessorKey);
    });
    // Also include derived fields we handle (authors, tags, creator_name, pdf_url)
    ["tags", "authors", "creator_name", "pdf_url"].forEach((id) => presentIds.add(id));

    const filtered = candidates.filter((c) => presentIds.has(c.id));

    // Initialize default selection once
    if (selectedExportColumnIds.length === 0 && filtered.length > 0) {
      setSelectedExportColumnIds(filtered.map((c) => c.id));
    }

    return filtered;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns]);

  // NEW: central value extractor for each exportable field
  const getExportValue = (record: MagazineRecord, key: string) => {
    switch (key) {
      case "id":
        return record.id ?? "";
      case "name":
        return record.name ?? "";
      case "summary":
        return record.summary ?? "";
      case "conclusion":
        return record.conclusion ?? "";
      case "tags":
        return record.tags?.map((t) => t.name).join(", ") ?? "";
      case "timestamp":
        return record.timestamp ?? "";
      case "volume":
        return record.volume ?? "";
      case "number":
        return record.number ?? "";
      case "title_name":
        return record.title_name ?? "";
      case "page_numbers":
        return record.page_numbers ?? "";
      case "authors":
        return record.authors_linked?.map((a) => a.name).join(", ") ?? record.authors ?? "";
      case "language":
        return record.language ?? "";
      case "pdf_url":
        return record.pdf_url ?? "";
      case "creator_name":
        return (record as any).creator_name ?? "";
      default:
        // If you add custom fields later, handle them here
        return (record as any)[key] ?? "";
    }
  };

  const exportToCSV = () => {
    const cols = exportableColumns.filter((c) => selectedExportColumnIds.includes(c.id));
    if (cols.length === 0) return;

    const headers = cols.map((c) => c.label);
    const rows = filteredData.map((record) =>
      cols.map((c) => {
        const raw = getExportValue(record, c.id);
        return String(raw ?? "");
      }),
    );

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "records.csv";
    link.click();
  };

  // UPDATED: XLSX export uses selected columns from the modal
  const exportToXLSX = () => {
    const cols = exportableColumns.filter((c) => selectedExportColumnIds.includes(c.id));
    if (cols.length === 0) return;

    try {
      import("xlsx").then((XLSX) => {
        const data = filteredData.map((record) => {
          const row: Record<string, any> = {};
          cols.forEach((c) => (row[c.label] = getExportValue(record, c.id)));
          return row;
        });

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Records");
        XLSX.writeFile(workbook, "records.xlsx");
      });
    } catch (error) {
      console.error("Error exporting to XLSX:", error);
      toast.error("Failed to export to Excel. Falling back to CSV...");
      exportToCSV();
    }
  };

  // NEW: Convenience to open the modal from Header’s existing prop
  const openExportModal = () => setExportModalOpen(true);

  const handleExport = (format: "csv" | "xlsx") => {
    if (format === "csv") {
      exportToCSV();
    } else {
      exportToXLSX();
    }
  };

  const handleSubmit = async (e: MouseEvent<HTMLButtonElement>): Promise<void> => {
    e.preventDefault();

    // Validation: only enforce summary/file for NEW uploads
    if (!editingRecord) {
      if (!name || !summary || !file) {
        setError("Please provide a name, summary and select a PDF file");
        return;
      }
    }

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("name", name);
    formData.append("summary", summary || "");
    formData.append("conclusion", conclusion || "");
    if (file) formData.append("pdf", file);
    formData.append("volume", volume);
    formData.append("number", number);
    formData.append("title_name", titleName);
    formData.append("page_numbers", pageNumbers);
    formData.append("authors", authors);
    formData.append("language", language);
    formData.append("timestamp", timestamp);

    if (editingRecord) {
      formData.append("id", String(editingRecord.id));
    }

    try {
      const url = editingRecord ? "/api/update-record" : "/api/upload";
      const response = await fetch(url, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed");
      }

      await fetchRecords();
      await fetchEmails();
      toast(editingRecord ? "Record updated successfully!" : "Record uploaded successfully!");

      // Reset if new
      if (!editingRecord) {
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
      }
      setEditingRecord(null);
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
        <RecordFormModal
          modalOpen={modalOpen}
          setModalOpen={setModalOpen}
          editingRecord={editingRecord}
          name={name}
          setName={setName}
          summary={summary}
          setSummary={setSummary}
          conclusion={conclusion}
          setConclusion={setConclusion}
          file={file}
          setFile={setFile}
          volume={volume}
          setVolume={setVolume}
          number={number}
          setNumber={setNumber}
          timestamp={timestamp}
          setTimestamp={setTimestamp}
          titleName={titleName}
          setTitleName={setTitleName}
          pageNumbers={pageNumbers}
          setPageNumbers={setPageNumbers}
          authors={authors}
          setAuthors={setAuthors}
          language={language}
          setLanguage={setLanguage}
          loading={loading}
          error={error}
          user={user}
          records={records}
          handleSubmit={handleSubmit}
          handleFileChange={handleFileChange}
          showFileSize={showFileSize}
          setShowFileSize={setShowFileSize}
          setError={setError}
        />
        <TagsModal
          tagsModalOpen={tagsModalOpen}
          setTagsModalOpen={setTagsModalOpen}
          loading={loading}
          error={error}
          selectedTags={selectedTags}
          setSelectedTags={setSelectedTags}
          allTags={allTags}
          handleTagSubmit={handleTagSubmit}
        />
        <AuthorsModal
          authorsModalOpen={authorsModalOpen}
          setAuthorsModalOpen={setAuthorsModalOpen}
          loading={loading}
          error={error}
          selectedAuthors={selectedAuthors}
          setSelectedAuthors={setSelectedAuthors}
          handleAuthorSubmit={handleAuthorSubmit}
        />
        <EditTextModal
          isOpen={summaryOpen}
          onClose={() => setSummaryOpen(false)}
          title="📝 Edit Summary"
          value={summary}
          onChange={setSummary}
          loading={loading}
          handleSubmit={handleSubmit}
          placeholder="Enter a detailed summary..."
          editingRecord={editingRecord}
        />
        <EditTextModal
          isOpen={conclusionOpen}
          onClose={() => setConclusionOpen(false)}
          title="📋 Edit Conclusion"
          value={conclusion}
          onChange={setConclusion}
          loading={loading}
          handleSubmit={handleSubmit}
          placeholder="Enter your conclusion..."
          editingRecord={editingRecord}
        />
        <div className="w-full">
          <Header
            user={user}
            access={access}
            selectedEmail={selectedEmail}
            setSelectedEmail={setSelectedEmail}
            fetchedEmails={fetchedEmails}
            setModalOpen={setModalOpen}
            setBugModalOpen={setBugModalOpen}
            exportToCSV={openExportModal}
          />
          <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-2xl border border-white/20 overflow-hidden">
            <DataTable
              data={records}
              columns={columns}
              columnFilters={columnFilters}
              setColumnFilters={setColumnFilters}
              globalFilter={globalFilter}
              setGlobalFilter={setGlobalFilter}
              sorting={sorting}
              setSorting={setSorting}
              tableLoading={tableLoading}
              setModalOpen={setModalOpen}
              setTagsModalOpen={setTagsModalOpen}
              setSummaryOpen={setSummaryOpen}
              setConclusionOpen={setConclusionOpen}
              setEditingRecord={setEditingRecord}
              setSelectedTags={setSelectedTags}
              setName={setName}
              setSummary={setSummary}
              setConclusion={setConclusion}
              setVolume={setVolume}
              setNumber={setNumber}
              setTimestamp={setTimestamp}
              setTitleName={setTitleName}
              setPageNumbers={setPageNumbers}
              setAuthors={setAuthors}
              setLanguage={setLanguage}
              setFile={setFile}
              access={access}
              setError={setError}
              // Add these new props:
              pagination={pagination}
              setPagination={setPagination}
              onFilteredDataChange={handleFilteredDataChange}
            />
          </div>
        </div>
        <BugModal isOpen={bugModalOpen} onClose={() => setBugModalOpen(false)} />

        {/* NEW: Export Modal */}
        <ExportColumnsModal
          isOpen={exportModalOpen}
          onClose={() => setExportModalOpen(false)}
          exportableColumns={exportableColumns}
          selectedColumnIds={selectedExportColumnIds}
          setSelectedColumnIds={setSelectedExportColumnIds}
          onExportCSV={exportToCSV}
          onExportXLSX={exportToXLSX}
        />
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
