// components/DataTable.tsx
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender,
  ColumnDef,
} from "@tanstack/react-table";
import { PencilCircleIcon, TagIcon } from "@phosphor-icons/react";
import { fuzzyFilter } from "../utils/fuzzyFilter";
import { MagazineRecord } from "../types";
import { useEffect, useMemo } from "react";

interface DataTableProps {
  data: MagazineRecord[];
  columns: ColumnDef<MagazineRecord>[];
  columnFilters: any;
  setColumnFilters: (filters: any) => void;
  globalFilter: string;
  setGlobalFilter: (filter: string) => void;
  sorting: any;
  setSorting: (sorting: any) => void;
  tableLoading: boolean;
  setModalOpen: (open: boolean) => void;
  setTagsModalOpen: (open: boolean) => void;
  setSummaryOpen: (open: boolean) => void;
  setConclusionOpen: (open: boolean) => void;
  setEditingRecord: (record: MagazineRecord | null) => void;
  setSelectedTags: (tags: { label: string; value: number }[]) => void;
  setName: (name: string) => void;
  setSummary: (summary: string) => void;
  setConclusion: (conclusion: string) => void;
  setVolume: (volume: string) => void;
  setNumber: (number: string) => void;
  setTimestamp: (timestamp: string) => void;
  setTitleName: (titleName: string) => void;
  setPageNumbers: (pageNumbers: string) => void;
  setAuthors: (authors: string) => void;
  setLanguage: (language: string) => void;
  setFile: (file: File | null) => void;
  access: string | null;
  setError: (error: string | null) => void;
  // Add pagination props
  pagination: any;
  setPagination: (pagination: any) => void;
  onFilteredDataChange?: (filteredRows: MagazineRecord[]) => void;
}

export default function DataTable({
  data,
  columns,
  columnFilters,
  setColumnFilters,
  globalFilter,
  setGlobalFilter,
  sorting,
  setSorting,
  tableLoading,
  setModalOpen,
  setTagsModalOpen,
  setSummaryOpen,
  setConclusionOpen,
  setEditingRecord,
  setSelectedTags,
  setName,
  setSummary,
  setConclusion,
  setVolume,
  setNumber,
  setTimestamp,
  setTitleName,
  setPageNumbers,
  setAuthors,
  setLanguage,
  setFile,
  access,
  setError,
  pagination,
  setPagination,
  onFilteredDataChange,
}: DataTableProps) {
  const table = useReactTable({
    data,
    columns,
    filterFns: { fuzzy: fuzzyFilter },
    state: { columnFilters, globalFilter, sorting, pagination },
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    globalFilterFn: fuzzyFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const filteredRows = useMemo(
    () => table.getFilteredRowModel().rows.map((row) => row.original),
    [table.getFilteredRowModel().rows],
  );

  useEffect(() => {
    if (onFilteredDataChange) {
      onFilteredDataChange(filteredRows);
    }
  }, [onFilteredDataChange, JSON.stringify(filteredRows)]);

  if (tableLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4">
        <div className="relative">
          <div className="w-12 h-12 rounded-full border-4 border-slate-200"></div>
          <div className="w-12 h-12 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin absolute top-0"></div>
        </div>
        <div className="text-center">
          <h3 className="text-lg font-semibold text-slate-700 mb-2">Loading Records</h3>
          <p className="text-slate-500">Please wait while we fetch your data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[90vh]">
      {/* Table Container with Fixed Height */}
      <div className="flex-1 border border-slate-200 rounded-lg">
        <div className="overflow-x-auto">
          <div className="max-h-[80vh] overflow-y-auto">
            <table className="min-w-full divide-y divide-slate-200 table-fixed">
              <thead className="bg-gradient-to-r from-slate-50 to-gray-100 sticky top-0 z-40">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        colSpan={header.colSpan}
                        className="px-2 py-4 text-left text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-200"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>

              <tbody className="bg-white/60 backdrop-blur-sm divide-y divide-slate-100">
                {table.getRowModel().rows.length ? (
                  table.getRowModel().rows.map((row, index) => (
                    <tr
                      key={row.id}
                      className={`hover:bg-indigo-50/50 transition-all duration-200 ${
                        index % 2 === 0 ? "bg-slate-50/30" : "bg-white/50"
                      }`}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-2 py-6 text-sm text-slate-700 whitespace-normal">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={columns.length} className="px-2 py-12 text-center">
                      No records found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Pagination Component */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl p-6 shadow-xl border border-white/20">
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
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const input = e.currentTarget.querySelector("input") as HTMLInputElement;
                  const pageIndex = Number(input.value) - 1;
                  if (pageIndex >= 0 && pageIndex < table.getPageCount()) {
                    table.setPageIndex(pageIndex);
                  } else {
                    input.value = String(table.getState().pagination.pageIndex + 1);
                  }
                }}
                className="inline-flex"
              >
                <input
                  type="number"
                  min="1"
                  max={table.getPageCount()}
                  defaultValue={table.getState().pagination.pageIndex + 1}
                  onBlur={(e) => {
                    const pageIndex = Number(e.target.value) - 1;
                    if (pageIndex < 0 || pageIndex >= table.getPageCount()) {
                      e.target.value = String(table.getState().pagination.pageIndex + 1);
                    }
                  }}
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
    </div>
  );
}
