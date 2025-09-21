// components/ServerDataTable.tsx
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  ColumnDef,
  ColumnFiltersState,
  SortingState,
} from "@tanstack/react-table";
import { MagazineRecord } from "../types";
import { useState, useEffect, useMemo } from "react";
import AsyncSelect from "react-select/async";

interface ServerDataTableProps {
  data: MagazineRecord[];
  columns: ColumnDef<MagazineRecord>[];
  columnFilters: ColumnFiltersState;
  setColumnFilters: (filters: ColumnFiltersState | ((old: ColumnFiltersState) => ColumnFiltersState)) => void;
  globalFilter: string;
  setGlobalFilter: (filter: string) => void;
  sorting: SortingState;
  setSorting: (sorting: SortingState | ((old: SortingState) => SortingState)) => void;
  tableLoading: boolean;
  pagination: { pageIndex: number; pageSize: number };
  setPagination: (
    pagination:
      | { pageIndex: number; pageSize: number }
      | ((old: { pageIndex: number; pageSize: number }) => { pageIndex: number; pageSize: number }),
  ) => void;
  totalRecords: number;
  pageCount: number;
}

export default function ServerDataTable({
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
  totalRecords,
  pageCount,
}: ServerDataTableProps) {
  const [localGlobalFilter, setLocalGlobalFilter] = useState(globalFilter);

  // Debounce global filter
  useEffect(() => {
    const timer = setTimeout(() => {
      setGlobalFilter(localGlobalFilter);
      setPagination({ ...pagination, pageIndex: 0 }); // Reset to first page on filter change
    }, 300);

    return () => clearTimeout(timer);
  }, [localGlobalFilter]);

  // Get unique values for dropdowns - only from current data
  const getUnique = (arr: (string | null | undefined)[]) =>
    Array.from(new Set(arr.filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b));

  const uniqueTitles = useMemo(() => getUnique(data.map((r) => r.title_name)), [data]);

  // Async load functions for select fields
  const loadMagazineOptions = async (inputValue: string) => {
    try {
      const response = await fetch(`/api/magazine-names?q=${encodeURIComponent(inputValue)}`);
      if (!response.ok) throw new Error("Failed to fetch magazine names");
      const data = await response.json();
      return data.map((name: string) => ({
        label: name,
        value: name,
      }));
    } catch (error) {
      console.error("Error loading magazine names:", error);
      return [];
    }
  };

  const loadTagOptions = async (inputValue: string) => {
    try {
      if (!inputValue) {
        // Return special options when no input
        return [
          { label: "(No tags)", value: "__EMPTY__" },
          { label: "(Has tags)", value: "__NONEMPTY__" },
        ];
      }
      const response = await fetch(`/api/tags?q=${encodeURIComponent(inputValue)}`);
      if (!response.ok) throw new Error("Failed to fetch tags");
      const data = await response.json();
      const options = data.map((tag: { id: number; name: string }) => ({
        label: tag.name,
        value: tag.name,
      }));
      // Add special options at the beginning
      return [{ label: "(No tags)", value: "__EMPTY__" }, { label: "(Has tags)", value: "__NONEMPTY__" }, ...options];
    } catch (error) {
      console.error("Error loading tags:", error);
      return [];
    }
  };

  const loadAuthorOptions = async (inputValue: string) => {
    try {
      if (!inputValue) {
        // Return special options when no input
        return [
          { label: "(No authors)", value: "__EMPTY__" },
          { label: "(Has authors)", value: "__NONEMPTY__" },
        ];
      }
      const response = await fetch(`/api/authors?q=${encodeURIComponent(inputValue)}`);
      if (!response.ok) throw new Error("Failed to fetch authors");
      const data = await response.json();
      const options = data.map((author: { id: number; name: string }) => ({
        label: author.name,
        value: author.name,
      }));
      // Add special options at the beginning
      return [
        { label: "(No authors)", value: "__EMPTY__" },
        { label: "(Has authors)", value: "__NONEMPTY__" },
        ...options,
      ];
    } catch (error) {
      console.error("Error loading authors:", error);
      return [];
    }
  };

  const table = useReactTable({
    data,
    columns,
    pageCount,
    state: {
      columnFilters,
      globalFilter,
      sorting,
      pagination,
    },
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true, // Server-side pagination
    manualFiltering: true, // Server-side filtering
    manualSorting: true, // Server-side sorting
  });

  if (tableLoading && data.length === 0) {
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
      {/* Table Container */}
      <div className="flex-1 border border-slate-200 rounded-lg overflow-hidden relative">
        {tableLoading && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin"></div>
              <span className="text-sm text-slate-600">Updating...</span>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
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
                            onClick={() => {
                              if (canSort) {
                                header.column.toggleSorting();
                                setPagination({ ...pagination, pageIndex: 0 }); // Reset to first page on sort
                              }
                            }}
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

                          {header.column.getCanFilter() && (
                            <div className="mt-2">
                              {header.column.id === "id" ? (
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={(header.column.getFilterValue() as string) ?? ""}
                                  onChange={(e) => {
                                    const value = e.target.value.replace(/[^\d]/g, "");
                                    header.column.setFilterValue(value);
                                    setPagination({ ...pagination, pageIndex: 0 });
                                  }}
                                  placeholder="Filter ID…"
                                  className={`border rounded-md px-2 py-1 text-xs w-full bg-white focus:border-indigo-500 focus:ring-0 ${
                                    isFiltered ? "border-red-400" : "border-slate-300"
                                  }`}
                                />
                              ) : header.column.id === "name" ? (
                                <AsyncSelect
                                  isClearable
                                  value={
                                    header.column.getFilterValue()
                                      ? {
                                          label: header.column.getFilterValue() as string,
                                          value: header.column.getFilterValue() as string,
                                        }
                                      : null
                                  }
                                  onChange={(option) => {
                                    header.column.setFilterValue(option ? option.value : "");
                                    setPagination({ ...pagination, pageIndex: 0 });
                                  }}
                                  loadOptions={loadMagazineOptions}
                                  classNamePrefix="react-select"
                                  styles={{
                                    control: (base) => ({
                                      ...base,
                                      minHeight: "28px",
                                      fontSize: "12px",
                                      borderColor: isFiltered ? "#f87171" : "#cbd5e1",
                                      "&:hover": {
                                        borderColor: "#6366f1",
                                      },
                                    }),
                                    menu: (base) => ({
                                      ...base,
                                      zIndex: 9999,
                                      fontSize: "12px",
                                      width: "400px",
                                      minWidth: "400px",
                                    }),
                                    dropdownIndicator: (base) => ({
                                      ...base,
                                      padding: "0 4px",
                                    }),
                                    clearIndicator: (base) => ({
                                      ...base,
                                      padding: "0 4px",
                                    }),
                                  }}
                                />
                              ) : header.column.id === "tags" ? (
                                <AsyncSelect
                                  isClearable
                                  value={
                                    header.column.getFilterValue()
                                      ? {
                                          label:
                                            header.column.getFilterValue() === "__EMPTY__"
                                              ? "(No tags)"
                                              : header.column.getFilterValue() === "__NONEMPTY__"
                                                ? "(Has tags)"
                                                : (header.column.getFilterValue() as string),
                                          value: header.column.getFilterValue() as string,
                                        }
                                      : null
                                  }
                                  onChange={(option) => {
                                    header.column.setFilterValue(option ? option.value : "");
                                    setPagination({ ...pagination, pageIndex: 0 });
                                  }}
                                  loadOptions={loadTagOptions}
                                  defaultOptions={[
                                    { label: "(No tags)", value: "__EMPTY__" },
                                    { label: "(Has tags)", value: "__NONEMPTY__" },
                                  ]}
                                  classNamePrefix="react-select"
                                  styles={{
                                    control: (base) => ({
                                      ...base,
                                      minHeight: "28px",
                                      fontSize: "12px",
                                      borderColor: isFiltered ? "#f87171" : "#cbd5e1",
                                      "&:hover": {
                                        borderColor: "#6366f1",
                                      },
                                    }),
                                    menu: (base) => ({
                                      ...base,
                                      zIndex: 9999,
                                      fontSize: "12px",
                                      width: "400px",
                                      minWidth: "400px",
                                    }),
                                    dropdownIndicator: (base) => ({
                                      ...base,
                                      padding: "0 4px",
                                    }),
                                    clearIndicator: (base) => ({
                                      ...base,
                                      padding: "0 4px",
                                    }),
                                  }}
                                />
                              ) : header.column.id === "authors" ? (
                                <AsyncSelect
                                  isClearable
                                  value={
                                    header.column.getFilterValue()
                                      ? {
                                          label:
                                            header.column.getFilterValue() === "__EMPTY__"
                                              ? "(No authors)"
                                              : header.column.getFilterValue() === "__NONEMPTY__"
                                                ? "(Has authors)"
                                                : (header.column.getFilterValue() as string),
                                          value: header.column.getFilterValue() as string,
                                        }
                                      : null
                                  }
                                  onChange={(option) => {
                                    header.column.setFilterValue(option ? option.value : "");
                                    setPagination({ ...pagination, pageIndex: 0 });
                                  }}
                                  loadOptions={loadAuthorOptions}
                                  defaultOptions={[
                                    { label: "(No authors)", value: "__EMPTY__" },
                                    { label: "(Has authors)", value: "__NONEMPTY__" },
                                  ]}
                                  classNamePrefix="react-select"
                                  styles={{
                                    control: (base) => ({
                                      ...base,
                                      minHeight: "28px",
                                      fontSize: "12px",
                                      borderColor: isFiltered ? "#f87171" : "#cbd5e1",
                                      "&:hover": {
                                        borderColor: "#6366f1",
                                      },
                                    }),
                                    menu: (base) => ({
                                      ...base,
                                      zIndex: 9999,
                                      fontSize: "12px",
                                      width: "400px",
                                      minWidth: "400px",
                                    }),
                                    dropdownIndicator: (base) => ({
                                      ...base,
                                      padding: "0 4px",
                                    }),
                                    clearIndicator: (base) => ({
                                      ...base,
                                      padding: "0 4px",
                                    }),
                                  }}
                                />
                              ) : header.column.id === "title_name" ? (
                                <select
                                  value={(header.column.getFilterValue() as string) ?? ""}
                                  onChange={(e) => {
                                    header.column.setFilterValue(e.target.value);
                                    setPagination({ ...pagination, pageIndex: 0 });
                                  }}
                                  className={`border rounded-md px-2 py-1 text-xs w-full bg-white focus:border-indigo-500 focus:ring-0 ${
                                    isFiltered ? "border-red-400" : "border-slate-300"
                                  }`}
                                >
                                  <option value="">All</option>
                                  {uniqueTitles.map((value) => (
                                    <option key={value} value={value}>
                                      {value}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  type="text"
                                  value={(header.column.getFilterValue() as string) ?? ""}
                                  onChange={(e) => {
                                    header.column.setFilterValue(e.target.value);
                                    setPagination({ ...pagination, pageIndex: 0 });
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
      <div className="bg-white/80 backdrop-blur-md rounded-2xl p-6 shadow-xl border border-white/20">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="inline-flex items-center px-4 py-2 border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              onClick={() => setPagination({ ...pagination, pageIndex: 0 })}
              disabled={pagination.pageIndex === 0}
            >
              ⏮️ First
            </button>
            <button
              className="inline-flex items-center px-4 py-2 border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              onClick={() => setPagination({ ...pagination, pageIndex: pagination.pageIndex - 1 })}
              disabled={pagination.pageIndex === 0}
            >
              ◀️ Previous
            </button>
            <button
              className="inline-flex items-center px-4 py-2 border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              onClick={() => setPagination({ ...pagination, pageIndex: pagination.pageIndex + 1 })}
              disabled={pagination.pageIndex >= pageCount - 1}
            >
              Next ▶️
            </button>
            <button
              className="inline-flex items-center px-4 py-2 border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              onClick={() => setPagination({ ...pagination, pageIndex: pageCount - 1 })}
              disabled={pagination.pageIndex >= pageCount - 1}
            >
              Last ⏭️
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4">
            <span className="ml-0 sm:ml-4 flex items-center gap-1 text-base text-zinc-900 font-bold">
              Showing {Math.min(data.length, pagination.pageSize)} of {totalRecords} records
            </span>
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <span>Page</span>
              <input
                type="number"
                min="1"
                max={pageCount}
                value={pagination.pageIndex + 1}
                onChange={(e) => {
                  const pageIndex = Number(e.target.value) - 1;
                  if (pageIndex >= 0 && pageIndex < pageCount) {
                    setPagination({ ...pagination, pageIndex });
                  }
                }}
                className="w-16 px-3 py-1 rounded-lg bg-gradient-to-r from-indigo-100 to-purple-100 text-indigo-800 font-bold text-center border-2 border-transparent focus:border-indigo-500 focus:ring-0 transition-all duration-200"
              />
              <span>of</span>
              <span className="inline-flex items-center px-3 py-1 rounded-lg bg-gradient-to-r from-slate-100 to-gray-100 text-slate-800 font-bold">
                {pageCount}
              </span>
            </div>
            <select
              value={pagination.pageSize}
              onChange={(e) => setPagination({ pageIndex: 0, pageSize: Number(e.target.value) })}
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
