import { MouseEvent } from "react";
import AsyncCreatableSelect from "react-select/async-creatable";
import { UserIcon } from "@phosphor-icons/react";

interface AuthorsModalProps {
  authorsModalOpen: boolean;
  setAuthorsModalOpen: (open: boolean) => void;
  loading: boolean;
  error: string | null;
  selectedAuthors: { label: string; value: number }[];
  setSelectedAuthors: (authors: { label: string; value: number }[]) => void;
  handleAuthorSubmit: (e: MouseEvent<HTMLButtonElement>) => Promise<void>;
}

export default function AuthorsModal({
  authorsModalOpen,
  setAuthorsModalOpen,
  loading,
  error,
  selectedAuthors,
  setSelectedAuthors,
  handleAuthorSubmit,
}: AuthorsModalProps) {
  if (!authorsModalOpen) return null;

  console.log({ selectedAuthors });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white/95 backdrop-blur-md shadow-2xl rounded-2xl p-8 w-full max-w-md relative border border-white/20">
        <button
          onClick={() => setAuthorsModalOpen(false)}
          className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 text-2xl focus:outline-none focus:ring-2 focus:ring-slate-300 rounded-full w-8 h-8 flex items-center justify-center transition-all duration-200"
          aria-label="Close form"
          disabled={loading}
        >
          ×
        </button>
        <h2 className="text-2xl font-bold bg-gradient-to-r from-slate-800 to-purple-600 bg-clip-text text-transparent mb-6">
          Manage Authors
        </h2>
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-gradient-to-r from-red-50 to-pink-50 border border-red-200 flex items-center gap-3">
            <p className="text-red-700 text-sm font-medium">{error}</p>
          </div>
        )}
        <div className="space-y-6">
          <AsyncCreatableSelect
            isMulti
            value={selectedAuthors}
            onChange={(options) => setSelectedAuthors(options as { label: string; value: number }[])}
            loadOptions={async (inputValue: string) => {
              if (!inputValue) return [];
              try {
                const res = await fetch(`/api/authors?q=${encodeURIComponent(inputValue)}`);
                const data = await res.json();
                return data.map((author: { id: number; name: string }) => ({
                  label: author.name,
                  value: author.id,
                }));
              } catch (err) {
                console.error("Error loading authors:", err);
                return [];
              }
            }}
            onCreateOption={(inputValue) => {
              setSelectedAuthors([...selectedAuthors, { label: inputValue, value: Date.now() }]);
            }}
            placeholder="Search or create authors"
            isDisabled={loading}
            classNamePrefix="react-select"
          />
          <button
            type="button"
            onClick={handleAuthorSubmit}
            className={`w-full py-4 px-6 rounded-xl shadow-lg text-white text-sm font-semibold transition-all duration-200 transform ${
              loading
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 hover:shadow-xl hover:scale-[1.02]"
            }`}
            disabled={loading}
          >
            {loading ? (
              "Saving..."
            ) : (
              <div className="flex items-center justify-center gap-2">
                <UserIcon size={16} />
                Save Authors
              </div>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
