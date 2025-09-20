import { useState, useEffect } from "react";
import Link from "next/link";
import { GetServerSideProps } from "next";
import { createClient } from "@supabase/supabase-js";
import {
  LoadingSpinner,
  Toast,
  EnhancedAuthorFormModal,
  AuthorStats,
  ExportImportActions,
  BulkActions,
  SelectableAuthorCard,
  EnhancedSearch,
} from "../../components/AuthorManagement";

// Types
// Updated Author Interface
interface Author {
  id: number;
  name: string;
  description: string | null;
  cover_url: string | null;
  created_at: string;
  national: "national" | "international" | null;
  designation: string | null; // New field
  short_name: string | null; // New field
}

// Updated AuthorRecord interface (if needed)
interface AuthorRecord {
  id: number;
  name: string;
  timestamp: string | null;
  volume: string | null;
  number: string | null;
  title_name: string | null;
}

// Updated AuthorsPageProps filters
interface AuthorsPageProps {
  authors: Author[];
  total: number;
  currentPage: number;
  totalPages: number;
  filters: {
    search: string;
    sortBy: string;
    sortOrder: string;
    dateFrom: string;
    dateTo: string;
    national?: "national" | "international" | "null" | "";
    designation?: string;
    designationStatus?: "filled" | "empty" | ""; // NEW
    descriptionStatus?: "filled" | "empty" | ""; // NEW
  };
}

// Helper function to get initials
const getInitials = (name: string): string => {
  return name
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase())
    .slice(0, 2)
    .join("");
};

// Author Details Modal with Records (Updated)
const AuthorDetailsModal = ({
  author,
  isOpen,
  onClose,
  onEdit,
  onDelete,
}: {
  author: Author | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) => {
  const [records, setRecords] = useState<AuthorRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [recordsPage, setRecordsPage] = useState(1);
  const [hasMoreRecords, setHasMoreRecords] = useState(true);

  useEffect(() => {
    if (author && isOpen) {
      fetchAuthorRecords(author.id);
    }
  }, [author, isOpen]);

  const fetchAuthorRecords = async (authorId: number, page = 1) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/authors/${authorId}/records?page=${page}&limit=10`);
      const data = await response.json();

      if (page === 1) {
        setRecords(data || []);
      } else {
        setRecords((prev) => [...prev, ...(data || [])]);
      }

      setHasMoreRecords(data.hasMore || false);
      setRecordsPage(page);
    } catch (error) {
      console.error("Error fetching author records:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadMoreRecords = () => {
    if (author && hasMoreRecords && !loading) {
      fetchAuthorRecords(author.id, recordsPage + 1);
    }
  };

  if (!isOpen || !author) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        className="bg-white rounded-lg max-w-4xl w-full p-6 relative max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 text-xl">
          ×
        </button>

        {/* Author Info */}
        <div className="flex items-center mb-6">
          {author.cover_url ? (
            <img src={author.cover_url} alt={author.name} className="w-20 h-20 rounded-full object-cover mr-4" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-blue-500 text-white flex items-center justify-center text-2xl font-semibold mr-4">
              {getInitials(author.name)}
            </div>
          )}
          <div className="flex-1">
            <h2 className="text-2xl font-semibold text-gray-900">{author.name}</h2>
            {author.short_name && <p className="text-sm text-gray-600">Short Name: {author.short_name}</p>}
            {author.designation && <p className="text-sm text-blue-600 font-medium">{author.designation}</p>}
          </div>

          {/* Status badges */}
          <div className="flex flex-col items-end space-y-1">
            {author.national && (
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${
                  author.national === "national"
                    ? "bg-green-100 text-green-800"
                    : author.national === "international"
                      ? "bg-purple-100 text-purple-800"
                      : "bg-gray-100 text-gray-600"
                }`}
              >
                {author.national}
              </span>
            )}

            <div className="flex space-x-2">
              <button
                onClick={onEdit}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Edit Author
              </button>
              <button
                onClick={onDelete}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                Delete Author
              </button>
            </div>
          </div>
        </div>

        {author.description && (
          <div className="mb-8">
            <h3 className="text-lg font-medium text-gray-700 mb-3">About</h3>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{author.description}</p>
            </div>
          </div>
        )}

        {/* Records Section */}
        <div>
          <h3 className="text-xl font-medium text-gray-900 mb-4 flex items-center">
            Publications & Records
            <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">{records.length}</span>
          </h3>

          {loading && records.length === 0 ? (
            <LoadingSpinner />
          ) : records.length > 0 ? (
            <div className="space-y-4">
              {records.map((record) => (
                <div
                  key={record.id}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex justify-between items-start mb-3">
                    <h4 className="font-semibold text-gray-900 text-lg">{record.name}</h4>
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">#{record.id}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                    {record.title_name && (
                      <div>
                        <span className="font-medium text-gray-600">Magazine:</span>
                        <p className="text-gray-800">{record.title_name}</p>
                      </div>
                    )}
                    {record.volume && (
                      <div>
                        <span className="font-medium text-gray-600">Volume:</span>
                        <p className="text-gray-800">{record.volume}</p>
                      </div>
                    )}
                    {record.number && (
                      <div>
                        <span className="font-medium text-gray-600">Issue:</span>
                        <p className="text-gray-800">{record.number}</p>
                      </div>
                    )}
                    {record.timestamp && (
                      <div>
                        <span className="font-medium text-gray-600">Published:</span>
                        <p className="text-gray-800">{record.timestamp}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Load More Button */}
              {hasMoreRecords && (
                <div className="text-center pt-4">
                  <button
                    onClick={loadMoreRecords}
                    disabled={loading}
                    className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
                  >
                    {loading ? "Loading..." : "Load More Records"}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <div className="text-gray-400 mb-2">📄</div>
              <p className="text-gray-600">No records found for this author.</p>
              <p className="text-sm text-gray-500 mt-1">
                Records will appear here when this author is associated with publications.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Delete Confirmation Modal
const DeleteConfirmationModal = ({
  author,
  recordCount,
  isOpen,
  onClose,
  onConfirm,
  loading,
}: {
  author: Author | null;
  recordCount: number;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}) => {
  if (!isOpen || !author) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-md w-full p-6 relative" onClick={(e) => e.stopPropagation()}>
        <div className="text-center mb-6">
          <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <span className="text-red-600 text-xl">⚠️</span>
          </div>
          <h2 className="text-xl font-semibold mb-2 text-gray-900">Delete Author</h2>
          <p className="text-gray-600">
            Are you sure you want to delete <strong>{author.name}</strong>?
          </p>
        </div>

        {recordCount > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-start">
              <span className="text-red-500 mr-2">⚠️</span>
              <div>
                <p className="text-red-800 font-medium">Warning: Data Loss</p>
                <p className="text-red-700 text-sm mt-1">
                  This author has <strong>{recordCount}</strong> related publication record(s). Deleting this author
                  will also remove all associated records.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm bg-red-500 text-white rounded-md hover:bg-red-600 disabled:opacity-50 transition-colors flex items-center"
            disabled={loading}
          >
            {loading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>}
            {loading ? "Deleting..." : "Delete Author"}
          </button>
        </div>
      </div>
    </div>
  );
};

// Updated Filters Component
const FiltersComponent = ({ filters, onFiltersChange }: { filters: any; onFiltersChange: (filters: any) => void }) => {
  const [localFilters, setLocalFilters] = useState(filters);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleFilterChange = (key: string, value: string) => {
    const newFilters = { ...localFilters, [key]: value };
    setLocalFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const clearFilters = () => {
    const clearedFilters = {
      search: "",
      sortBy: "created_at",
      sortOrder: "desc",
      dateFrom: "",
      dateTo: "",
      national: "",
      designation: "", // New filter
    };
    setLocalFilters(clearedFilters);
    onFiltersChange(clearedFilters);
  };

  const hasActiveFilters = Object.entries(localFilters).some(([key, value]) => {
    if (key === "sortBy" && value === "created_at") return false;
    if (key === "sortOrder" && value === "desc") return false;
    return value && value !== "";
  });

  return (
    <div className="bg-white rounded-lg border border-gray-200 mb-6">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <h3 className="text-lg font-medium text-gray-900">Filters</h3>
            {hasActiveFilters && (
              <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">Active</span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={clearFilters}
              className="text-sm text-blue-600 hover:text-blue-800"
              disabled={!hasActiveFilters}
            >
              Clear All
            </button>
            <button onClick={() => setIsCollapsed(!isCollapsed)} className="text-gray-500 hover:text-gray-700">
              {isCollapsed ? "▼" : "▲"}
            </button>
          </div>
        </div>
      </div>

      {!isCollapsed && (
        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
              <EnhancedSearch
                value={localFilters.search}
                onChange={(value) => handleFilterChange("search", value)}
                onClear={() => handleFilterChange("search", "")}
              />
            </div>

            {/* Sort By */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
              <select
                value={localFilters.sortBy}
                onChange={(e) => handleFilterChange("sortBy", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="created_at">Created Date</option>
                <option value="name">Name</option>
                <option value="designation">Designation</option>
              </select>
            </div>

            {/* Sort Order */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Order</label>
              <select
                value={localFilters.sortOrder}
                onChange={(e) => handleFilterChange("sortOrder", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="desc">Newest First</option>
                <option value="asc">Oldest First</option>
              </select>
            </div>

            {/* National / International */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Allotment</label>
              <select
                value={localFilters.national || ""}
                onChange={(e) => handleFilterChange("national", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Any</option>
                <option value="national">National</option>
                <option value="international">International</option>
                <option value="null">Unassigned (null)</option>
              </select>
            </div>

            {/* New Designation Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Designation</label>
              <input
                type="text"
                value={localFilters.designation || ""}
                onChange={(e) => handleFilterChange("designation", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Filter by designation"
              />
            </div>

            {/* Date From */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
              <input
                type="date"
                value={localFilters.dateFrom}
                onChange={(e) => handleFilterChange("dateFrom", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Date To - moved to a second row or adjust grid as needed */}
            <div className="md:col-span-2 lg:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
              <input
                type="date"
                value={localFilters.dateTo}
                onChange={(e) => handleFilterChange("dateTo", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Description Filled/Empty */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <select
                value={localFilters.descriptionStatus || ""}
                onChange={(e) => handleFilterChange("descriptionStatus", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Any</option>
                <option value="filled">Filled</option>
                <option value="empty">Empty / Null</option>
              </select>
            </div>

            {/* Designation Filled/Empty */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Designation</label>
              <select
                value={localFilters.designationStatus || ""}
                onChange={(e) => handleFilterChange("designationStatus", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Any</option>
                <option value="filled">Filled</option>
                <option value="empty">Empty / Null</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Pagination Component
const Pagination = ({
  currentPage,
  totalPages,
  filters,
}: {
  currentPage: number;
  totalPages: number;
  filters: any;
}) => {
  const pages = [];
  const maxVisiblePages = 5;

  let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
  const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

  if (endPage - startPage + 1 < maxVisiblePages) {
    startPage = Math.max(1, endPage - maxVisiblePages + 1);
  }

  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  const buildUrl = (page: number) => {
    const params = new URLSearchParams();
    params.set("page", page.toString());

    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== "") {
        params.set(key, value as string);
      }
    });

    return `?${params.toString()}`;
  };

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between mt-8 px-4 py-3 bg-white border border-gray-200 rounded-lg">
      <div className="text-sm text-gray-700">
        Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
      </div>

      <div className="flex items-center space-x-2">
        {currentPage > 1 && (
          <Link
            href={buildUrl(currentPage - 1)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700 transition-colors"
          >
            Previous
          </Link>
        )}

        {startPage > 1 && (
          <>
            <Link
              href={buildUrl(1)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700 transition-colors"
            >
              1
            </Link>
            {startPage > 2 && <span className="text-gray-500 px-2">...</span>}
          </>
        )}

        {pages.map((page) => (
          <Link
            key={page}
            href={buildUrl(page)}
            className={`px-3 py-2 text-sm border rounded-md transition-colors ${
              page === currentPage
                ? "bg-blue-500 text-white border-blue-500"
                : "border-gray-300 hover:bg-gray-50 text-gray-700"
            }`}
          >
            {page}
          </Link>
        ))}

        {endPage < totalPages && (
          <>
            {endPage < totalPages - 1 && <span className="text-gray-500 px-2">...</span>}
            <Link
              href={buildUrl(totalPages)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700 transition-colors"
            >
              {totalPages}
            </Link>
          </>
        )}

        {currentPage < totalPages && (
          <Link
            href={buildUrl(currentPage + 1)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700 transition-colors"
          >
            Next
          </Link>
        )}
      </div>
    </div>
  );
};

// Main Component
export default function AuthorsPage({ authors, total, currentPage, totalPages, filters }: AuthorsPageProps) {
  const [selectedAuthor, setSelectedAuthor] = useState<Author | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingAuthor, setEditingAuthor] = useState<Author | null>(null);
  const [deleteRecordCount, setDeleteRecordCount] = useState(0);
  const [selectedAuthors, setSelectedAuthors] = useState<number[]>([]);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "warning"; visible: boolean }>({
    message: "",
    type: "success",
    visible: false,
  });

  const showToast = (message: string, type: "success" | "error" | "warning") => {
    setToast({ message, type, visible: true });
  };

  const hideToast = () => {
    setToast((prev) => ({ ...prev, visible: false }));
  };

  const openDetailsModal = (author: Author) => {
    setSelectedAuthor(author);
    setIsDetailsModalOpen(true);
  };

  const openCreateModal = () => {
    setEditingAuthor(null);
    setIsFormModalOpen(true);
  };

  const openEditModal = (author: Author) => {
    setEditingAuthor(author);
    setIsFormModalOpen(true);
    setIsDetailsModalOpen(false);
  };

  const openDeleteModal = async (author: Author) => {
    setSelectedAuthor(author);
    try {
      const response = await fetch(`/api/authors/${author.id}/records/count`);
      const data = await response.json();
      setDeleteRecordCount(data.count || 0);
    } catch (error) {
      console.error("Error fetching record count:", error);
      setDeleteRecordCount(0);
    }
    setIsDeleteModalOpen(true);
    setIsDetailsModalOpen(false);
  };

  const handleSaveAuthor = async (authorData: Partial<Author>) => {
    try {
      const method = editingAuthor ? "PUT" : "POST";
      const url = editingAuthor ? `/api/authors/${editingAuthor.id}` : "/api/authors";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authorData),
      });

      if (response.ok) {
        setIsFormModalOpen(false);
        setEditingAuthor(null);
        showToast(`Author ${editingAuthor ? "updated" : "created"} successfully!`, "success");
        setTimeout(() => window.location.reload(), 1000);
      } else {
        const error = await response.json();
        showToast(`Error: ${error.message}`, "error");
      }
    } catch (error) {
      console.error("Error saving author:", error);
      showToast("Error saving author", "error");
    }
  };

  const handleDeleteAuthor = async () => {
    if (!selectedAuthor) return;

    try {
      const response = await fetch(`/api/authors/${selectedAuthor.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setIsDeleteModalOpen(false);
        setSelectedAuthor(null);
        showToast("Author deleted successfully!", "success");
        setTimeout(() => window.location.reload(), 1000);
      } else {
        const error = await response.json();
        showToast(`Error: ${error.message}`, "error");
      }
    } catch (error) {
      console.error("Error deleting author:", error);
      showToast("Error deleting author", "error");
    }
  };

  const handleBulkDelete = async () => {
    if (selectedAuthors.length === 0) return;

    if (!confirm(`Are you sure you want to delete ${selectedAuthors.length} author(s)?`)) {
      return;
    }

    try {
      const response = await fetch("/api/authors/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorIds: selectedAuthors }),
      });

      if (response.ok) {
        const result = await response.json();
        setSelectedAuthors([]);
        showToast(
          `Successfully deleted ${result.deletedAuthors} author(s) and ${result.deletedRecords} related record(s)!`,
          "success",
        );
        setTimeout(() => window.location.reload(), 1000);
      } else {
        const error = await response.json();
        showToast(`Error: ${error.message}`, "error");
      }
    } catch (error) {
      console.error("Error in bulk delete:", error);
      showToast("Error deleting authors", "error");
    }
  };

  const handleFiltersChange = (newFilters: any) => {
    const params = new URLSearchParams();
    params.set("page", "1");

    Object.entries(newFilters).forEach(([key, value]) => {
      if (value && value !== "") {
        params.set(key, value as string);
      }
    });

    window.location.href = `?${params.toString()}`;
  };

  const handleAuthorSelection = (authorId: number, selected: boolean) => {
    if (selected) {
      setSelectedAuthors([...selectedAuthors, authorId]);
    } else {
      setSelectedAuthors(selectedAuthors.filter((id) => id !== authorId));
    }
  };

  const handleSelectAll = () => {
    if (selectedAuthors.length === authors.length) {
      setSelectedAuthors([]);
    } else {
      setSelectedAuthors(authors.map((author) => author.id));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-full px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link href="/" className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-6 transition-colors">
            ← Back to main table
          </Link>
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2">Authors Management</h1>
              <p className="text-gray-600">
                {total} author{total !== 1 ? "s" : ""} total
                {selectedAuthors.length > 0 && (
                  <span className="ml-2 text-blue-600">• {selectedAuthors.length} selected</span>
                )}
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <ExportImportActions onRefresh={() => window.location.reload()} />
              <button
                onClick={openCreateModal}
                className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium shadow-sm"
              >
                + Create Author
              </button>
            </div>
          </div>
        </div>

        {/* Stats */}
        {/* <AuthorStats /> */}

        {/* Bulk Actions */}
        <BulkActions
          selectedAuthors={selectedAuthors}
          onBulkDelete={handleBulkDelete}
          onClearSelection={() => setSelectedAuthors([])}
        />

        {/* Filters */}
        <FiltersComponent filters={filters} onFiltersChange={handleFiltersChange} />

        {/* Authors Grid */}
        {authors.length > 0 ? (
          <>
            {/* Select All */}
            <div className="mb-4 flex items-center justify-between">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={selectedAuthors.length === authors.length && authors.length > 0}
                  onChange={handleSelectAll}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 mr-2"
                />
                <span className="text-sm text-gray-700">Select all ({authors.length} on this page)</span>
              </label>
              <div className="text-sm text-gray-500">
                Showing {(currentPage - 1) * 20 + 1}-{Math.min(currentPage * 20, total)} of {total}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {authors.map((author) => (
                <SelectableAuthorCard
                  key={author.id}
                  author={author}
                  isSelected={selectedAuthors.includes(author.id)}
                  onSelect={(selected) => handleAuthorSelection(author.id, selected)}
                  onClick={() => openDetailsModal(author)}
                  onEdit={() => openEditModal(author)}
                  onDelete={() => openDeleteModal(author)}
                />
              ))}
            </div>

            {/* Pagination */}
            <Pagination currentPage={currentPage} totalPages={totalPages} filters={filters} />
          </>
        ) : (
          <div className="text-center py-20">
            <div className="text-6xl text-gray-300 mb-4">👤</div>
            <h3 className="text-xl font-medium text-gray-900 mb-2">No authors found</h3>
            <p className="text-gray-600 mb-6">
              {filters.search || filters.dateFrom || filters.dateTo
                ? "Try adjusting your filters or search terms."
                : "Get started by creating your first author."}
            </p>
            {!filters.search && !filters.dateFrom && !filters.dateTo && (
              <button
                onClick={openCreateModal}
                className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Create First Author
              </button>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      <AuthorDetailsModal
        author={selectedAuthor}
        isOpen={isDetailsModalOpen}
        onClose={() => {
          setIsDetailsModalOpen(false);
          setSelectedAuthor(null);
        }}
        onEdit={() => openEditModal(selectedAuthor!)}
        onDelete={() => openDeleteModal(selectedAuthor!)}
      />

      <EnhancedAuthorFormModal
        author={editingAuthor}
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false);
          setEditingAuthor(null);
        }}
        onSave={handleSaveAuthor}
      />

      <DeleteConfirmationModal
        author={selectedAuthor}
        recordCount={deleteRecordCount}
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setSelectedAuthor(null);
        }}
        onConfirm={handleDeleteAuthor}
        loading={false}
      />

      {/* Toast Notifications */}
      <Toast message={toast.message} type={toast.type} isVisible={toast.visible} onClose={hideToast} />
    </div>
  );
}

// Updated getServerSideProps with enhanced filters
export const getServerSideProps: GetServerSideProps = async (context) => {
  const page = parseInt(context.query.page as string) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;

  const filters = {
    search: (context.query.search as string) || "",
    sortBy: (context.query.sortBy as string) || "name",
    sortOrder: (context.query.sortOrder as string) || "asc",
    dateFrom: (context.query.dateFrom as string) || "",
    dateTo: (context.query.dateTo as string) || "",
    national: (context.query.national as string) || "",
    designation: (context.query.designation as string) || "",
    designationStatus: (context.query.designationStatus as string) || "",
    descriptionStatus: (context.query.descriptionStatus as string) || "",
  };

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  try {
    // Updated to include new fields in select
    let query = supabase
      .from("authors")
      .select("id, name, description, cover_url, created_at, national, designation, short_name", { count: "exact" });
    let countQuery = supabase.from("authors").select("*", { count: "exact", head: true });

    // Search filter - updated to include designation
    if (filters.search) {
      const searchFilter = `name.ilike.%${filters.search}%,description.ilike.%${filters.search}%,designation.ilike.%${filters.search}%`;
      query = query.or(searchFilter);
      countQuery = countQuery.or(searchFilter);
    }

    // Date filters
    if (filters.dateFrom) {
      query = query.gte("created_at", `${filters.dateFrom}T00:00:00.000Z`);
      countQuery = countQuery.gte("created_at", `${filters.dateFrom}T00:00:00.000Z`);
    }
    if (filters.dateTo) {
      query = query.lte("created_at", `${filters.dateTo}T23:59:59.999Z`);
      countQuery = countQuery.lte("created_at", `${filters.dateTo}T23:59:59.999Z`);
    }

    // National filter
    if (filters.national === "national") {
      query = query.eq("national", "national");
      countQuery = countQuery.eq("national", "national");
    } else if (filters.national === "international") {
      query = query.eq("national", "international");
      countQuery = countQuery.eq("national", "international");
    } else if (filters.national === "null") {
      query = query.is("national", null);
      countQuery = countQuery.is("national", null);
    }

    // New designation filter
    if (filters.designation) {
      query = query.ilike("designation", `%${filters.designation}%`);
      countQuery = countQuery.ilike("designation", `%${filters.designation}%`);
    }

    // Description filled/empty filter
    if (filters.descriptionStatus === "empty") {
      query = query.or("description.is.null,description.eq.");
      countQuery = countQuery.or("description.is.null,description.eq.");
    } else if (filters.descriptionStatus === "filled") {
      query = query.not("description", "is", null).not("description", "eq", "");
      countQuery = countQuery.not("description", "is", null).not("description", "eq", "");
    }

    // Designation filled/empty filter
    if (filters.designationStatus === "empty") {
      query = query.or("designation.is.null,designation.eq.");
      countQuery = countQuery.or("designation.is.null,designation.eq.");
    } else if (filters.designationStatus === "filled") {
      query = query.not("designation", "is", null).not("designation", "eq", "");
      countQuery = countQuery.not("designation", "is", null).not("designation", "eq", "");
    }

    // Sorting - updated to include designation as valid sort option
    const validSortFields = ["id", "name", "created_at", "designation"];
    const sortBy = validSortFields.includes(filters.sortBy) ? filters.sortBy : "name";
    const ascending = filters.sortOrder === "asc";
    query = query.order(sortBy, { ascending });

    // Pagination
    query = query.range(offset, offset + limit - 1);

    const [{ data: authors, error }, { count }] = await Promise.all([query, countQuery]);

    if (error) throw error;

    const totalPages = Math.ceil((count || 0) / limit);

    return {
      props: {
        authors: authors || [],
        total: count || 0,
        currentPage: page,
        totalPages,
        filters,
      },
    };
  } catch (error) {
    console.error("Error fetching authors:", error);
    return {
      props: {
        authors: [],
        total: 0,
        currentPage: 1,
        totalPages: 0,
        filters,
      },
    };
  }
};
