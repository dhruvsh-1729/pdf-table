import React, { useEffect, useMemo, useState } from "react";

type ExportColumnsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  exportableColumns: { id: string; label: string }[];
  selectedColumnIds: string[];
  setSelectedColumnIds: (ids: string[]) => void;
  onExportCSV: () => void;
  onExportXLSX: () => void;
};

export default function ExportColumnsModal({
  isOpen,
  onClose,
  exportableColumns,
  selectedColumnIds,
  setSelectedColumnIds,
  onExportCSV,
  onExportXLSX,
}: ExportColumnsModalProps) {
  const [localSelected, setLocalSelected] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) setLocalSelected(selectedColumnIds);
  }, [isOpen, selectedColumnIds]);

  const allIds = useMemo(() => exportableColumns.map((c) => c.id), [exportableColumns]);

  const allSelected = localSelected.length === exportableColumns.length && exportableColumns.length > 0;

  const toggle = (id: string) => {
    setLocalSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectAll = () => setLocalSelected(allIds);
  const clearAll = () => setLocalSelected([]);

  const applyAndExport = (type: "csv" | "xlsx") => {
    setSelectedColumnIds(localSelected);
    if (type === "csv") onExportCSV();
    else onExportXLSX();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Choose columns to export</h3>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-6 pt-4 pb-2 flex items-center gap-2">
          <button
            onClick={selectAll}
            className="text-xs px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200"
          >
            Select All
          </button>
          <button
            onClick={clearAll}
            className="text-xs px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200"
          >
            Clear
          </button>
          <span className="text-xs text-slate-500 ml-auto">
            {localSelected.length}/{exportableColumns.length} selected
          </span>
        </div>

        <div className="max-h-[50vh] overflow-auto px-6 py-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {exportableColumns.map((col) => (
            <label
              key={col.id}
              className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer"
            >
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={localSelected.includes(col.id)}
                onChange={() => toggle(col.id)}
              />
              <span className="text-sm text-slate-700">{col.label}</span>
            </label>
          ))}
          {exportableColumns.length === 0 && <div className="text-sm text-slate-500">No exportable columns.</div>}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
          <div className="text-xs text-slate-500">{allSelected ? "All columns selected" : ""}</div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => applyAndExport("csv")}
              disabled={localSelected.length === 0}
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              Export CSV
            </button>
            <button
              onClick={() => applyAndExport("xlsx")}
              disabled={localSelected.length === 0}
              className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
            >
              Export XLSX
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
