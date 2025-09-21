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
    if (onFilteredDataChange) onFilteredDataChange(filteredRows);
  }, [onFilteredDataChange, JSON.stringify(filteredRows)]);

  // ---- Helpers for header filter dropdowns ----
  const getUnique = (arr: (string | null | undefined)[]) =>
    Array.from(new Set(arr.filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b));

  const nameFilterValue = table.getState().columnFilters.find((f) => f.id === "name")?.value;

  // Build unique values for tags and authors with optional dependency on name filter (keeps choices relevant)
  const uniqueTagNames = useMemo(() => {
    let rows = data;
    if (nameFilterValue) {
      rows = rows.filter((r) => String(r.name ?? "").toLowerCase() === String(nameFilterValue).toLowerCase());
    }
    return getUnique(rows.flatMap((r) => (r.tags || []).map((t) => t.name)));
  }, [data, nameFilterValue]);

  const uniqueAuthorNames = useMemo(() => {
    let rows = data;
    if (nameFilterValue) {
      rows = rows.filter((r) => String(r.name ?? "").toLowerCase() === String(nameFilterValue).toLowerCase());
    }
    return getUnique(rows.flatMap((r) => (r.authors_linked || []).map((a) => a.name)));
  }, [data, nameFilterValue]);

  // ---- Loading State ----
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
      {/* Table Container with fixed height + single scrollable area (keeps columns aligned) */}
      <div className="flex-1 border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          {/* Give the scrolling to the wrapper around the table so thead:sticky works */}
          <div className="max-h-[80vh] overflow-y-auto custom-scrollbar">
            <table className="min-w-full divide-y divide-slate-200 table-fixed">
              <thead className="bg-gradient-to-r from-slate-50 to-gray-100 sticky top-0 z-40">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      const isFiltered =
                        !!header.column.getFilterValue() &&
                        header.column.getFilterValue() !== "" &&
                        header.column.getCanFilter();

                      const canSort = header.column.getCanSort();
                      const sortState = header.column.getIsSorted() as false | "asc" | "desc";

                      return (
                        <th
                          key={header.id}
                          colSpan={header.colSpan}
                          className={`px-2 py-3 text-left align-bottom text-[11px] font-bold uppercase tracking-wider border-b border-slate-200 ${
                            isFiltered
                              ? "bg-pink-100 text-red-900"
                              : "text-slate-700 bg-gradient-to-r from-slate-50 to-gray-100"
                          }`}
                        >
                          <div
                            className={`${canSort ? "cursor-pointer select-none" : ""} flex items-center`}
                            onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            <span className="ml-1">
                              {sortState === "asc" ? "🔼" : sortState === "desc" ? "🔽" : ""}
                            </span>
                            {isFiltered && (
                              <span className="ml-2 px-2 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold">
                                Filter
                              </span>
                            )}
                          </div>

                          {/* Per-column filter UIs */}
                          {header.column.getCanFilter() && (
                            <div className="mt-2">
                              {["name", "title_name", "authors", "tags"].includes(header.column.id) ? (
                                header.column.id === "name" ? (
                                  // Filter by exact magazine name (dropdown)
                                  <select
                                    value={(header.column.getFilterValue() as string) ?? ""}
                                    onChange={(e) => {
                                      header.column.setFilterValue(e.target.value);
                                      // optional: when name changes, reset to first page
                                      setPagination((p: any) => ({ ...p, pageIndex: 0 }));
                                    }}
                                    className={`border rounded-md px-2 py-1 text-xs w-full bg-white focus:border-indigo-500 focus:ring-0 ${
                                      isFiltered ? "border-red-400" : "border-slate-300"
                                    }`}
                                  >
                                    <option value="">All</option>
                                    {getUnique(data.map((r) => r.name)).map((value) => (
                                      <option key={value} value={value}>
                                        {value}
                                      </option>
                                    ))}
                                  </select>
                                ) : header.column.id === "tags" ? (
                                  // Tags filter: includes (No tags)/(Has tags) + exact tag names
                                  <select
                                    value={(header.column.getFilterValue() as string) ?? ""}
                                    onChange={(e) => {
                                      header.column.setFilterValue(e.target.value);
                                      setPagination((p: any) => ({ ...p, pageIndex: 0 }));
                                    }}
                                    className={`border rounded-md px-2 py-1 text-xs w-full bg-white focus:border-indigo-500 focus:ring-0 ${
                                      isFiltered ? "border-red-400" : "border-slate-300"
                                    }`}
                                  >
                                    <option value="">All</option>
                                    <option value="__EMPTY__">(No tags)</option>
                                    <option value="__NONEMPTY__">(Has tags)</option>
                                    {uniqueTagNames.map((name) => (
                                      <option key={name} value={name}>
                                        {name}
                                      </option>
                                    ))}
                                  </select>
                                ) : header.column.id === "authors" ? (
                                  // Authors filter: includes (No authors)/(Has authors) + exact author names
                                  <select
                                    value={(header.column.getFilterValue() as string) ?? ""}
                                    onChange={(e) => {
                                      header.column.setFilterValue(e.target.value);
                                      setPagination((p: any) => ({ ...p, pageIndex: 0 }));
                                    }}
                                    className={`border rounded-md px-2 py-1 text-xs w-full bg-white focus:border-indigo-500 focus:ring-0 ${
                                      isFiltered ? "border-red-400" : "border-slate-300"
                                    }`}
                                  >
                                    <option value="">All</option>
                                    <option value="__EMPTY__">(No authors)</option>
                                    <option value="__NONEMPTY__">(Has authors)</option>
                                    {uniqueAuthorNames.map((name) => (
                                      <option key={name} value={name}>
                                        {name}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  // title_name fallback (exact match list)
                                  <select
                                    value={(header.column.getFilterValue() as string) ?? ""}
                                    onChange={(e) => {
                                      header.column.setFilterValue(e.target.value);
                                      setPagination((p: any) => ({ ...p, pageIndex: 0 }));
                                    }}
                                    className={`border rounded-md px-2 py-1 text-xs w-full bg-white focus:border-indigo-500 focus:ring-0 ${
                                      isFiltered ? "border-red-400" : "border-slate-300"
                                    }`}
                                  >
                                    <option value="">All</option>
                                    {getUnique(data.map((r) => r.title_name)).map((value) => (
                                      <option key={value} value={value}>
                                        {value}
                                      </option>
                                    ))}
                                  </select>
                                )
                              ) : (
                                // Generic text filter for other columns
                                <input
                                  type="text"
                                  value={(header.column.getFilterValue() as string) ?? ""}
                                  onChange={(e) => {
                                    header.column.setFilterValue(e.target.value);
                                    setPagination((p: any) => ({ ...p, pageIndex: 0 }));
                                  }}
                                  placeholder="Filter…"
                                  className={`border rounded-md px-2 py-1 text-xs w-full bg-white focus:border-indigo-500 focus:ring-0 ${
                                    isFiltered ? "border-red-400" : "border-slate-300"
                                  }`}
                                />
                              )}
                            </div>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>

              <tbody className="bg-white/60 backdrop-blur-sm divide-y divide-slate-100">
                {table.getRowModel().rows.length ? (
                  table.getRowModel().rows.map((row, index) => (
                    <tr
                      key={row.id}
                      className={`hover:bg-indigo-50/50 transition-all duration-200 border-b border-zinc-900 ${
                        index % 2 === 0 ? "bg-slate-50/30" : "bg-white/50"
                      }`}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-2 py-4 text-sm text-slate-700 align-top">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={columns.length} className="px-2 py-12 text-center text-slate-600">
                      No records found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Pagination */}
      <div className="mt-4 bg-white/80 backdrop-blur-md rounded-2xl p-6 shadow-xl border border-white/20">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="inline-flex items-center px-4 py-2 border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
            >
              ⏮️ First
            </button>
            <button
              className="inline-flex items-center px-4 py-2 border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              ◀️ Previous
            </button>
            <button
              className="inline-flex items-center px-4 py-2 border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next ▶️
            </button>
            <button
              className="inline-flex items-center px-4 py-2 border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
            >
              Last ⏭️
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4">
            <span className="ml-0 sm:ml-4 flex items-center gap-1 text-base text-zinc-900 font-bold">
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
