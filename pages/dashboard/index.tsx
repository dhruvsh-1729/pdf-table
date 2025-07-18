import { createClient } from '@supabase/supabase-js';
import { useState } from 'react';
import { GetServerSideProps } from 'next';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, Legend } from 'recharts';

// Initialize Supabase client with service-role key for server-side operations
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Type definitions for props
interface DashboardProps {
  totals: {
    records: number;
    summaries: number;
    conclusions: number;
    users: number;
  };
  languageDistribution: { name: string; value: number }[];
  usageDistribution: { name: string; value: number }[];
  userActivity: { name: string; email: string; records: number; summaries: number; conclusions: number }[];
}

// Shared color palette
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#A28DD0', '#FF6699'];

// Utility for formatting dates
const formatDate = (dateStr?: string) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString();
};

type RecordRow = {
  id: number;
  name: string;
  timestamp?: string | null;
  summary?: string | null;
  pdf_url: string;
  volume?: string | null;
  number?: string | null;
  title_name?: string | null;
  page_numbers?: string | null;
  authors?: string | null;
  language?: string | null;
  email?: string | null;
  creator_name?: string | null;
  conclusion?: string | null;
};

type SummaryRow = {
  id: number;
  name: string;
  email?: string;
};

type ConclusionRow = {
  id: number;
  name: string;
  email?: string;
};

type FilterState = {
  language: string;
  author: string;
  email: string;
  title: string;
  creator: string;
};

export const getServerSideProps: GetServerSideProps<DashboardProps & {
  records: RecordRow[];
  languages: string[];
  authors: string[];
  emails: string[];
  titles: string[];
  creators: string[];
}> = async () => {
  // Fetch total counts for each table
  const [recordsRes, summariesRes, conclusionsRes, usersRes] = await Promise.all([
    supabaseAdmin.from('records').select('*', { count: 'exact' }),
    supabaseAdmin.from('summaries').select('*', { count: 'exact' }),
    supabaseAdmin.from('conclusions').select('*', { count: 'exact' }),
    supabaseAdmin.from('users').select('*', { count: 'exact' }),
  ]);

  const totals = {
    records: recordsRes.count ?? 0,
    summaries: summariesRes.count ?? 0,
    conclusions: conclusionsRes.count ?? 0,
    users: usersRes.count ?? 0,
  };

  // Language distribution
  const { data: langRows } = await supabaseAdmin
    .from('records')
    .select('language, count:language');

  const languageDistribution = (langRows ?? [])
    .filter(row => row.language)
    .map(row => ({ name: row.language as string, value: +(row.count as number) }));

  // Usage distribution: summaries vs conclusions
  const usageDistribution = [
    { name: 'Summaries', value: totals.summaries },
    { name: 'Conclusions', value: totals.conclusions },
  ];

// Fetch all records, summaries, and conclusions for table view and filters
const [recordsDataRes, summariesDataRes, conclusionsDataRes] = await Promise.all([
    supabaseAdmin.from('records').select('*').order('timestamp', { ascending: false }),
    supabaseAdmin.from('summaries').select('id, name, email'),
    supabaseAdmin.from('conclusions').select('id, name, email'),
]);

const recordsData = recordsDataRes.data ?? [];
const summariesData = summariesDataRes.data ?? [];
const conclusionsData = conclusionsDataRes.data ?? [];

// Clean up records
const processedRecords: RecordRow[] = recordsData.map(record => {
    const formattedRecord: Partial<RecordRow> = {};
    for (const key in record) {
        let value = record[key];
        if (value === undefined) value = null;
        if (Array.isArray(value) && value.length === 1 && typeof value[0] === 'string') value = value[0];
        if (typeof value !== 'string' && value !== null) value = String(value);
        if (typeof value === 'string') {
            let parsed = value;
            try {
                parsed = JSON.parse(value);
                if (Array.isArray(parsed) && parsed.length === 1 && typeof parsed[0] === 'string') parsed = parsed[0];
            } catch {
                parsed = value;
            }
            if (typeof parsed === 'string') {
                parsed = parsed
                    .replace(/\\r\\n|\\n|\\r/g, '\n')
                    .replace(/\\"/g, '"')
                    .replace(/\\'/g, "'")
                    .replace(/\\\\/g, '\\')
                    .replace(/^\s+|\s+$/g, '');
                if (parsed.startsWith('"') && parsed.endsWith('"')) parsed = parsed.slice(1, -1);
            }
            value = parsed;
        }
        formattedRecord[key as keyof RecordRow] = value;
    }
    return {
        id: Number(formattedRecord.id ?? 0),
        name: String(formattedRecord.name ?? ''),
        pdf_url: String(formattedRecord.pdf_url ?? ''),
        timestamp: formattedRecord.timestamp ? String(formattedRecord.timestamp) : null,
        summary: formattedRecord.summary ? String(formattedRecord.summary) : null,
        volume: formattedRecord.volume ? String(formattedRecord.volume) : null,
        number: formattedRecord.number ? String(formattedRecord.number) : null,
        title_name: formattedRecord.title_name ? String(formattedRecord.title_name) : null,
        page_numbers: formattedRecord.page_numbers ? String(formattedRecord.page_numbers) : null,
        authors: formattedRecord.authors ? String(formattedRecord.authors) : null,
        language: formattedRecord.language ? String(formattedRecord.language) : null,
        email: formattedRecord.email ? String(formattedRecord.email) : null,
        creator_name: formattedRecord.creator_name ? String(formattedRecord.creator_name) : null,
        conclusion: formattedRecord.conclusion ? String(formattedRecord.conclusion) : null,
    };
});

// Clean up summaries
const processedSummaries: SummaryRow[] = summariesData.map(summary => ({
    id: Number(summary.id ?? 0),
    name: summary.name
        ? String(summary.name)
            .replace(/^"\[|"?\]?"$/g, '')
            .replace(/^\[|\]$/g, '')
            .replace(/^"+|"+$/g, '') // Remove leading/trailing double quotes
        : '',
    email: summary.email
        ? String(summary.email)
            .replace(/^"\[|"?\]?"$/g, '')
            .replace(/^\[|\]$/g, '')
            .replace(/^"+|"+$/g, '') // Remove leading/trailing double quotes
        : undefined,
}));

// Clean up conclusions
const processedConclusions: ConclusionRow[] = conclusionsData.map(conclusion => ({
    id: Number(conclusion.id ?? 0),
    name: conclusion.name
        ? String(conclusion.name)
            .replace(/^"\[|"?\]?"$/g, '')
            .replace(/^\[|\]$/g, '')
            .replace(/^"+|"+$/g, '') // Remove leading/trailing double quotes
        : '',
    email: conclusion.email
        ? String(conclusion.email)
            .replace(/^"\[|"?\]?"$/g, '')
            .replace(/^\[|\]$/g, '')
            .replace(/^"+|"+$/g, '') // Remove leading/trailing double quotes
        : undefined,
}));

// Unique values for filters
const languages: string[] = Array.from(new Set(processedRecords.map(r => r.language).filter(Boolean))) as string[];
const authors: string[] = Array.from(new Set(processedRecords.flatMap(r => {
    if (!r.authors) return [];
    // Split by comma, trim, filter empty
    return r.authors.split(',').map((a: string) => a.trim()).filter(Boolean);
}))) as string[];
const emails: string[] = Array.from(new Set([
    ...processedRecords.map(r => r.email).filter(Boolean),
    ...summariesData.map(s => s.email).filter(Boolean),
    ...conclusionsData.map(c => c.email).filter(Boolean),
])) as string[];
const titles: string[] = Array.from(new Set(processedRecords.map(r => r.title_name).filter(Boolean))) as string[];
const creators: string[] = Array.from(new Set(processedRecords.map(r => r.creator_name).filter(Boolean))) as string[];

// User activity insights
const userActivityMap = new Map<string, { name: string; email: string; records: number; summaries: number; conclusions: number }>();

// Process records
processedRecords.forEach(r => {
    if (r.email && r.creator_name) {
        const key = `${r.creator_name}|${r.email}`;
        const entry = userActivityMap.get(key) || { name: r.creator_name, email: r.email, records: 0, summaries: 0, conclusions: 0 };
        entry.records += 1;
        userActivityMap.set(key, entry);
    }
});

// Process summaries
processedSummaries.forEach(s => {
    if (s.email && s.name) {
        const key = `${s.name}|${s.email}`;
        const entry = userActivityMap.get(key) || { name: s.name, email: s.email, records: 0, summaries: 0, conclusions: 0 };
        entry.summaries += 1;
        userActivityMap.set(key, entry);
    }
});

// Process conclusions
processedConclusions.forEach(c => {
    if (c.email && c.name) {
        const key = `${c.name}|${c.email}`;
        const entry = userActivityMap.get(key) || { name: c.name, email: c.email, records: 0, summaries: 0, conclusions: 0 };
        entry.conclusions += 1;
        userActivityMap.set(key, entry);
    }
});

const userActivity = Array.from(userActivityMap.values())
    .sort((a, b) => (b.records + b.summaries + b.conclusions) - (a.records + a.summaries + a.conclusions))
    .slice(0, 10); // Top 10 users

return {
    props: {
        totals,
        languageDistribution,
        usageDistribution,
        userActivity,
        records: processedRecords,
        languages,
        authors,
        emails,
        titles,
        creators,
    },
};
};

export default function Dashboard({
  totals,
  languageDistribution,
  usageDistribution,
  userActivity,
  records,
  languages,
  authors,
  emails,
  titles,
  creators,
}: DashboardProps & {
  records: RecordRow[];
  languages: string[];
  authors: string[];
  emails: string[];
  titles: string[];
  creators: string[];
}) {
  const [filter, setFilter] = useState<FilterState>({ language: '', author: '', email: '', title: '', creator: '' });
  const [showDetails, setShowDetails] = useState<number | null>(null);

  // Filter records
  const filteredRecords = records.filter(r =>
    (!filter.language || r.language === filter.language) &&
    (!filter.author || (r.authors ?? '').split(',').map(a => a.trim()).includes(filter.author)) &&
    (!filter.email || r.email === filter.email) &&
    (!filter.title || r.title_name === filter.title) &&
    (!filter.creator || r.creator_name === filter.creator)
  );

  // Insights
  const topAuthors = authors
    .map(author => ({
      name: author,
      count: records.filter(r => (r.authors ?? '').split(',').map(a => a.trim()).includes(author)).length,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const topTitles = titles
    .map(title => ({
      name: title,
      count: records.filter(r => r.title_name === title).length,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const topCreators = creators
    .map(creator => ({
      name: creator,
      count: records.filter(r => r.creator_name === creator).length,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 md:text-4xl">📊 Application Usage Dashboard</h1>
        <p className="mt-2 text-gray-600">Comprehensive insights into user activity and content distribution</p>
      </header>
    <div className="mb-6">
        <button
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition-colors"
            onClick={() => window.location.href = '/'}
        >
            Back to Table
        </button>
    </div>

      {/* Metrics Grid */}
    <div className="grid grid-cols-1 gap-6 mb-12 sm:grid-cols-2 lg:grid-cols-4">
      {Object.entries(totals).map(([key, value]) => (
        <div key={key} className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition-shadow">
        <h2 className="text-sm font-medium text-gray-500 capitalize">{key}</h2>
        <p className="mt-2 text-3xl font-semibold text-gray-900">{value}</p>
        </div>
      ))}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition-shadow">
        <h2 className="text-sm font-medium text-gray-500">Records with Summaries</h2>
        <p className="mt-2 text-3xl font-semibold text-gray-900">
        {
          records.filter(r => r.summary && r.summary.trim() !== '').length
        }
        </p>
      </div>
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition-shadow">
        <h2 className="text-sm font-medium text-gray-500">Records with Conclusions</h2>
        <p className="mt-2 text-3xl font-semibold text-gray-900">
        {
          records.filter(r => r.conclusion && r.conclusion.trim() !== '').length
        }
        </p>
      </div>
    </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
        {/* Summaries vs Conclusions Chart */}
        <section className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Content Breakdown</h2>
          <div className="w-full h-80">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={usageDistribution}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={60}
                  outerRadius={100}
                  label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(1)}%)`}
                  labelLine
                >
                  {usageDistribution.map((entry, idx) => (
                    <Cell key={`cell-usage-${idx}`} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => `${value} items`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* User Activity Chart */}
      <section className="bg-white rounded-xl shadow-sm p-6 mb-12 border border-gray-100">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Top User Activity</h2>
        <div className="w-full h-96">
          <ResponsiveContainer>
            <BarChart data={userActivity} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={60} />
              <YAxis />
              <Tooltip formatter={(value: number, name: string) => [`${value} ${name.toLowerCase()}`, name]} />
              <Legend />
              <Bar dataKey="records" fill={COLORS[0]} name="Records" />
              <Bar dataKey="summaries" fill={COLORS[1]} name="Summaries" />
              <Bar dataKey="conclusions" fill={COLORS[2]} name="Conclusions" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Filters */}
      {/* <section className="bg-white rounded-xl shadow-sm p-6 mb-12 border border-gray-100">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Filter Records</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            value={filter.language}
            onChange={e => setFilter(f => ({ ...f, language: e.target.value }))}
          >
            <option value="">All Languages</option>
            {languages.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            value={filter.author}
            onChange={e => setFilter(f => ({ ...f, author: e.target.value }))}
          >
            <option value="">All Authors</option>
            {authors.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            value={filter.email}
            onChange={e => setFilter(f => ({ ...f, email: e.target.value }))}
          >
            <option value="">All Emails</option>
            {emails.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            value={filter.title}
            onChange={e => setFilter(f => ({ ...f, title: e.target.value }))}
          >
            <option value="">All Titles</option>
            {titles.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            value={filter.creator}
            onChange={e => setFilter(f => ({ ...f, creator: e.target.value }))}
          >
            <option value="">All Creators</option>
            {creators.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </section> */}

      {/* Insights */}
      <section className="bg-white rounded-xl shadow-sm p-6 mb-12 border border-gray-100">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Insights</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div>
            <h3 className="text-lg font-medium text-gray-700 mb-2">Top Authors</h3>
            <ul className="list-disc ml-5 text-gray-600">
              {topAuthors.map(a => (
                <li key={a.name} className="mb-1">
                  {a.name} <span className="text-gray-400">({a.count} records)</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-medium text-gray-700 mb-2">Top Titles</h3>
            <ul className="list-disc ml-5 text-gray-600">
              {topTitles.map(t => (
                <li key={t.name} className="mb-1">
                  {t.name} <span className="text-gray-400">({t.count} records)</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-medium text-gray-700 mb-2">Top Creators</h3>
            <ul className="list-disc ml-5 text-gray-600">
              {topCreators.map(c => (
                <li key={c.name} className="mb-1">
                  {c.name} <span className="text-gray-400">({c.count} records)</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}