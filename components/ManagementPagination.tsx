import { useEffect, useState } from "react";

type ManagementPaginationProps = {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  visibleCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
};

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50, 100, 200];

export default function ManagementPagination({
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  visibleCount,
  onPageChange,
  onPageSizeChange,
}: ManagementPaginationProps) {
  const [pageInput, setPageInput] = useState(currentPage);

  useEffect(() => {
    setPageInput(currentPage);
  }, [currentPage]);

  if (totalItems === 0 || totalPages === 0) {
    return null;
  }

  const start = (currentPage - 1) * pageSize + 1;
  const end = visibleCount > 0 ? start + visibleCount - 1 : start;

  const submitPageInput = () => {
    const nextPage = Math.max(1, Math.min(totalPages, Number(pageInput) || currentPage));
    setPageInput(nextPage);
    if (nextPage !== currentPage) {
      onPageChange(nextPage);
    }
  };

  return (
    <div className="mt-8 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(1)}
            disabled={currentPage <= 1}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            First
          </button>
          <button
            type="button"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
          <button
            type="button"
            onClick={() => onPageChange(totalPages)}
            disabled={currentPage >= totalPages}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Last
          </button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <span className="text-sm font-semibold text-slate-700">
            Showing {start}-{Math.min(end, totalItems)} of {totalItems}
          </span>
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <span>Page</span>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                submitPageInput();
              }}
              className="inline-flex"
            >
              <input
                type="number"
                min="1"
                max={totalPages}
                value={pageInput}
                onChange={(event) => setPageInput(event.target.value === "" ? 0 : Number(event.target.value))}
                onBlur={submitPageInput}
                className="w-16 rounded-lg border border-slate-300 bg-slate-50 px-3 py-1 text-center font-semibold text-slate-900 focus:border-indigo-500 focus:outline-none"
              />
            </form>
            <span>of</span>
            <span className="rounded-lg bg-slate-100 px-3 py-1 font-semibold text-slate-800">{totalPages}</span>
          </div>
          {onPageSizeChange && (
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 focus:border-indigo-500 focus:outline-none"
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  Show {option}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
    </div>
  );
}
