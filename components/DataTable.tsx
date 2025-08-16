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
import { useEffect } from "react";

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

  const filteredRows = table.getFilteredRowModel().rows.map((row) => row.original);

  // Use useEffect to call the callback when filtered data changes
  useEffect(() => {
    if (onFilteredDataChange) {
      onFilteredDataChange(filteredRows);
    }
  }, [filteredRows, onFilteredDataChange]);

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
    <div className="flex flex-col h-[80vh]">
      {/* Table Container with Fixed Height */}
      <div className="flex-1 overflow-auto border border-slate-200 rounded-lg">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-gradient-to-r from-slate-50 to-gray-100 sticky top-0 z-30">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const isFiltered =
                      !!header.column.getFilterValue() &&
                      header.column.getFilterValue() !== "" &&
                      header.column.getCanFilter();
                    return (
                      <th
                        key={header.id}
                        colSpan={header.colSpan}
                        className={`px-2 py-4 text-left text-xs font-bold uppercase tracking-wider bg-gradient-to-r from-slate-50 to-gray-100 border-b border-slate-200
                  ${isFiltered ? "bg-pink-200 text-red-900 font-extrabold shadow-lg ring-2 ring-red-400 ring-offset-2" : "text-slate-700"}
                  `}
                        style={{
                          position: "sticky",
                          top: 0,
                          zIndex: 31,
                          transition: "background 0.3s, color 0.3s, box-shadow 0.3s",
                        }}
                      >
                        <div
                          {...{
                            className: header.column.getCanSort()
                              ? "cursor-pointer select-none flex items-center font-bold hover:text-indigo-600 transition-colors duration-200"
                              : "flex items-center font-bold",
                            onClick: header.column.getToggleSortingHandler(),
                          }}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <span className="ml-2">
                            {{ asc: "🔼", desc: "🔽" }[header.column.getIsSorted() as string] ?? null}
                          </span>
                          {isFiltered && (
                            <span className="ml-2 px-2 py-0.5 rounded-full bg-red-500 text-white text-xs font-bold animate-pulse border border-red-700 shadow">
                              Filter
                            </span>
                          )}
                        </div>
                        {header.column.getCanFilter() && (
                          <div className="mt-2">
                            {["name", "title_name", "authors", "tags"].includes(header.column.id) ? (
                              header.column.id === "name" ? (
                                <select
                                  value={(header.column.getFilterValue() as string) ?? ""}
                                  onChange={(e) => {
                                    header.column.setFilterValue(e.target.value);
                                    setSorting([
                                      {
                                        id: "volume",
                                        desc: false,
                                      },
                                      {
                                        id: "number",
                                        desc: false,
                                      },
                                      {
                                        id: "page_numbers",
                                        desc: false,
                                      },
                                    ]);
                                  }}
                                  className={`border-2 rounded-lg px-2 py-1 text-xs w-full bg-white/80 focus:border-indigo-500 focus:ring-0 transition-colors duration-200 ${isFiltered ? "border-red-400 ring-2 ring-red-300" : "border-slate-200"}`}
                                >
                                  <option value="">All</option>
                                  {Array.from(new Set(data.map((r) => r.name).filter(Boolean))).map((value) => (
                                    <option key={value as string} value={value as string}>
                                      {value as string}
                                    </option>
                                  ))}
                                </select>
                              ) : header.column.id === "tags" ? (
                                <select
                                  value={(header.column.getFilterValue() as string) ?? ""}
                                  onChange={(e) => header.column.setFilterValue(e.target.value)}
                                  className={`border-2 rounded-lg px-2 py-1 text-xs w-full bg-white/80 focus:border-indigo-500 focus:ring-0 transition-colors duration-200 ${isFiltered ? "border-red-400 ring-2 ring-red-300" : "border-slate-200"}`}
                                >
                                  <option value="">All</option>
                                  {(() => {
                                    let filteredRecords = data;
                                    const nameFilter = table
                                      .getState()
                                      .columnFilters.find((f) => f.id === "name")?.value;
                                    if (nameFilter) {
                                      filteredRecords = filteredRecords.filter(
                                        (r) => String(r.name ?? "").toLowerCase() === String(nameFilter).toLowerCase(),
                                      );
                                    }
                                    const tagNames = Array.from(
                                      new Set(
                                        filteredRecords
                                          .flatMap((r) => r.tags?.map((t) => t.name) || [])
                                          .filter(Boolean),
                                      ),
                                    ).sort();
                                    return tagNames.map((name) => (
                                      <option key={name} value={name}>
                                        {name}
                                      </option>
                                    ));
                                  })()}
                                </select>
                              ) : (
                                <select
                                  value={(header.column.getFilterValue() as string) ?? ""}
                                  onChange={(e) => header.column.setFilterValue(e.target.value)}
                                  className={`border-2 rounded-lg px-2 py-1 text-xs w-full bg-white/80 focus:border-indigo-500 focus:ring-0 transition-colors duration-200 ${isFiltered ? "border-red-400 ring-2 ring-red-300" : "border-slate-200"}`}
                                >
                                  <option value="">All</option>
                                  {(() => {
                                    let filteredRecords = data;
                                    const nameFilter = table
                                      .getState()
                                      .columnFilters.find((f) => f.id === "name")?.value;
                                    if (["title_name", "authors"].includes(header.column.id) && nameFilter) {
                                      filteredRecords = filteredRecords.filter(
                                        (r) => String(r.name ?? "").toLowerCase() === String(nameFilter).toLowerCase(),
                                      );
                                    }
                                    const options = [
                                      ...new Set(
                                        filteredRecords
                                          .map((r) => r[header.column.id as keyof MagazineRecord])
                                          .filter(Boolean),
                                      ),
                                    ];
                                    return options.map((value) => (
                                      <option key={value as string} value={value as string}>
                                        {value as string}
                                      </option>
                                    ));
                                  })()}
                                </select>
                              )
                            ) : (
                              <input
                                type="text"
                                value={(header.column.getFilterValue() as string) ?? ""}
                                onChange={(e) => header.column.setFilterValue(e.target.value)}
                                placeholder={`Filter...`}
                                className={`border-2 rounded-lg px-2 py-1 text-xs w-full bg-white/80 focus:border-indigo-500 focus:ring-0 transition-colors duration-200 ${isFiltered ? "border-red-400 ring-2 ring-red-300" : "border-slate-200"}`}
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
            <tbody className="bg-white/60 backdrop-blur-sm divide-y divide-slate-100 overflow-y-auto">
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row, index) => (
                  <tr
                    key={row.id}
                    className={`hover:bg-indigo-50/50 transition-all duration-200 border-black border-t-2 border-b-2 ${
                      index % 2 === 0 ? "bg-slate-50/30" : "bg-white/50"
                    }`}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const colId = cell.column.id;
                      if (colId === "summary") {
                        return (
                          <td
                            key={cell.id}
                            className="px-2 py-6 whitespace-normal text-sm text-slate-700 max-w-xs cursor-pointer hover:bg-blue-50/80 transition-colors duration-200"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingRecord(row.original);
                              setSummaryOpen(true);
                              setName(row.original.name || "");
                              setSummary(row.original.summary || "");
                              setConclusion(row.original.conclusion || "");
                              setVolume(row.original.volume || "");
                              setNumber(row.original.number || "");
                              setTimestamp(row.original.timestamp || "");
                              setTitleName(row.original.title_name || "");
                              setPageNumbers(row.original.page_numbers || "");
                              setAuthors(row.original.authors || "");
                              setLanguage(row.original.language || "");
                              setFile(null);
                            }}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        );
                      }
                      if (colId === "conclusion") {
                        return (
                          <td
                            key={cell.id}
                            className="px-2 py-6 whitespace-normal text-sm text-slate-700 max-w-xs cursor-pointer hover:bg-emerald-50/80 transition-colors duration-200"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingRecord(row.original);
                              setConclusionOpen(true);
                              setName(row.original.name || "");
                              setSummary(row.original.summary || "");
                              setConclusion(row.original.conclusion || "");
                              setVolume(row.original.volume || "");
                              setNumber(row.original.number || "");
                              setTimestamp(row.original.timestamp || "");
                              setTitleName(row.original.title_name || "");
                              setPageNumbers(row.original.page_numbers || "");
                              setAuthors(row.original.authors || "");
                              setLanguage(row.original.language || "");
                              setFile(null);
                            }}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        );
                      }
                      return (
                        <td key={cell.id} className="px-2 py-6 whitespace-normal text-sm text-slate-700 max-w-xs">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={columns.length} className="px-2 py-12 text-center">
                    <div className="flex flex-col items-center space-y-3">
                      <svg className="w-12 h-12 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      <h3 className="text-lg font-semibold text-slate-600">No records found</h3>
                      <p className="text-slate-500">Try adjusting your filters or add a new record to get started.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Component */}
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
              <span className="inline-flex items-center px-3 py-1 rounded-lg bg-gradient-to-r from-indigo-100 to-purple-100 text-indigo-800 font-bold">
                {table.getState().pagination.pageIndex + 1}
              </span>
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
