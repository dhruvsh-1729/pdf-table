// components/TagsModal.tsx
import { MouseEvent } from "react";
import CreatableSelect from "react-select/creatable";
import { TagIcon } from "@phosphor-icons/react";
import { Tag } from "../types";

interface TagsModalProps {
  tagsModalOpen: boolean;
  setTagsModalOpen: (open: boolean) => void;
  loading: boolean;
  error: string | null;
  selectedTags: { label: string; value: number }[];
  setSelectedTags: (tags: { label: string; value: number }[]) => void;
  allTags: Tag[];
  handleTagSubmit: (e: MouseEvent<HTMLButtonElement>) => Promise<void>;
}

export default function TagsModal({
  tagsModalOpen,
  setTagsModalOpen,
  loading,
  error,
  selectedTags,
  setSelectedTags,
  allTags,
  handleTagSubmit,
}: TagsModalProps) {
  if (!tagsModalOpen) return null;

  return (
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
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
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
  );
}
