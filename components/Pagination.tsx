// components/Pagination.tsx
import { Table } from "@tanstack/react-table";
import { MagazineRecord } from "../types";
import { useState } from "react";

interface PaginationProps {
  table: Table<MagazineRecord>;
}

export default function Pagination({ table }: PaginationProps) {
  const [pageInput, setPageInput] = useState(table.getState().pagination.pageIndex + 1);

  const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPageInput(value === "" ? 0 : Number(value));
  };

  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pageIndex = pageInput - 1;
    if (pageIndex >= 0 && pageIndex < table.getPageCount()) {
      table.setPageIndex(pageIndex);
    } else {
      // Reset to current page if invalid
      setPageInput(table.getState().pagination.pageIndex + 1);
    }
  };

  const handlePageInputBlur = () => {
    const pageIndex = pageInput - 1;
    if (pageIndex < 0 || pageIndex >= table.getPageCount()) {
      setPageInput(table.getState().pagination.pageIndex + 1);
    }
  };

  return (
    <div className="mt-6 bg-white/80 backdrop-blur-md rounded-2xl p-6 shadow-xl border border-white/20">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="inline-flex items-center px-4 py-2 border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
            First
          </button>
          <button
            className="inline-flex items-center px-4 py-2 border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Previous
          </button>
          <button
            className="inline-flex items-center px-4 py-2 border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
            <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button
            className="inline-flex items-center px-4 py-2 border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
          >
            Last
            <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <span className="ml-4 flex items-center gap-1 text-base text-zinc-900 font-bold">
            Showing {table.getFilteredRowModel().rows.length} records
          </span>
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <span>Page</span>
            <form onSubmit={handlePageInputSubmit} className="inline-flex">
              <input
                type="number"
                min="1"
                max={table.getPageCount()}
                value={pageInput}
                onChange={handlePageInputChange}
                onBlur={handlePageInputBlur}
                className="w-16 px-3 py-1 rounded-lg bg-gradient-to-r from-indigo-100 to-purple-100 text-indigo-800 font-bold text-center border-2 border-transparent focus:border-indigo-500 focus:ring-0 transition-all duration-200"
              />
            </form>
            <span>of</span>
            <span className="inline-flex items-center px-3 py-1 rounded-lg bg-gradient-to-r from-slate-100 to-gray-100 text-slate-800 font-bold">
              {table.getPageCount()}
            </span>
          </div>
          <select
            value={table.getState().pagination.pageSize}
            onChange={(e) => table.setPageSize(Number(e.target.value))}
            className="border-2 border-slate-200 rounded-xl px-4 py-2 text-sm font-medium bg-white focus:border-indigo-500 focus:ring-0 transition-all duration-200"
          >
            {[10, 20, 30, 40, 50, 100, 200].map((pageSize) => (
              <option key={pageSize} value={pageSize}>
                Show {pageSize}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
