// components/AuthorManagement.tsx
import { useState, useEffect } from "react";
// Types

interface Author {
  id: number;
  name: string;
  description: string | null;
  cover_url: string | null;
  created_at: string;
  national: "national" | "international" | null; // <-- add
}

interface AuthorRecord {
  id: number;
  name: string;
  timestamp: string | null;
  volume: string | null;
  number: string | null;
  title_name: string | null;
}

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

// Enhanced Author Form Modal with validation
const EnhancedAuthorFormModal = ({
  author,
  isOpen,
  onClose,
  onSave,
}: {
  author: Author | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (authorData: Partial<Author>) => Promise<void>;
}) => {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    cover_url: "",
    national: "" as "" | "national" | "international", // empty means null
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (author) {
      setFormData({
        name: author.name || "",
        description: author.description || "",
        cover_url: author.cover_url || "",
        national: (author.national as "national" | "international" | null) ?? "", // null -> ""
      });
    } else {
      setFormData({ name: "", description: "", cover_url: "", national: "" });
    }
    setErrors({});
  }, [author, isOpen]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = "Name is required";
    } else if (formData.name.trim().length < 2) {
      newErrors.name = "Name must be at least 2 characters";
    }

    if (formData.description && formData.description.length > 4000) {
      newErrors.description = "Description must be less than 4000 characters";
    }

    if (formData.cover_url && !isValidUrl(formData.cover_url)) {
      newErrors.cover_url = "Please enter a valid URL";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const isValidUrl = (string: string): boolean => {
    try {
      new URL(string);
      return true;
    } catch {
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      await onSave({
        name: formData.name,
        description: formData.description || null,
        cover_url: formData.cover_url || null,
        national: formData.national || null, // "" -> null
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

        <h2 className="text-xl font-semibold mb-4">{author ? "Edit Author" : "Create Author"}</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.name ? "border-red-500" : "border-gray-300"
              }`}
              disabled={loading}
              maxLength={255}
            />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.description ? "border-red-500" : "border-gray-300"
              }`}
              rows={8}
              disabled={loading}
              maxLength={4000}
            />
            {errors.description && <p className="text-red-500 text-xs mt-1">{errors.description}</p>}
            <p className="text-xs text-gray-500 mt-1">{formData.description.length}/4000 characters</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cover Image URL</label>
            <input
              type="url"
              value={formData.cover_url}
              onChange={(e) => setFormData({ ...formData, cover_url: e.target.value })}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.cover_url ? "border-red-500" : "border-gray-300"
              }`}
              disabled={loading}
              placeholder="https://example.com/image.jpg"
            />
            {errors.cover_url && <p className="text-red-500 text-xs mt-1">{errors.cover_url}</p>}
          </div>

          {/* Image Preview */}
          {formData.cover_url && !errors.cover_url && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Preview</label>
              <img
                src={formData.cover_url}
                alt="Preview"
                className="w-16 h-16 rounded-full object-cover border border-gray-300"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                  setErrors({ ...errors, cover_url: "Invalid image URL" });
                }}
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Allotment</label>
            <select
              value={formData.national}
              onChange={(e) =>
                setFormData({ ...formData, national: e.target.value as "" | "national" | "international" })
              }
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.national ? "border-red-500" : "border-gray-300"
              }`}
              disabled={loading}
            >
              <option value="">Unassigned</option>
              <option value="national">National</option>
              <option value="international">International</option>
            </select>
            {errors.national && <p className="text-red-500 text-xs mt-1">{errors.national}</p>}
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
              {author ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Enhanced Author Stats Component
const AuthorStats = () => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch("/api/authors/stats");
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
        <h3 className="text-lg font-semibold text-gray-900">{stats.totalAuthors}</h3>
        <p className="text-sm text-gray-600">Total Authors</p>
      </div>
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <h3 className="text-lg font-semibold text-green-600">{stats.recentAuthors}</h3>
        <p className="text-sm text-gray-600">Added (30 days)</p>
      </div>
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <h3 className="text-lg font-semibold text-blue-600">{stats.completionRate.description}%</h3>
        <p className="text-sm text-gray-600">With Description</p>
      </div>
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <h3 className="text-lg font-semibold text-purple-600">{stats.completionRate.coverImage}%</h3>
        <p className="text-sm text-gray-600">With Cover Image</p>
      </div>
    </div>
  );
};

// Export/Import Component
const ExportImportActions = ({ onRefresh }: { onRefresh: () => void }) => {
  const [importing, setImporting] = useState(false);

  // Updated handleExport function for CSV
  // Example: in AuthorsPage component
  const handleExport = async () => {
    try {
      const qs = window.location.search; // already has ?search=...&dateFrom=...
      const response = await fetch(`/api/authors/export${qs}`);
      if (!response.ok) throw new Error(`Export failed: ${response.statusText}`);

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `authors-export-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export error:", error);
      alert("Failed to export authors. Please try again.");
    }
  };

  // Updated handleImport function for CSV with better error handling
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

      const response = await fetch("/api/authors/import", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        // Success
        alert(result.message || "Authors imported successfully");
        onRefresh();
      } else {
        // Error from server
        console.error("Import failed:", result);
        alert(`Import failed: ${result.error}${result.details ? "\n" + result.details : ""}`);
      }
    } catch (error) {
      console.error("Import error:", error);
      alert("Import failed. Please check your file and try again.");
    } finally {
      setImporting(false);
      // Reset file input
      event.target.value = "";
    }
  };

  // Sample CSV structure for reference
  const SAMPLE_CSV_STRUCTURE = `id,name,description,cover_url,national,created_at
1,"John Doe","Famous novelist","https://example.com/john.jpg","American","2024-01-15T10:00:00Z"
2,"Jane Smith","Science fiction writer","https://example.com/jane.jpg","British","2024-01-16T11:30:00Z"
,"New Author","Leave ID empty for new authors","","Canadian",""`;

  // Helper function to download sample CSV template
  const downloadSampleCSV = () => {
    const blob = new Blob([SAMPLE_CSV_STRUCTURE], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "authors-template.csv";
    a.click();
    window.URL.revokeObjectURL(url);
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
  selectedAuthors,
  onBulkDelete,
  onClearSelection,
}: {
  selectedAuthors: number[];
  onBulkDelete: () => void;
  onClearSelection: () => void;
}) => {
  if (selectedAuthors.length === 0) return null;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-blue-800">{selectedAuthors.length} author(s) selected</span>
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

// Enhanced Author Card with Selection
const SelectableAuthorCard = ({
  author,
  isSelected,
  onSelect,
  onClick,
  onEdit,
  onDelete,
}: {
  author: Author;
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
        {author.cover_url ? (
          <img src={author.cover_url} alt={author.name} className="w-12 h-12 rounded-full object-cover mr-3" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-semibold mr-3">
            {getInitials(author.name)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900 truncate">{author.name}</h3>
          {/* <p className="text-sm text-gray-500">{new Date(author.created_at).toLocaleDateString()}</p> */}
        </div>
      </div>

      {author.description && (
        <p className="text-gray-600 text-sm line-clamp-2 leading-relaxed mb-3 ml-6 cursor-pointer" onClick={onClick}>
          {author.description}
        </p>
      )}

      <div className="text-xs text-gray-600">
        {author.national ? (
          <span
            className={
              author.national === "national"
                ? "bg-green-100 text-green-800 px-1.5 py-0.5 rounded"
                : "bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded"
            }
          >
            {author.national}
          </span>
        ) : (
          <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">Unassigned</span>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onEdit} className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600">
          Edit
        </button>
        <button onClick={onDelete} className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600">
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
  const [suggestions, setSuggestions] = useState<Author[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchSuggestions = async (query: string) => {
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/authors/search?q=${encodeURIComponent(query)}`);
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
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [value, showSuggestions]);

  return (
    <div className="relative">
      <div className="relative">
        <input
          type="text"
          placeholder="Search by name or description"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            suggestions.map((author) => (
              <div
                key={author.id}
                className="p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                onClick={() => {
                  onChange(author.name);
                  setShowSuggestions(false);
                }}
              >
                <div className="flex items-center">
                  {author.cover_url ? (
                    <img src={author.cover_url} alt={author.name} className="w-8 h-8 rounded-full object-cover mr-2" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-semibold mr-2">
                      {getInitials(author.name)}
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-medium text-gray-900">{author.name}</div>
                    {author.description && <div className="text-xs text-gray-500 truncate">{author.description}</div>}
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
  EnhancedAuthorFormModal,
  AuthorStats,
  ExportImportActions,
  BulkActions,
  SelectableAuthorCard,
  EnhancedSearch,
};
