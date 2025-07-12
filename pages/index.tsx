import { useState, useEffect, ChangeEvent, MouseEvent, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  FilterFn,
  flexRender,
} from '@tanstack/react-table';
import { rankItem } from '@tanstack/match-sorter-utils';
import { useRouter } from 'next/router';
import BugModal from '@/components/BugModal';
import CreatableSelect from 'react-select/creatable';

export interface EditHistory {
  count: number;
  editors: string[];
  editorCounts: Record<string, number>;
  latestEditor: {
    name: string;
    email: string;
    editedAt: string;
    timeFromNow: string;
  } | null;
}

export interface MagazineRecord {
  id: number;
  name: string;
  timestamp: string | null;
  summary: string | null;
  pdf_url: string;
  volume: string | null;
  number: string | null;
  title_name: string | null;
  page_numbers: string | null;
  authors: string | null;
  language: string | null;
  email: string | null;
  creator_name: string | null;
  conclusion: string | null;
  editHistory?: EditHistory;
}

const fuzzyFilter: FilterFn<MagazineRecord> = (row, columnId, value, addMeta) => {
  const itemRank = rankItem(row.getValue(columnId), value);
  addMeta({ itemRank });
  return itemRank.passed;
}

export default function Home() {
  const router = useRouter();

  const [records, setRecords] = useState<MagazineRecord[]>([]);
  const [name, setName] = useState<string>('');
  const [summary, setSummary] = useState<string>('');
  const [conclusion, setConclusion] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [volume, setVolume] = useState<string>('');
  const [number, setNumber] = useState<string>('');
  const [timestamp, setTimestamp] = useState<string>("");
  const [titleName, setTitleName] = useState<string>('');
  const [pageNumbers, setPageNumbers] = useState<string>('');
  const [authors, setAuthors] = useState<string>('');
  const [language, setLanguage] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editingRecord, setEditingRecord] = useState<MagazineRecord | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [fetchedEmails, setFetchedEmails] = useState<{ creator_name: string; email: string }[]>([]);
  const [expanded, setExpanded] = useState<number>(-1);

  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);

  const [user, setUser] = useState<string | null>(null);
  const [access, setAccess] = useState<string | null>(null);
  const [bugModalOpen, setBugModalOpen] = useState<boolean>(false);
  const [tableLoading, setTableLoading] = useState<boolean>(false);
  const [showFileSize, setShowFileSize] = useState<boolean>(false);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        if (parsedUser) {
          setUser(parsedUser);
          setAccess(parsedUser.access || null);
        }
      } catch (error) {
        console.error('Error parsing user data:', error);
      }
    }
  }, []);

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (user) {
      try {
        const parsedUser = JSON.parse(user);
        if (parsedUser && parsedUser.name && parsedUser.email && parsedUser.access) {
          fetchEmails();
          fetchRecords();
        } else {
          router.push('/login');
        }
      } catch (error) {
        console.error('Error parsing user data:', error);
        router.push('/login');
      }
    } else {
      router.push('/login');
    }
  }, []);

  useEffect(() => {
    if (selectedEmail !== null) {
      fetchRecords();
    }
  }, [selectedEmail]);

  const fetchRecords = async (): Promise<void> => {
    try {
      setTableLoading(true);
      const queryParam = selectedEmail ? `?email=${encodeURIComponent(selectedEmail)}` : '';
      const response = await fetch(`/api/records${queryParam}`);
      if (!response.ok) throw new Error('Failed to fetch records');
      const data: MagazineRecord[] = await response.json();
      setRecords(data);
    } catch (err) {
      console.error('Error:', err);
      setError('Failed to load records');
    } finally {
      setTableLoading(false);
    }
  };

  const fetchEmails = async (): Promise<void> => {
    try {
      const response = await fetch('/api/get-emails');
      if (!response.ok) throw new Error('Failed to fetch emails');
      const data = await response.json();
      setFetchedEmails(data);
    } catch (err) {
      console.error('Error fetching emails:', err);
    }
  };

  const columns = useMemo<ColumnDef<MagazineRecord>[]>(() => [
    { accessorKey:'id', header: 'ID', id: 'id',
      cell: ({ row }) => (
        <span className="text-gray-600">{row.original.id}</span>
      ),
      enableSorting: false,
      enableColumnFilter: false,
     },
    { accessorKey: 'name', header: 'Magazine Name', id: 'name' },
    { accessorKey: 'timestamp', header: 'Timestamp', id: 'timestamp' },
    {
      accessorKey: 'summary',
      header: 'Summary',
      id: 'summary',
      size: 500,
      cell: ({ row }) => {
        const summary = row.original.summary || '';
        const isLong = summary.length > 50;
        const displayText = expanded || !isLong ? summary : summary.slice(0, 50) + '...';

        return (
          <div>
            <span>
              {expanded === row.original.id || !isLong
                ? summary
                : summary.slice(0, 50) + '...'}
            </span>
            {/* {isLong && (
              <button
                type="button"
                className="ml-2 text-indigo-600 hover:underline text-xs"
                onClick={e => {
                  e.stopPropagation();
                  setExpanded(expanded === row.original.id ? -1 : row.original.id);
                }}
              >
                {expanded === row.original.id ? 'Show Less' : 'Show More'}
              </button>
            )} */}
          </div>
        );
      },
        },
        {
      accessorKey: 'conclusion',
      header: 'Conclusion',
      id: 'conclusion',
      size: 500,
      cell: ({ row }) => {
        const conclusion = row.original.conclusion || '';
        const isLong = conclusion.length > 50;
        return (
          <div>
        <span>
          {expanded === row.original.id
            ? conclusion
            : conclusion.slice(0, 50) + '...'}
        </span>
        {/* {isLong && (
          <button
            type="button"
            className="ml-2 text-indigo-600 hover:underline text-xs"
            onClick={e => {
          e.stopPropagation();
          setExpanded(expanded === `conclusion-${row.original.id}` ? -1 : `conclusion-${row.original.id}`);
            }}
          >
            {expanded === `conclusion-${row.original.id}` ? 'Show Less' : 'Show More'}
          </button>
        )} */}
          </div>
        );
      },
        },
        { accessorKey: 'volume', header: 'Volume', id: 'volume' },
        { accessorKey: 'number', header: 'Number', id: 'number' },
        { accessorKey: 'title_name', header: 'Title Name', id: 'title_name' },
        { accessorKey: 'page_numbers', header: 'Page Numbers', id: 'page_numbers' },
        { accessorKey: 'authors', header: 'Authors', id: 'authors' },
        { accessorKey: 'language', header: 'Language', id: 'language' },
        {
      accessorKey: 'pdf_url',
      header: 'PDF',
      id: 'pdf_url',
      cell: ({ row }) => (
        <a href={row.original.pdf_url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
          View
        </a>
      ),
    },
    {
      id: 'editHistory',
      header: 'Edit History',
      cell: ({ row }) => {
        const editHistory = row.original.editHistory;
        if (!editHistory) return <span className="text-gray-400 italic">No history</span>;
        return (
          <div className="text-xs w-32 space-y-0.5">
            <div>
              <span className="font-semibold">Edits:</span> {editHistory.count}
              {editHistory.latestEditor && (
                <>
                  {' · '}
                  <span className="font-semibold">Latest:</span> {editHistory.latestEditor.name}
                  <span className="text-gray-400"> ({editHistory.latestEditor.timeFromNow})</span>
                </>
              )}
            </div>
            <div>
              <span className="font-semibold">Editors:</span>{' '}
              {editHistory.editors.length ? editHistory.editors.join(', ') : <span className="text-gray-400">-</span>}
            </div>
            <div>
              <span className="font-semibold">By:</span>{' '}
              {Object.entries(editHistory.editorCounts).map(([editor, count]) => `${editor}: ${count}`).join(', ')}
            </div>
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <button
          className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 text-xs"
          onClick={() => {
            const record = row.original;
            setEditingRecord(record);
            setModalOpen(true);
            setError(null);
            setName(record.name || '');
            setSummary(record.summary || '');
            setConclusion(record.conclusion || '');
            setVolume(record.volume || '');
            setNumber(record.number || '');
            setTimestamp(record.timestamp || '');
            setTitleName(record.title_name || '');
            setPageNumbers(record.page_numbers || '');
            setAuthors(record.authors || '');
            setLanguage(record.language || '');
            setFile(null);
          }}
        >
          Update
        </button>
      ),
    },
  ], []);

  const exportToCSV = () => {
    const headers = columns.map(column => column.header).filter(header => typeof header === 'string') as string[];
    const rows = records.map(record =>
      headers.map(header => {
        const column = columns.find(column => column.header === header && 'accessorKey' in column);
        if (column && column.id) {
          const key = column.id as keyof MagazineRecord;
          return record[key] ?? '';
        }
        return '';
      })
    );

    const csvContent = [headers.join(','), ...rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'records.csv';
    link.click();
  };

  const table = useReactTable({
    data: records,
    columns,
    filterFns: { fuzzy: fuzzyFilter },
    state: { columnFilters, globalFilter, sorting },
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    globalFilterFn: fuzzyFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const handleSubmit = async (e: MouseEvent<HTMLButtonElement>): Promise<void> => {
    e.preventDefault();
    if (!name || !summary || (!file && !editingRecord)) {
      setError('Please provide a name, summary and select a PDF file');
      return;
    }
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('name', name);
    formData.append('summary', summary);
    if (file) formData.append('pdf', file);
    formData.append('volume', volume);
    formData.append('number', number);
    formData.append('title_name', titleName);
    formData.append('page_numbers', pageNumbers);
    formData.append('authors', authors);
    formData.append('language', language);
    formData.append('timestamp', timestamp);
    formData.append('conclusion', conclusion || '');

    const user = localStorage.getItem('user');
    if (user) {
      try {
        const parsedUser = JSON.parse(user);
        if (parsedUser.name) formData.append('creator_name', parsedUser.name);
        if (parsedUser.email) formData.append('email', parsedUser.email);
      } catch (error) {
        console.error('Error parsing user data:', error);
        setError('Failed to retrieve user information');
        setLoading(false);
        return;
      }
    }

    if (editingRecord) {
      formData.append('id', String(editingRecord.id));
    }

    try {
      const url = editingRecord ? '/api/update-record' : '/api/upload';
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed');
      }
      await fetchRecords();
      await fetchEmails();
      setName('');
      setSummary('');
      setConclusion('');
      setFile(null);
      setVolume('');
      setNumber('');
      setTitleName('');
      setPageNumbers('');
      setAuthors('');
      setLanguage('');
      setModalOpen(false);
      setTimestamp("");
      setEditingRecord(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const selectedFile = e.target.files?.[0] || null;
    if (selectedFile && selectedFile.size > 4 * 1024 * 1024) {
      setShowFileSize(true);
      e.target.value = '';
      setFile(null);
      return;
    }
    setShowFileSize(false);
    setFile(selectedFile);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-2 sm:px-2 lg:px-2 w-full">
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white shadow-lg rounded-lg p-8 w-full max-w-4xl relative h-[90vh] overflow-hidden">
            <button
              onClick={() => setModalOpen(false)}
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-800 text-xl focus:outline-none focus:ring-2 focus:ring-gray-300"
              aria-label="Close form"
              disabled={loading}
            >
              ×
            </button>
            <h1 className="text-2xl font-semibold text-gray-800 mb-6">{editingRecord ? 'Update' : 'Upload New'} Record</h1>
            {error && <p className="text-red-500 mb-4 text-sm">{error}</p>}
            <div className="space-y-4 overflow-y-auto h-[calc(100%-4rem)] pr-4">
              <p className="text-sm text-gray-500">Fields marked with <span className="text-red-500">*</span> are required.</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Name <span className="text-red-500">*</span>
                  </label>
                  {/* <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter record name"
                    className="mt-1 block w-full rounded-lg border border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm disabled:bg-gray-100 px-3 py-2"
                    disabled={loading}
                    required
                  /> */}
                  <CreatableSelect
                    isClearable
                    value={name ? { label: name, value: name } : null}
                    onChange={option => setName(option ? option.value : '')}
                    onCreateOption={inputValue => setName(inputValue)}
                    options={
                      Array.from(new Set(records.map(r => r.name).filter(Boolean)))
                        .map(n => ({ label: n, value: n }))
                    }
                    placeholder="Select or enter magazine name"
                    isDisabled={loading}
                    classNamePrefix="react-select"
                    styles={{
                      control: (base) => ({
                        ...base,
                        minHeight: '38px',
                        borderRadius: '0.5rem',
                        borderColor: '#d1d5db',
                        boxShadow: 'none',
                        fontSize: '0.875rem',
                        paddingLeft: '0.25rem',
                        paddingRight: '0.25rem',
                      }),
                      menu: (base) => ({
                        ...base,
                        zIndex: 9999,
                      }),
                    }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    PDF File {editingRecord ? '(optional, to replace existing)' : <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={handleFileChange}
                    className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border file:border-gray-300 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 disabled:file:bg-gray-200"
                    disabled={loading}
                  />
                  <p className="mt-1 text-xs text-gray-500">Only PDF files are accepted.</p>
                </div>
                {showFileSize && (
                  <div className="mt-2 p-2 rounded border border-red-300 bg-red-50 flex items-center gap-2 text-xs text-red-700">
                    <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01" />
                    </svg>
                    <span>
                      File too large (&gt;4MB). Compress at&nbsp;
                      <a href="https://www.ilovepdf.com/compress_pdf" target="_blank" rel="noopener noreferrer" className="underline text-indigo-600">
                        ilovepdf.com
                      </a>
                      &nbsp;and re-upload once size is less than 4MB.
                    </span>
                  </div>
                )}
              </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Summary <span className="text-red-500">*</span>
                  </label>
                    <textarea
                    value={
                      summary
                      // Replace escaped newlines with real newlines
                      .replace(/\\r\\n|\\n|\\r/g, '\n')
                    }
                    onChange={e => {
                      // Convert newlines to escaped newlines for storage
                      const raw = e.target.value;
                      // Replace all \n with \\n for storage (to match how summary is stored)
                      // setSummary(raw.replace(/\r\n|\n|\r/g, '\\n'));
                      setSummary(raw);
                    }}
                    placeholder="Enter summary"
                    className="mt-1 block w-full rounded-lg border border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm disabled:bg-gray-100 px-3 py-2"
                    disabled={loading}
                    rows={6}
                  />
                </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Volume</label>
                  <input
                    type="text"
                    value={volume}
                    onChange={(e) => setVolume(e.target.value)}
                    placeholder="Enter volume (optional)"
                    className="mt-1 block w-full rounded-lg border border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm disabled:bg-gray-100 px-3 py-2"
                    disabled={loading}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Number</label>
                  <input
                    type="text"
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    placeholder="Enter number (optional)"
                    className="mt-1 block w-full rounded-lg border border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm disabled:bg-gray-100 px-3 py-2"
                    disabled={loading}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Timestamp</label>
                  <input
                    type="text"
                    value={timestamp}
                    onChange={(e) => setTimestamp(e.target.value)}
                    placeholder="Enter timestamp (optional)"
                    className="mt-1 block w-full rounded-lg border border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm disabled:bg-gray-100 px-3 py-2"
                    disabled={loading}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Title Name</label>
                  <input
                    type="text"
                    value={titleName}
                    onChange={(e) => setTitleName(e.target.value)}
                    placeholder="Enter title name (optional)"
                    className="mt-1 block w-full rounded-lg border border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm disabled:bg-gray-100 px-3 py-2"
                    disabled={loading}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Page Numbers</label>
                  <input
                    type="text"
                    value={pageNumbers}
                    onChange={(e) => setPageNumbers(e.target.value)}
                    placeholder="Enter page numbers, e.g., 100-105 (optional)"
                    className="mt-1 block w-full rounded-lg border border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm disabled:bg-gray-100 px-3 py-2"
                    disabled={loading}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Authors</label>
                  <input
                    type="text"
                    value={authors}
                    onChange={(e) => setAuthors(e.target.value)}
                    placeholder="Enter authors separated by commas (optional)"
                    className="mt-1 block w-full rounded-lg border border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm disabled:bg-gray-100 px-3 py-2"
                    disabled={loading}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Language</label>
                  <input
                    type="text"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    placeholder="Enter language (optional)"
                    className="mt-1 block w-full rounded-lg border border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm disabled:bg-gray-100 px-3 py-2"
                    disabled={loading}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Conclusion (by maharaj saheb)</label>
                <textarea
                  value={conclusion}
                  onChange={(e) => setConclusion(e.target.value)}
                  placeholder="Enter conclusion (optional)"
                  className="mt-1 block w-full rounded-lg border border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm disabled:bg-gray-100 px-3 py-2"
                  disabled={loading}
                  rows={5}
                />
              </div>
              <button
                type="button"
                onClick={handleSubmit}
                className={`w-full py-2 px-4 rounded-lg shadow-md text-white text-sm font-medium transition-colors ${loading
                  ? 'bg-gray-400 cursor-not-allowed'
                  : editingRecord
                    ? 'bg-yellow-500 hover:bg-yellow-600 focus:ring-yellow-500'
                    : 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500'
                  } focus:outline-none focus:ring-2 focus:ring-offset-2`}
                disabled={loading}
              >
                {loading ? (editingRecord ? 'Updating...' : 'Uploading...') : (editingRecord ? 'Update' : 'Upload')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="w-full">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold text-gray-800">Magazine Summary Records</h2>
          <div className="flex gap-4">
            <button
              onClick={() => {
                localStorage.setItem('user', JSON.stringify(null));
                router.push('/login');
              }}
              className="bg-red-600 text-white py-2 px-4 rounded-md shadow-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
            >
              Logout
            </button>
            <select
              value={selectedEmail || ''}
              onChange={(e) => setSelectedEmail(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Show All</option>
              {fetchedEmails.map(({ creator_name, email }) => (
                <option key={email} value={email}>
                  {`${creator_name} (${email})`}
                </option>
              ))}
            </select>
            <button
              onClick={() => setBugModalOpen(true)}
              className='bg-gray-200 text-gray-700 py-2 px-4 rounded-md shadow-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors'
            >
              Report Bug
            </button>
            <button
              onClick={exportToCSV}
              className="bg-green-600 text-white py-2 px-4 rounded-md shadow-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors"
            >
              Export CSV
            </button>
            <input
              type="text"
              value={globalFilter}
              onChange={e => setGlobalFilter(e.target.value)}
              placeholder="Search all records..."
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {access && access === "records" && (
              <button
                onClick={() => {
                  setModalOpen(true);
                  setError(null);
                  setName('');
                  setSummary('');
                  setConclusion('');
                  setFile(null);
                  setVolume('');
                  setNumber('');
                  setTitleName('');
                  setPageNumbers('');
                  setAuthors('');
                  setLanguage('');
                  setTimestamp("");
                  setEditingRecord(null);
                }}
                className="bg-indigo-600 text-white py-2 px-4 rounded-md shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
              >
                + Add Record
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto w-full shadow rounded-lg border border-gray-200">
          {tableLoading ?
            <div className="flex items-center justify-center p-6">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              <span className="ml-2 text-gray-700">Loading records, please wait...</span>
            </div>
            :
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-100">
                {table.getHeaderGroups().map(headerGroup => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map(header => (
                      <th
                        key={header.id}
                        colSpan={header.colSpan}
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        <div
                          {...{
                            className: header.column.getCanSort()
                              ? 'cursor-pointer select-none flex items-center font-bold'
                              : '',
                            onClick: header.column.getToggleSortingHandler(),
                          }}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {{ asc: ' 🔼', desc: ' 🔽' }[header.column.getIsSorted() as string] ?? null}
                        </div>
                        {header.column.getCanFilter() && (
                          <div className="mt-1">
                            {header.column.id === 'name' ? (
                              <select
                                value={(header.column.getFilterValue() as string) ?? ''}
                                onChange={e => {
                                  header.column.setFilterValue(e.target.value);
                                  setSorting(prev => [...prev, { id: 'volume', desc: false }]);
                                }
                                }
                                className="border border-gray-300 rounded px-1 py-0.5 text-xs w-full max-w-xs"
                              >
                                <option value="">All</option>
                                {[...new Set(records.map(r => r.name).filter(Boolean))].map(name => (
                                  <option key={name} value={name}>
                                    {name}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                value={(header.column.getFilterValue() as string) ?? ''}
                                onChange={e => header.column.setFilterValue(e.target.value)}
                                placeholder={`Filter...`}
                                className="border border-gray-300 rounded px-1 py-0.5 text-xs w-full max-w-xs"
                              />
                            )}
                          </div>
                        )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {table.getRowModel().rows.length ? (
                  table.getRowModel().rows.map(row => (
                    <tr key={row.id} className="hover:bg-gray-50">
                      {row.getVisibleCells().map(cell => (
                        <td
                          key={cell.id}
                          className="px-6 py-4 whitespace-normal text-sm text-gray-700 max-w-xs break-words"
                          onClick={(e: any) => {
                            if (e.target === e.currentTarget) {
                              window.open(`/history/${row.original.id}`, '_blank');
                            }
                          }}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={columns.length} className="px-6 py-4 text-center text-sm text-gray-500">
                      No records found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>}
        </div>

        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-2">
            <button className="border rounded p-1" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}>
              {'<<'}
            </button>
            <button className="border rounded p-1" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
              {'<'}
            </button>
            <button className="border rounded p-1" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              {'>'}
            </button>
            <button className="border rounded p-1" onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={!table.getCanNextPage()}>
              {'>>'}
            </button>
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1 text-sm">
              <div>Page</div>
              <strong>{table.getState().pagination.pageIndex + 1} of {table.getPageCount()}</strong>
            </span>
            <select
              value={table.getState().pagination.pageSize}
              onChange={e => table.setPageSize(Number(e.target.value))}
              className="border rounded px-2 py-1 text-sm"
            >
              {[10, 20, 30, 40, 50].map(pageSize => (
                <option key={pageSize} value={pageSize}>Show {pageSize}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <BugModal
        isOpen={bugModalOpen}
        onClose={() => setBugModalOpen(false)}
      />
    </div>
  );
}