// components/TagManagement.tsx
import { useState, useEffect } from "react";

// Types
interface Tag {
  id: number;
  name: string;
  important: boolean | null;
  created_at: string;
  recordsCount?: number; // <— ADD THIS
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
    hasRecords?: "with" | "without" | ""; // <— ADD THIS
  };
}

// Loading Spinner Component
const LoadingSpinner = () => (
  <div className="flex items-center justify-center p-4">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
  </div>
);

// Toast Notification Component
interface ToastProps {
  message: string;
  type: "success" | "error" | "warning";
  isVisible: boolean;
  onClose: () => void;
}

const Toast = ({ message, type, isVisible, onClose }: ToastProps) => {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onClose();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  if (!isVisible) return null;

  const bgColor = {
    success: "bg-green-500",
    error: "bg-red-500",
    warning: "bg-yellow-500",
  }[type];

  return (
    <div
      className={`fixed top-4 right-4 ${bgColor} text-white px-4 py-2 rounded-lg shadow-lg z-50 transition-all duration-300`}
    >
      <div className="flex items-center justify-between">
        <span>{message}</span>
        <button onClick={onClose} className="ml-2 text-white hover:text-gray-200">
          ×
        </button>
      </div>
    </div>
  );
};

// Enhanced Tag Form Modal with validation
const EnhancedTagFormModal = ({
  tag,
  isOpen,
  onClose,
  onSave,
}: {
  tag: Tag | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (tagData: Partial<Tag>) => Promise<void>;
}) => {
  const [formData, setFormData] = useState({
    name: "",
    important: "" as "" | "true" | "false", // empty means null
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (tag) {
      setFormData({
        name: tag.name || "",
        important: tag.important === true ? "true" : tag.important === false ? "false" : "", // null -> ""
      });
    } else {
      setFormData({ name: "", important: "" });
    }
    setErrors({});
  }, [tag, isOpen]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = "Name is required";
    } else if (formData.name.trim().length < 1) {
      newErrors.name = "Name cannot be empty";
    } else if (formData.name.trim().length > 100) {
      newErrors.name = "Name must be less than 100 characters";
    } else if (!/^[a-zA-Z0-9\s\-_]+$/.test(formData.name.trim())) {
      newErrors.name = "Name can only contain letters, numbers, spaces, hyphens, and underscores";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      await onSave({
        name: formData.name.trim(),
        important: formData.important === "true" ? true : formData.important === "false" ? false : null, // "" -> null
      });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-md w-full p-6 relative" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 text-xl"
          disabled={loading}
        >
          ×
        </button>

        <h2 className="text-xl font-semibold mb-4">{tag ? "Edit" : "Create"}</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tag Name <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">#</span>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className={`w-full pl-8 pr-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.name ? "border-red-500" : "border-gray-300"
                }`}
                disabled={loading}
                maxLength={100}
                placeholder="e.g., science, technology, research"
              />
            </div>
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
            <p className="text-xs text-gray-500 mt-1">{formData.name.length}/100 characters</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
            <select
              value={formData.important}
              onChange={(e) => setFormData({ ...formData, important: e.target.value as "" | "true" | "false" })}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.important ? "border-red-500" : "border-gray-300"
              }`}
              disabled={loading}
            >
              <option value="">Unassigned</option>
              <option value="true">Important</option>
              <option value="false">Normal</option>
            </select>
            {errors.important && <p className="text-red-500 text-xs mt-1">{errors.important}</p>}
            <p className="text-xs text-gray-500 mt-1">
              Important tags are highlighted and can be prioritized in searches
            </p>
          </div>

          <div className="flex justify-end space-x-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 flex items-center"
              disabled={loading}
            >
              {loading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>}
              {tag ? "Update Tag" : "Create Tag"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Enhanced Tag Stats Component
const TagStats = () => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch("/api/tags/stats");
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  if (!stats) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">{stats.totalTags}</h3>
        <p className="text-sm text-gray-600">Total Tags</p>
      </div>
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <h3 className="text-lg font-semibold text-green-600">{stats.recentTags}</h3>
        <p className="text-sm text-gray-600">Added (30 days)</p>
      </div>
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <h3 className="text-lg font-semibold text-red-600">{stats.importantTags}</h3>
        <p className="text-sm text-gray-600">Important Tags</p>
      </div>
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <h3 className="text-lg font-semibold text-blue-600">{stats.usedTags}</h3>
        <p className="text-sm text-gray-600">Tags in Use</p>
      </div>
    </div>
  );
};

// Export/Import Component
const ExportImportActions = ({ onRefresh }: { onRefresh: () => void }) => {
  const [importing, setImporting] = useState(false);

  const handleExport = async () => {
    try {
      const qs = window.location.search; // already has ?search=...&dateFrom=...
      const response = await fetch(`/api/tags/export${qs}`);
      if (!response.ok) throw new Error(`Export failed: ${response.statusText}`);

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tags-export-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export error:", error);
      alert("Failed to export tags. Please try again.");
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.toLowerCase().endsWith(".csv")) {
      alert("Please select a CSV file");
      event.target.value = "";
      return;
    }

    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      alert("File size must be less than 10MB");
      event.target.value = "";
      return;
    }

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/tags/import", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        alert(result.message || "Tags imported successfully");
        onRefresh();
      } else {
        console.error("Import failed:", result);
        alert(`Import failed: ${result.error}${result.details ? "\n" + result.details : ""}`);
      }
    } catch (error) {
      console.error("Import error:", error);
      alert("Import failed. Please check your file and try again.");
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  };

  return (
    <div className="flex space-x-2">
      <button onClick={handleExport} className="px-3 py-1 text-sm bg-gray-500 text-white rounded hover:bg-gray-600">
        Export
      </button>
      <div className="relative">
        <input
          type="file"
          accept=".csv"
          onChange={handleImport}
          className="absolute inset-0 opacity-0 cursor-pointer"
          disabled={importing}
        />
        <button className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50">
          {importing ? "Importing..." : "Import"}
        </button>
      </div>
    </div>
  );
};

// Bulk Actions Component
const BulkActions = ({
  selectedTags,
  onBulkDelete,
  onClearSelection,
}: {
  selectedTags: number[];
  onBulkDelete: () => void;
  onClearSelection: () => void;
}) => {
  if (selectedTags.length === 0) return null;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-blue-800">{selectedTags.length} tag(s) selected</span>
        <div className="flex space-x-2">
          <button onClick={onClearSelection} className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800">
            Clear Selection
          </button>
          <button onClick={onBulkDelete} className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600">
            Delete Selected
          </button>
        </div>
      </div>
    </div>
  );
};

// Enhanced Tag Card with Selection
const SelectableTagCard = ({
  tag,
  isSelected,
  onSelect,
  onClick,
  onEdit,
  onDelete,
}: {
  tag: Tag;
  isSelected: boolean;
  onSelect: (selected: boolean) => void;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) => {
  return (
    <div
      className={`bg-white border rounded-lg p-4 hover:shadow-lg transition-shadow relative group ${
        isSelected ? "border-blue-500 bg-blue-50" : "border-gray-200"
      }`}
    >
      {/* Selection Checkbox */}
      <div className="absolute top-2 left-2">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onSelect(e.target.checked)}
          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
        />
      </div>

      <div className="flex items-center mb-3 ml-6 cursor-pointer" onClick={onClick}>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900 truncate">#{tag.name}</h3>
          {/* <p className="text-sm text-gray-500">{new Date(tag.created_at).toLocaleDateString()}</p> */}
        </div>
      </div>

      <div className="ml-6 gap-2 flex items-center text-xs text-gray-600">
        {tag.important === true ? (
          <span className="bg-red-100 text-red-800 px-1.5 py-0.5 rounded font-medium">Important</span>
        ) : tag.important === false ? (
          <span className="bg-green-100 text-green-800 px-1.5 py-0.5 rounded">Normal</span>
        ) : (
          <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">Unassigned</span>
        )}

        {typeof tag.recordsCount === "number" && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-green-100 text-gray-600">
            {tag.recordsCount} Records
          </span>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity mt-3">
        <button onClick={onEdit} className="px-2 py-1 text-xs bg-blue-300 text-black rounded hover:bg-blue-400">
          Edit
        </button>
        <button onClick={onDelete} className="px-2 py-1 text-xs bg-green-300 text-black rounded hover:bg-green-400">
          Delete
        </button>
      </div>
    </div>
  );
};

// Enhanced Search Component with Autocomplete
const EnhancedSearch = ({
  value,
  onChange,
  onClear,
}: {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
}) => {
  const [suggestions, setSuggestions] = useState<Tag[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchSuggestions = async (query: string) => {
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/tags/search?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      setSuggestions(data);
    } catch (error) {
      console.error("Error fetching suggestions:", error);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      if (value && showSuggestions) {
        fetchSuggestions(value);
      }
    }, 600);

    return () => clearTimeout(debounceTimer);
  }, [value, showSuggestions]);

  return (
    <div className="relative">
      <div className="relative">
        <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">#</span>
        <input
          type="text"
          placeholder="Search tags by name"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          className="w-full pl-8 pr-10 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {value && (
          <button
            onClick={onClear}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        )}
      </div>

      {/* Suggestions Dropdown */}
      {showSuggestions && (suggestions.length > 0 || loading) && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg">
          {loading ? (
            <div className="p-3 text-center text-sm text-gray-500">Searching...</div>
          ) : (
            suggestions.map((tag) => (
              <div
                key={tag.id}
                className="p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                onClick={() => {
                  onChange(tag.name);
                  setShowSuggestions(false);
                }}
              >
                <div className="flex items-center">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900">#{tag.name}</div>
                    {tag.important === true && (
                      <span className="text-xs bg-red-100 text-red-800 px-1 rounded">Important</span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export {
  LoadingSpinner,
  Toast,
  EnhancedTagFormModal,
  TagStats,
  ExportImportActions,
  BulkActions,
  SelectableTagCard,
  EnhancedSearch,
};
