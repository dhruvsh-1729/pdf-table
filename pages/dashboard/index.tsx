import { createClient } from "@supabase/supabase-js";
import { useState } from "react";
import { GetServerSideProps } from "next";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, Legend } from "recharts";
import { useMemo } from "react";

// Type definitions for props
interface DashboardProps {
  totals: {
    records: number;
    summaryEdits: number;
    conclusionEdits: number;
    users: number;
  };
  languageDistribution: { name: string; value: number }[];
  usageDistribution: { name: string; value: number }[];
  userActivity: { name: string; email: string; records: number; summaries: number; conclusions: number }[];
}

// Shared color palette
const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#A28DD0", "#FF6699"];

// Utility for formatting dates
const formatDate = (dateStr?: string) => {
  if (!dateStr) return "-";
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

export const getServerSideProps: GetServerSideProps<
  DashboardProps & {
    records: RecordRow[];
    languages: string[];
    authors: string[];
    emails: string[];
    titles: string[];
    creators: string[];
  }
> = async () => {
  const supabaseAdmin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Fetch total counts for each table
  const [recordsRes, summariesRes, conclusionsRes, usersRes] = await Promise.all([
    supabaseAdmin.from("records").select("*", { count: "exact" }),
    supabaseAdmin.from("summaries").select("*", { count: "exact" }),
    supabaseAdmin.from("conclusions").select("*", { count: "exact" }),
    supabaseAdmin.from("users").select("*", { count: "exact" }),
  ]);

  const totals = {
    records: recordsRes.count ?? 0,
    summaryEdits: summariesRes.count ?? 0,
    conclusionEdits: conclusionsRes.count ?? 0,
    users: usersRes.count ?? 0,
  };

  // Language distribution
  const { data: langRows } = await supabaseAdmin.from("records").select("language, count:language");

  const languageDistribution = (langRows ?? [])
    .filter((row) => row.language)
    .map((row) => ({ name: row.language as string, value: +(row.count as number) }));

  // Usage distribution: summaries vs conclusions
  const usageDistribution = [
    { name: "Summary Edits", value: totals.summaryEdits },
    { name: "Conclusion Edits", value: totals.conclusionEdits },
  ];

  // Fetch all records, summaries, and conclusions for table view and filters
  const [recordsDataRes, summariesDataRes, conclusionsDataRes] = await Promise.all([
    supabaseAdmin.from("records").select("*").order("timestamp", { ascending: false }),
    supabaseAdmin.from("summaries").select("id, name, email"),
    supabaseAdmin.from("conclusions").select("id, name, email"),
  ]);

  const recordsData = recordsDataRes.data ?? [];
  const summariesData = summariesDataRes.data ?? [];
  const conclusionsData = conclusionsDataRes.data ?? [];

  // Clean up records
  const processedRecords: RecordRow[] = recordsData.map((record) => {
    const formattedRecord: Partial<RecordRow> = {};
    for (const key in record) {
      let value = record[key];
      if (value === undefined) value = null;
      if (Array.isArray(value) && value.length === 1 && typeof value[0] === "string") value = value[0];
      if (typeof value !== "string" && value !== null) value = String(value);
      if (typeof value === "string") {
        let parsed = value;
        try {
          parsed = JSON.parse(value);
          if (Array.isArray(parsed) && parsed.length === 1 && typeof parsed[0] === "string") parsed = parsed[0];
        } catch {
          parsed = value;
        }
        if (typeof parsed === "string") {
          parsed = parsed
            .replace(/\\r\\n|\\n|\\r/g, "\n")
            .replace(/\\"/g, '"')
            .replace(/\\'/g, "'")
            .replace(/\\\\/g, "\\")
            .replace(/^\s+|\s+$/g, "");
          if (parsed.startsWith('"') && parsed.endsWith('"')) parsed = parsed.slice(1, -1);
        }
        value = parsed;
      }
      formattedRecord[key as keyof RecordRow] = value;
    }
    return {
      id: Number(formattedRecord.id ?? 0),
      name: String(formattedRecord.name ?? ""),
      pdf_url: String(formattedRecord.pdf_url ?? ""),
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
  const processedSummaries: SummaryRow[] = summariesData.map((summary) => ({
    id: Number(summary.id ?? 0),
    name: summary.name
      ? String(summary.name)
          .replace(/^"\[|"?\]?"$/g, "")
          .replace(/^\[|\]$/g, "")
          .replace(/^"+|"+$/g, "") // Remove leading/trailing double quotes
      : "",
    email: summary.email
      ? String(summary.email)
          .replace(/^"\[|"?\]?"$/g, "")
          .replace(/^\[|\]$/g, "")
          .replace(/^"+|"+$/g, "") // Remove leading/trailing double quotes
      : undefined,
  }));

  // Clean up conclusions
  const processedConclusions: ConclusionRow[] = conclusionsData.map((conclusion) => ({
    id: Number(conclusion.id ?? 0),
    name: conclusion.name
      ? String(conclusion.name)
          .replace(/^"\[|"?\]?"$/g, "")
          .replace(/^\[|\]$/g, "")
          .replace(/^"+|"+$/g, "") // Remove leading/trailing double quotes
      : "",
    email: conclusion.email
      ? String(conclusion.email)
          .replace(/^"\[|"?\]?"$/g, "")
          .replace(/^\[|\]$/g, "")
          .replace(/^"+|"+$/g, "") // Remove leading/trailing double quotes
      : undefined,
  }));

  // Unique values for filters
  const languages: string[] = Array.from(new Set(processedRecords.map((r) => r.language).filter(Boolean))) as string[];
  const authors: string[] = Array.from(
    new Set(
      processedRecords.flatMap((r) => {
        if (!r.authors) return [];
        // Split by comma, trim, filter empty
        return r.authors
          .split(",")
          .map((a: string) => a.trim())
          .filter(Boolean);
      }),
    ),
  ) as string[];
  const emails: string[] = Array.from(
    new Set([
      ...processedRecords.map((r) => r.email).filter(Boolean),
      ...summariesData.map((s) => s.email).filter(Boolean),
      ...conclusionsData.map((c) => c.email).filter(Boolean),
    ]),
  ) as string[];
  const titles: string[] = Array.from(new Set(processedRecords.map((r) => r.title_name).filter(Boolean))) as string[];
  const creators: string[] = Array.from(
    new Set(processedRecords.map((r) => r.creator_name).filter(Boolean)),
  ) as string[];

  // User activity insights
  const userActivityMap = new Map<
    string,
    { name: string; email: string; records: number; summaries: number; conclusions: number }
  >();

  // Process records
  processedRecords.forEach((r) => {
    if (r.email && r.creator_name) {
      const key = `${r.creator_name}|${r.email}`;
      const entry = userActivityMap.get(key) || {
        name: r.creator_name,
        email: r.email,
        records: 0,
        summaries: 0,
        conclusions: 0,
      };
      entry.records += 1;
      if (r.summary && r.summary.trim() !== "") {
        entry.summaries += 1;
      }
      if (r.conclusion && r.conclusion.trim() !== "") {
        entry.conclusions += 1;
      }
      userActivityMap.set(key, entry);
    }
  });

  // Process summaries
  processedSummaries.forEach((s) => {
    if (s.email && s.name) {
      const key = `${s.name}|${s.email}`;
      const entry = userActivityMap.get(key) || {
        name: s.name,
        email: s.email,
        records: 0,
        summaries: 0,
        conclusions: 0,
      };
      entry.summaries += 1;
      userActivityMap.set(key, entry);
    }
  });

  // Process conclusions
  processedConclusions.forEach((c) => {
    if (c.email && c.name) {
      const key = `${c.name}|${c.email}`;
      const entry = userActivityMap.get(key) || {
        name: c.name,
        email: c.email,
        records: 0,
        summaries: 0,
        conclusions: 0,
      };
      entry.conclusions += 1;
      userActivityMap.set(key, entry);
    }
  });

  // Process records
  processedRecords.forEach((r) => {
    if (r.email && r.creator_name) {
      const key = `${r.creator_name}|${r.email}`;
      const entry = userActivityMap.get(key) || {
        name: r.creator_name,
        email: r.email,
        records: 0,
        summaries: 0,
        conclusions: 0,
      };
      entry.records += 1;
      userActivityMap.set(key, entry);
    }
  });

  // Process summaries
  processedSummaries.forEach((s) => {
    if (s.email && s.name) {
      const key = `${s.name}|${s.email}`;
      const entry = userActivityMap.get(key) || {
        name: s.name,
        email: s.email,
        records: 0,
        summaries: 0,
        conclusions: 0,
      };
      entry.summaries += 1;
      userActivityMap.set(key, entry);
    }
  });

  // Process conclusions
  processedConclusions.forEach((c) => {
    if (c.email && c.name) {
      const key = `${c.name}|${c.email}`;
      const entry = userActivityMap.get(key) || {
        name: c.name,
        email: c.email,
        records: 0,
        summaries: 0,
        conclusions: 0,
      };
      entry.conclusions += 1;
      userActivityMap.set(key, entry);
    }
  });

  const userActivity = Array.from(userActivityMap.values())
    .sort((a, b) => b.records + b.summaries + b.conclusions - (a.records + a.summaries + a.conclusions))
    .slice(0, 10); // Top 10 users

  const { data: unconfirmedUsersRaw } = await supabaseAdmin
    .from("users")
    .select("name, email, confirmed")
    .eq("confirmed", false);

  const unconfirmedUsers =
    (unconfirmedUsersRaw ?? []).map((u) => ({
      name: u.name
        ? String(u.name)
            .replace(/^"\[|"?\]?"$/g, "")
            .replace(/^\[|\]$/g, "")
            .replace(/^"+|"+$/g, "")
        : "",
      email: u.email
        ? String(u.email)
            .replace(/^"\[|"?\]?"$/g, "")
            .replace(/^\[|\]$/g, "")
            .replace(/^"+|"+$/g, "")
        : "",
    })) ?? [];

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
      unconfirmedUsers,
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
  unconfirmedUsers,
}: DashboardProps & {
  records: RecordRow[];
  languages: string[];
  authors: string[];
  emails: string[];
  titles: string[];
  creators: string[];
  unconfirmedUsers: { name: string; email: string }[];
}) {
  const [filter, setFilter] = useState<FilterState>({ language: "", author: "", email: "", title: "", creator: "" });
  const [showDetails, setShowDetails] = useState<number | null>(null);
  const [unconfirmedUsersState, setUnconfirmedUsersState] =
    useState<{ name: string; email: string }[]>(unconfirmedUsers);

  type MagazineReport = {
    name: string;
    totalRecords: number;
    recordsWithSummaries: number;
    recordsWithConclusions: number;
    titles: string[];
    volumes: string[];
    authors: string[];
    languages: string[];
  };

  // add function here to confirm user
  const confirmUser = async (name: string, email: string) => {
    const formattedName = `["${name}"]`;
    const formattedEmail = `["${email}"]`;

    const response = await fetch("/api/confirm-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: formattedEmail, name: formattedName }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Error confirming user:", errorData);
      return;
    }

    // Update local state
    setUnconfirmedUsersState((prev) => prev.filter((u) => u.name !== name || u.email !== email));
  };

  const magazineReport: MagazineReport[] = useMemo(() => {
    // Group records by 'name' (magazine name)
    const map = new Map<string, MagazineReport>();
    records.forEach((r) => {
      const name = r.name || "Untitled";
      if (!map.has(name)) {
        map.set(name, {
          name,
          totalRecords: 0,
          recordsWithSummaries: 0,
          recordsWithConclusions: 0,
          titles: [],
          volumes: [],
          authors: [],
          languages: [],
        });
      }
      const entry = map.get(name)!;
      entry.totalRecords += 1;
      if (r.summary && r.summary.trim() !== "") entry.recordsWithSummaries += 1;
      if (r.conclusion && r.conclusion.trim() !== "") entry.recordsWithConclusions += 1;
      if (r.title_name && !entry.titles.includes(r.title_name)) entry.titles.push(r.title_name);
      if (r.volume && !entry.volumes.includes(r.volume)) entry.volumes.push(r.volume);
      if (r.authors) {
        r.authors
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean)
          .forEach((a) => {
            if (!entry.authors.includes(a)) entry.authors.push(a);
          });
      }
      if (r.language && !entry.languages.includes(r.language)) entry.languages.push(r.language);
    });
    // Sort by totalRecords descending
    return Array.from(map.values()).sort((a, b) => b.totalRecords - a.totalRecords);
  }, [records]);

  // Filter records
  const filteredRecords = records.filter(
    (r) =>
      (!filter.language || r.language === filter.language) &&
      (!filter.author ||
        (r.authors ?? "")
          .split(",")
          .map((a) => a.trim())
          .includes(filter.author)) &&
      (!filter.email || r.email === filter.email) &&
      (!filter.title || r.title_name === filter.title) &&
      (!filter.creator || r.creator_name === filter.creator),
  );

  // Insights
  const topAuthors = authors
    .map((author) => ({
      name: author,
      count: records.filter((r) =>
        (r.authors ?? "")
          .split(",")
          .map((a) => a.trim())
          .includes(author),
      ).length,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const topTitles = titles
    .map((title) => ({
      name: title,
      count: records.filter((r) => r.title_name === title).length,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const topCreators = creators
    .map((creator) => ({
      name: creator,
      count: records.filter((r) => r.creator_name === creator).length,
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
          onClick={() => (window.location.href = "/")}
        >
          Back to Table
        </button>
      </div>

      {/* add section here as a table to show name, email of unconfirmed users and then to confirm them with just a single click */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <span>Unconfirmed Users</span>
          <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-bold">
            {unconfirmedUsersState.length}
          </span>
        </h2>
        {unconfirmedUsersState.length > 0 ? (
          <div className="bg-white rounded-lg shadow border border-gray-100 p-4">
            <ul className="divide-y divide-gray-100">
              {unconfirmedUsersState.map((user) => (
                <li key={user.email} className="flex items-center gap-8 py-2">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold">
                      {user.name ? user.name.charAt(0).toUpperCase() : "?"}
                    </div>
                    <div>
                      <div className="font-medium text-gray-800">
                        {user.name || <span className="text-gray-400">No Name</span>}
                      </div>
                      <div className="text-xs text-gray-500">{user.email}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => confirmUser(user.name, user.email)}
                    className="inline-flex items-center px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition-colors"
                    title="Confirm this user"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Confirm
                  </button>
                </li>
              ))}
            </ul>
            <div className="text-xs text-gray-500 mt-2">
              Click <span className="font-semibold text-green-700">Confirm</span> to approve user access.
            </div>
          </div>
        ) : (
          <div className="text-gray-500 text-center py-6">All users are confirmed.</div>
        )}
      </section>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 gap-6 mb-12 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(totals).map(([key, value]) => (
          <div
            key={key}
            className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition-shadow"
          >
            <h2 className="text-sm font-medium text-gray-500 capitalize">{key}</h2>
            <p className="mt-2 text-3xl font-semibold text-gray-900">{value}</p>
          </div>
        ))}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition-shadow">
          <h2 className="text-sm font-medium text-gray-500">Records with Summaries</h2>
          <p className="mt-2 text-3xl font-semibold text-gray-900">
            {records.filter((r) => r.summary && r.summary.trim() !== "").length}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition-shadow">
          <h2 className="text-sm font-medium text-gray-500">Records with Conclusions</h2>
          <p className="mt-2 text-3xl font-semibold text-gray-900">
            {records.filter((r) => r.conclusion && r.conclusion.trim() !== "").length}
          </p>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
        {/* Summaries vs Conclusions Chart */}
        <section className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Summary/Conclusion Edit count Breakdown</h2>
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

      {/* Magazine Insights Cards */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Magazine wise Insights</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {magazineReport.map((mag) => (
            <div
              key={mag.name}
              className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl shadow p-6 border border-gray-100 flex flex-col"
            >
              <div className="flex items-center mb-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-200 flex items-center justify-center text-2xl font-bold text-blue-700">
                  {mag.name.charAt(0).toUpperCase()}
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-semibold text-gray-800">{mag.name}</h3>
                  <span className="text-xs text-gray-500">{mag.titles.length} different Titles</span>
                </div>
              </div>
              <div className="flex-1 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-gray-900">{mag.totalRecords}</span>
                  <span className="text-gray-500 text-sm">Records</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-semibold">
                    {mag.recordsWithSummaries} Summaries
                  </span>
                  <span className="inline-block bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-semibold">
                    {mag.recordsWithConclusions} Conclusions
                  </span>
                </div>
                <div className="mt-2">
                  <div className="text-xs text-gray-500 mb-1">Top Authors</div>
                  <div className="flex flex-wrap gap-1">
                    {mag.authors.map((a) => (
                      <span key={a} className="inline-block bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded text-xs">
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="mt-2">
                  <div className="text-xs text-gray-500 mb-1">Languages</div>
                  <div className="flex flex-wrap gap-1">
                    {mag.languages.map((l) => (
                      <span key={l} className="inline-block bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-xs">
                        {l}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="mt-2">
                  <div className="text-xs text-gray-500 mb-1">Volumes</div>
                  <div className="flex flex-wrap gap-1">
                    {mag.volumes.map((v) => (
                      <span key={v} className="inline-block bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs">
                        {v}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {magazineReport.length === 0 && (
            <div className="text-gray-500 text-center py-8 col-span-full">No magazine data available.</div>
          )}
        </div>
      </section>

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

      {/* Insights */}
      <section className="bg-white rounded-xl shadow-sm p-6 mb-12 border border-gray-100">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Insights</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div>
            <h3 className="text-lg font-medium text-gray-700 mb-2">Top Authors</h3>
            <ul className="list-disc ml-5 text-gray-600">
              {topAuthors.map((a) => (
                <li key={a.name} className="mb-1">
                  {a.name} <span className="text-gray-400">({a.count} records)</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-medium text-gray-700 mb-2">Top Titles</h3>
            <ul className="list-disc ml-5 text-gray-600">
              {topTitles.map((t) => (
                <li key={t.name} className="mb-1">
                  {t.name} <span className="text-gray-400">({t.count} records)</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-medium text-gray-700 mb-2">Top Creators</h3>
            <ul className="list-disc ml-5 text-gray-600">
              {topCreators.map((c) => (
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
