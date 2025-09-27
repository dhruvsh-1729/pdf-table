import { useState, useEffect } from "react";
import Link from "next/link";
import { GetServerSideProps } from "next";
import { createClient } from "@supabase/supabase-js";
import {
  LoadingSpinner,
  Toast,
  EnhancedTagFormModal,
  TagStats,
  ExportImportActions,
  BulkActions,
  SelectableTagCard,
  EnhancedSearch,
} from "../../components/TagManagement";

// Types
interface Tag {
  id: number;
  name: string;
  important: boolean | null;
  created_at: string;
  recordsCount?: number;
}

interface TagRecord {
  id: number;
  name: string;
  timestamp: string | null;
  volume: string | null;
  number: string | null;
  title_name: string | null;
}

interface TagsPageProps {
  tags: Tag[];
  total: number;
  currentPage: number;
  totalPages: number;
  filters: {
    search: string;
    sortBy: string;
    sortOrder: string;
    dateFrom: string;
    dateTo: string;
    important?: "true" | "false" | "null" | "";
    minRecords?: string; // "", "0", "1", "5", "10", "50"
  };
}

// Tag Details Modal with Records
const TagDetailsModal = ({
  tag,
  isOpen,
  onClose,
  onEdit,
  onDelete,
}: {
  tag: Tag | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) => {
  const [records, setRecords] = useState<TagRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [recordsPage, setRecordsPage] = useState(1);
  const [hasMoreRecords, setHasMoreRecords] = useState(true);

  useEffect(() => {
    if (tag && isOpen) {
      fetchTagRecords(tag.id);
    }
  }, [tag, isOpen]);

  const fetchTagRecords = async (tagId: number, page = 1) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/tags/${tagId}/records?page=${page}`);
      const data = await response.json();

      // Convert object with numeric keys to an array if needed
      const recordsArray = data.records;

      // Extract hasMore property if it exists
      const hasMore = data.hasMore !== undefined ? data.hasMore : false;

      if (page === 1) {
        setRecords(recordsArray || []);
      } else {
        setRecords((prev) => [...prev, ...recordsArray]);
      }

      setHasMoreRecords(hasMore);
      setRecordsPage(page);
    } catch (error) {
      console.error("Error fetching tag records:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadMoreRecords = () => {
    if (tag && hasMoreRecords && !loading) {
      fetchTagRecords(tag.id, recordsPage + 1);
    }
  };

  if (!isOpen || !tag) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        className="bg-white rounded-lg max-w-4xl w-full p-6 relative max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 text-xl">
          ×
        </button>

        {/* Tag Info */}
        <div className="flex items-center mb-6">
          <div className="flex-1">
            <h2 className="text-2xl font-semibold text-gray-900">{tag.name}</h2>
            <p className="text-sm text-gray-500">
              Created on{" "}
              {new Date(tag.created_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
          {typeof tag.important !== "undefined" && (
            <div className="mt-1">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${
                  tag.important === true
                    ? "bg-red-100 text-red-800"
                    : tag.important === false
                      ? "bg-green-100 text-green-800"
                      : "bg-gray-100 text-gray-600"
                }`}
              >
                {tag.important === true ? "Important" : tag.important === false ? "Normal" : "Unassigned"}
              </span>
            </div>
          )}

          <div className="flex space-x-2 mr-2">
            <button
              onClick={onEdit}
              className="px-4 py-2 bg-blue-100 text-black rounded-lg hover:bg-blue-200 transition-colors"
            >
              Edit Tag
            </button>
            <button
              onClick={onDelete}
              className="px-4 py-2 bg-green-100 text-black rounded-lg hover:bg-green-200 transition-colors"
            >
              Delete Tag
            </button>
          </div>
        </div>

        {/* Records Section */}
        <div>
          <h3 className="text-xl font-medium text-gray-900 mb-4 flex items-center">
            Tagged Records
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
                        <span className="font-medium text-gray-600">Title:</span>
                        <p className="text-gray-800">{record.title_name}</p>
                      </div>
                    )}
                    {record.timestamp && (
                      <div>
                        <span className="font-medium text-gray-600">Timestamp:</span>
                        <p className="text-gray-800">{record.timestamp}</p>
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
              <div className="text-gray-400 mb-2">#</div>
              <p className="text-gray-600">No records found for this tag.</p>
              <p className="text-sm text-gray-500 mt-1">
                Records will appear here when this tag is associated with publications.
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
  tag,
  recordCount,
  isOpen,
  onClose,
  onConfirm,
  loading,
}: {
  tag: Tag | null;
  recordCount: number;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}) => {
  if (!isOpen || !tag) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-md w-full p-6 relative" onClick={(e) => e.stopPropagation()}>
        <div className="text-center mb-6">
          <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <span className="text-red-600 text-xl">⚠️</span>
          </div>
          <h2 className="text-xl font-semibold mb-2 text-gray-900">Delete Tag</h2>
          <p className="text-gray-600">
            Are you sure you want to delete <strong>#{tag.name}</strong>?
          </p>
        </div>

        {recordCount > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-start">
              <span className="text-red-500 mr-2">⚠️</span>
              <div>
                <p className="text-red-800 font-medium">Warning: Data Loss</p>
                <p className="text-red-700 text-sm mt-1">
                  This tag is associated with <strong>{recordCount}</strong> record(s). Deleting this tag will remove
                  these associations but the records themselves will remain.
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
            {loading ? "Deleting..." : "Delete Tag"}
          </button>
        </div>
      </div>
    </div>
  );
};

// Filters Component
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
      important: "",
      hasRecords: "", // <— ADD
      minRecords: "",
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
            <div className="col-span-2">
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

            {/* Date To */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
              <input
                type="date"
                value={localFilters.dateTo}
                onChange={(e) => handleFilterChange("dateTo", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Important */}
            <div className="col-span-2 md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={localFilters.important || ""}
                onChange={(e) => handleFilterChange("important", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Any</option>
                <option value="true">Important</option>
                <option value="false">Normal</option>
                <option value="null">Unassigned</option>
              </select>
            </div>

            {/* Has Records */}
            <div className="col-span-2 md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Attachment</label>
              <select
                value={localFilters.hasRecords || ""}
                onChange={(e) => handleFilterChange("hasRecords", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Any</option>
                <option value="with">Attached to at least one record</option>
                <option value="without">No records attached</option>
              </select>
            </div>

            {/* Records Count */}
            <div className="col-span-2 md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Records Count</label>
              <select
                value={localFilters.minRecords || ""}
                onChange={(e) => handleFilterChange("minRecords", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Any</option>
                <option value="0">0 (no records)</option>
                <option value="1">1+</option>
                <option value="2">2+</option>
                <option value="3">3+</option>
                <option value="4">4+</option>
                <option value="5">5+</option>
                <option value="6">6+</option>
                <option value="7">7+</option>
                <option value="8">8+</option>
                <option value="9">9+</option>
                <option value="10">10+</option>
                <option value="50">50+</option>
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
export default function TagsPage({ tags, total, currentPage, totalPages, filters }: TagsPageProps) {
  const [selectedTag, setSelectedTag] = useState<Tag | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [deleteRecordCount, setDeleteRecordCount] = useState(0);
  const [selectedTags, setSelectedTags] = useState<number[]>([]);
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

  const openDetailsModal = (tag: Tag) => {
    setSelectedTag(tag);
    setIsDetailsModalOpen(true);
  };

  const openCreateModal = () => {
    setEditingTag(null);
    setIsFormModalOpen(true);
  };

  const openEditModal = (tag: Tag) => {
    setEditingTag(tag);
    setIsFormModalOpen(true);
    setIsDetailsModalOpen(false);
  };

  const openDeleteModal = async (tag: Tag) => {
    setSelectedTag(tag);
    try {
      const response = await fetch(`/api/tags/${tag.id}/records/count`);
      const data = await response.json();
      setDeleteRecordCount(data.count || 0);
    } catch (error) {
      console.error("Error fetching record count:", error);
      setDeleteRecordCount(0);
    }
    setIsDeleteModalOpen(true);
    setIsDetailsModalOpen(false);
  };

  const handleSaveTag = async (tagData: Partial<Tag>) => {
    try {
      const method = editingTag ? "PUT" : "POST";
      const url = editingTag ? `/api/tags/${editingTag.id}` : "/api/tags";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tagData),
      });

      if (response.ok) {
        setIsFormModalOpen(false);
        setEditingTag(null);
        showToast(`Tag ${editingTag ? "updated" : "created"} successfully!`, "success");
        setTimeout(() => window.location.reload(), 1000);
      } else {
        const error = await response.json();
        showToast(`Error: ${error.message}`, "error");
      }
    } catch (error) {
      console.error("Error saving tag:", error);
      showToast("Error saving tag", "error");
    }
  };

  const handleDeleteTag = async () => {
    if (!selectedTag) return;

    try {
      const response = await fetch(`/api/tags/${selectedTag.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setIsDeleteModalOpen(false);
        setSelectedTag(null);
        showToast("Tag deleted successfully!", "success");
        setTimeout(() => window.location.reload(), 1000);
      } else {
        const error = await response.json();
        showToast(`Error: ${error.message}`, "error");
      }
    } catch (error) {
      console.error("Error deleting tag:", error);
      showToast("Error deleting tag", "error");
    }
  };

  const handleBulkDelete = async () => {
    if (selectedTags.length === 0) return;

    if (!confirm(`Are you sure you want to delete ${selectedTags.length} tag(s)?`)) {
      return;
    }

    try {
      const response = await fetch("/api/tags/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagIds: selectedTags }),
      });

      if (response.ok) {
        const result = await response.json();
        setSelectedTags([]);
        showToast(
          `Successfully deleted ${result.deletedTags} tag(s) and ${result.deletedRecords} related record associations!`,
          "success",
        );
        setTimeout(() => window.location.reload(), 1000);
      } else {
        const error = await response.json();
        showToast(`Error: ${error.message}`, "error");
      }
    } catch (error) {
      console.error("Error in bulk delete:", error);
      showToast("Error deleting tags", "error");
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

  const handleTagSelection = (tagId: number, selected: boolean) => {
    if (selected) {
      setSelectedTags([...selectedTags, tagId]);
    } else {
      setSelectedTags(selectedTags.filter((id) => id !== tagId));
    }
  };

  const handleSelectAll = () => {
    if (selectedTags.length === tags.length) {
      setSelectedTags([]);
    } else {
      setSelectedTags(tags.map((tag) => tag.id));
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
              <h1 className="text-4xl font-bold text-gray-900 mb-2">Tags Management</h1>
              <p className="text-gray-600">
                {total} tag{total !== 1 ? "s" : ""} total
                {selectedTags.length > 0 && (
                  <span className="ml-2 text-blue-600">• {selectedTags.length} selected</span>
                )}
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <ExportImportActions onRefresh={() => window.location.reload()} />
              <button
                onClick={openCreateModal}
                className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium shadow-sm"
              >
                + Create Tag
              </button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <TagStats />

        {/* Bulk Actions */}
        <BulkActions
          selectedTags={selectedTags}
          onBulkDelete={handleBulkDelete}
          onClearSelection={() => setSelectedTags([])}
        />

        {/* Filters */}
        <FiltersComponent filters={filters} onFiltersChange={handleFiltersChange} />

        {/* Tags Grid */}
        {tags.length > 0 ? (
          <>
            {/* Select All */}
            <div className="mb-4 flex items-center justify-between">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={selectedTags.length === tags.length && tags.length > 0}
                  onChange={handleSelectAll}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 mr-2"
                />
                <span className="text-sm text-gray-700">Select all ({tags.length} on this page)</span>
              </label>
              <div className="text-sm text-gray-500">
                Showing {(currentPage - 1) * 20 + 1}-{Math.min(currentPage * 20, total)} of {total}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {tags.map((tag) => (
                <div key={tag.id} className="relative">
                  {/* Count badge */}
                  {/* <div className="absolute -top-2 -right-2 z-10 bg-indigo-600 text-white text-xs px-2 py-1 rounded-full shadow">
                    {typeof tag.recordsCount === "number" ? `${tag.recordsCount} records` : "—"}
                  </div> */}

                  <SelectableTagCard
                    tag={tag}
                    isSelected={selectedTags.includes(tag.id)}
                    onSelect={(selected) => handleTagSelection(tag.id, selected)}
                    onClick={() => openDetailsModal(tag)}
                    onEdit={() => openEditModal(tag)}
                    onDelete={() => openDeleteModal(tag)}
                  />
                </div>
              ))}
            </div>

            {/* Pagination */}
            <Pagination currentPage={currentPage} totalPages={totalPages} filters={filters} />
          </>
        ) : (
          <div className="text-center py-20">
            <div className="text-6xl text-gray-300 mb-4">#</div>
            <h3 className="text-xl font-medium text-gray-900 mb-2">No tags found</h3>
            <p className="text-gray-600 mb-6">
              {filters.search || filters.dateFrom || filters.dateTo
                ? "Try adjusting your filters or search terms."
                : "Get started by creating your first tag."}
            </p>
            {!filters.search && !filters.dateFrom && !filters.dateTo && (
              <button
                onClick={openCreateModal}
                className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Create First Tag
              </button>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      <TagDetailsModal
        tag={selectedTag}
        isOpen={isDetailsModalOpen}
        onClose={() => {
          setIsDetailsModalOpen(false);
          setSelectedTag(null);
        }}
        onEdit={() => openEditModal(selectedTag!)}
        onDelete={() => openDeleteModal(selectedTag!)}
      />

      <EnhancedTagFormModal
        tag={editingTag}
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false);
          setEditingTag(null);
        }}
        onSave={handleSaveTag}
      />

      <DeleteConfirmationModal
        tag={selectedTag}
        recordCount={deleteRecordCount}
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setSelectedTag(null);
        }}
        onConfirm={handleDeleteTag}
        loading={false}
      />

      {/* Toast Notifications */}
      <Toast message={toast.message} type={toast.type} isVisible={toast.visible} onClose={hideToast} />
    </div>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const page = parseInt((context.query.page as string) || "1");
  const limit = 20;
  const offset = (page - 1) * limit;

  const filters = {
    search: (context.query.search as string) || "",
    sortBy: (context.query.sortBy as string) || "created_at",
    sortOrder: (context.query.sortOrder as string) || "desc",
    dateFrom: (context.query.dateFrom as string) || "",
    dateTo: (context.query.dateTo as string) || "",
    important: (context.query.important as string) || "",
    hasRecords: (context.query.hasRecords as string) || "",
    minRecords: (context.query.minRecords as string) || "",
  };

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  try {
    // 1) Query tags with aggregated record counts
    let query = supabase.from("tags").select(
      `
        id,
        name,
        created_at,
        important,
        record_tags(count)
      `,
    );

    // Apply filters at DB level where possible
    if (filters.search) query = query.ilike("name", `%${filters.search}%`);
    if (filters.dateFrom) query = query.gte("created_at", `${filters.dateFrom}T00:00:00.000Z`);
    if (filters.dateTo) query = query.lte("created_at", `${filters.dateTo}T23:59:59.999Z`);

    if (filters.important === "true") query = query.eq("important", true);
    else if (filters.important === "false") query = query.eq("important", false);
    else if (filters.important === "null") query = query.is("important", null);

    const { data, error } = await query;

    if (error) throw error;

    // 2) Convert supabase `record_tags(count)` into usable number
    let tags = (data || []).map((t: any) => ({
      ...t,
      recordsCount: t.record_tags?.[0]?.count || 0,
    }));

    // 3) Apply hasRecords and minRecords in-memory
    if (filters.hasRecords === "with") tags = tags.filter((t) => t.recordsCount > 0);
    if (filters.hasRecords === "without") tags = tags.filter((t) => t.recordsCount === 0);

    // Special handling for minRecords=0: only tags with no records
    if (filters.minRecords === "0") {
      tags = tags.filter((t) => t.recordsCount === 0);
    } else if (filters.minRecords) {
      const min = parseInt(filters.minRecords, 10);
      if (!isNaN(min)) tags = tags.filter((t) => t.recordsCount >= min);
    }

    // 4) Sorting
    const ascending = filters.sortOrder === "asc";
    tags.sort((a, b) => {
      if (filters.sortBy === "created_at") {
        const va = new Date(a.created_at).getTime();
        const vb = new Date(b.created_at).getTime();
        return ascending ? va - vb : vb - va;
      } else {
        const va = a.name.toLowerCase();
        const vb = b.name.toLowerCase();
        if (va < vb) return ascending ? -1 : 1;
        if (va > vb) return ascending ? 1 : -1;
        return 0;
      }
    });

    // 5) Pagination
    const total = tags.length;
    const totalPages = Math.ceil(total / limit);
    const pageSlice = tags.slice(offset, offset + limit);

    return {
      props: {
        tags: pageSlice,
        total,
        currentPage: page,
        totalPages,
        filters,
      },
    };
  } catch (err) {
    console.error("Error fetching tags:", err);
    return {
      props: {
        tags: [],
        total: 0,
        currentPage: 1,
        totalPages: 0,
        filters,
      },
    };
  }
};
