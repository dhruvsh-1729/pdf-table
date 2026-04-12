import { MouseEvent } from "react";
import AsyncCreatableSelect from "react-select/async-creatable";
import { TranslateIcon } from "@phosphor-icons/react";

type SelectOption = { label: string; value: number };

interface LanguagesModalProps {
  languagesModalOpen: boolean;
  setLanguagesModalOpen: (open: boolean) => void;
  loading: boolean;
  error: string | null;
  selectedLanguages: SelectOption[];
  setSelectedLanguages: (languages: SelectOption[]) => void;
  handleLanguageSubmit: (e: MouseEvent<HTMLButtonElement>) => Promise<void>;
}

export default function LanguagesModal({
  languagesModalOpen,
  setLanguagesModalOpen,
  loading,
  error,
  selectedLanguages,
  setSelectedLanguages,
  handleLanguageSubmit,
}: LanguagesModalProps) {
  if (!languagesModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white/95 backdrop-blur-md shadow-2xl rounded-2xl p-8 w-full max-w-md relative border border-white/20">
        <button
          onClick={() => setLanguagesModalOpen(false)}
          className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 text-2xl focus:outline-none focus:ring-2 focus:ring-slate-300 rounded-full w-8 h-8 flex items-center justify-center transition-all duration-200"
          aria-label="Close form"
          disabled={loading}
        >
          x
        </button>
        <h2 className="text-2xl font-bold bg-gradient-to-r from-slate-800 to-teal-600 bg-clip-text text-transparent mb-6">
          Manage Languages
        </h2>
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-gradient-to-r from-red-50 to-pink-50 border border-red-200 flex items-center gap-3">
            <p className="text-red-700 text-sm font-medium">{error}</p>
          </div>
        )}
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Languages</label>
            <AsyncCreatableSelect
              isMulti
              value={selectedLanguages}
              onChange={(options) => setSelectedLanguages(options as SelectOption[])}
              loadOptions={async (inputValue: string) => {
                if (!inputValue) return [];
                try {
                  const res = await fetch(`/api/languages?q=${encodeURIComponent(inputValue)}&limit=20&offset=0`);
                  if (!res.ok) throw new Error("Failed to load languages");
                  const payload = await res.json();
                  const rows = Array.isArray(payload) ? payload : payload.languages || [];
                  return rows.map((language: { id: number; name: string }) => ({
                    label: language.name,
                    value: language.id,
                  }));
                } catch (err) {
                  console.error("Error loading languages:", err);
                  return [];
                }
              }}
              onCreateOption={(inputValue) => {
                setSelectedLanguages([...selectedLanguages, { label: inputValue, value: -Date.now() }]);
              }}
              placeholder="Search or create languages"
              isDisabled={loading}
              classNamePrefix="react-select"
            />
          </div>
          <button
            type="button"
            onClick={handleLanguageSubmit}
            className={`w-full py-4 px-6 rounded-xl shadow-lg text-white text-sm font-semibold transition-all duration-200 transform ${
              loading
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 hover:shadow-xl hover:scale-[1.02]"
            }`}
            disabled={loading}
          >
            {loading ? (
              "Saving..."
            ) : (
              <div className="flex items-center justify-center gap-2">
                <TranslateIcon size={16} />
                Save Languages
              </div>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
