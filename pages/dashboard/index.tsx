import { createClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { GetServerSideProps } from "next";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, Legend } from "recharts";
import { useMemo } from "react";
import { useRouter } from "next/router";

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

// Admin emails with full access
const ADMIN_EMAILS = ["dharmsasanwork99@gmail.com", "dhruvshdarshansh@gmail.com"];

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
  record_id?: number;
};

type ConclusionRow = {
  id: number;
  name: string;
  email?: string;
  record_id?: number;
};

type FilterState = {
  language: string;
  author: string;
  email: string;
  title: string;
  creator: string;
};

// New types for user magazine activity
type UserMagazineActivity = {
  userName: string;
  userEmail: string;
  recordsCreated: {
    magazineName: string;
    count: number;
    volumes: string[];
    titles: string[];
    pageNumbers: string[];
    authors: string[];
    languages: string[];
  }[];
  summariesEdited: {
    magazineName: string;
    count: number;
    volumes: string[];
    titles: string[];
    pageNumbers: string[];
    recordIds: number[];
  }[];
  conclusionsEdited: {
    magazineName: string;
    count: number;
    volumes: string[];
    titles: string[];
    pageNumbers: string[];
    recordIds: number[];
  }[];
  totalActivity: number;
};

type User = {
  name: string;
  email: string;
  access: string;
  work_done?: boolean;
};

// Work Completion Modal Component
const WorkCompletionModal = ({
  isOpen,
  onClose,
  onConfirm,
  isLoading,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
        <div className="flex items-center mb-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="ml-4">
            <h3 className="text-lg font-semibold text-gray-900">Mark Work as Finished</h3>
            <p className="text-sm text-gray-500">This action will notify the administrator</p>
          </div>
        </div>

        <div className="mb-6">
          <p className="text-gray-700">
            Are you sure you have finished all your assigned work? This will send a notification to Sahebji and mark
            your work as complete.
          </p>
        </div>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Processing...
              </>
            ) : (
              "Yes, Work Finished"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export const getServerSideProps: GetServerSideProps<
  DashboardProps & {
    records: RecordRow[];
    languages: string[];
    authors: string[];
    emails: string[];
    titles: string[];
    creators: string[];
    userMagazineActivities: UserMagazineActivity[];
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
    supabaseAdmin.from("summaries").select("id, name, email, record_id"),
    supabaseAdmin.from("conclusions").select("id, name, email, record_id"),
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
    record_id: summary.record_id ? Number(summary.record_id) : undefined,
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
    record_id: conclusion.record_id ? Number(conclusion.record_id) : undefined,
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

  // Build user magazine activities
  const userMagazineActivitiesMap = new Map<string, UserMagazineActivity>();

  // Helper function to get unique user key
  const getUserKey = (name: string, email: string) => `${name}|${email}`;

  // Helper function to safely add to array if not exists
  const addUniqueToArray = (arr: string[], item: string) => {
    if (item && !arr.includes(item)) {
      arr.push(item);
    }
  };

  // Process records created by users
  processedRecords.forEach((record) => {
    if (record.creator_name && record.email) {
      const userKey = getUserKey(record.creator_name, record.email);

      if (!userMagazineActivitiesMap.has(userKey)) {
        userMagazineActivitiesMap.set(userKey, {
          userName: record.creator_name,
          userEmail: record.email,
          recordsCreated: [],
          summariesEdited: [],
          conclusionsEdited: [],
          totalActivity: 0,
        });
      }

      const userActivity = userMagazineActivitiesMap.get(userKey)!;

      // Find or create magazine entry for records created
      let magazineEntry = userActivity.recordsCreated.find((m) => m.magazineName === record.name);
      if (!magazineEntry) {
        magazineEntry = {
          magazineName: record.name,
          count: 0,
          volumes: [],
          titles: [],
          pageNumbers: [],
          authors: [],
          languages: [],
        };
        userActivity.recordsCreated.push(magazineEntry);
      }

      magazineEntry.count++;
      addUniqueToArray(magazineEntry.volumes, record.volume || "");
      addUniqueToArray(magazineEntry.titles, record.title_name || "");
      addUniqueToArray(magazineEntry.pageNumbers, record.page_numbers || "");
      addUniqueToArray(magazineEntry.languages, record.language || "");

      if (record.authors) {
        record.authors.split(",").forEach((author) => {
          addUniqueToArray(magazineEntry.authors, author.trim());
        });
      }

      userActivity.totalActivity++;
    }
  });

  // Process summaries edited by users
  processedSummaries.forEach((summary) => {
    if (summary.name && summary.email && summary.record_id) {
      const userKey = getUserKey(summary.name, summary.email);

      // Find the corresponding record
      const record = processedRecords.find((r) => r.id === summary.record_id);
      if (!record) return;

      if (!userMagazineActivitiesMap.has(userKey)) {
        userMagazineActivitiesMap.set(userKey, {
          userName: summary.name,
          userEmail: summary.email,
          recordsCreated: [],
          summariesEdited: [],
          conclusionsEdited: [],
          totalActivity: 0,
        });
      }

      const userActivity = userMagazineActivitiesMap.get(userKey)!;

      // Find or create magazine entry for summaries edited
      let magazineEntry = userActivity.summariesEdited.find((m) => m.magazineName === record.name);
      if (!magazineEntry) {
        magazineEntry = {
          magazineName: record.name,
          count: 0,
          volumes: [],
          titles: [],
          pageNumbers: [],
          recordIds: [],
        };
        userActivity.summariesEdited.push(magazineEntry);
      }

      magazineEntry.count++;
      addUniqueToArray(magazineEntry.volumes, record.volume || "");
      addUniqueToArray(magazineEntry.titles, record.title_name || "");
      addUniqueToArray(magazineEntry.pageNumbers, record.page_numbers || "");

      if (!magazineEntry.recordIds.includes(record.id)) {
        magazineEntry.recordIds.push(record.id);
      }

      userActivity.totalActivity++;
    }
  });

  // Process conclusions edited by users
  processedConclusions.forEach((conclusion) => {
    if (conclusion.name && conclusion.email && conclusion.record_id) {
      const userKey = getUserKey(conclusion.name, conclusion.email);

      // Find the corresponding record
      const record = processedRecords.find((r) => r.id === conclusion.record_id);
      if (!record) return;

      if (!userMagazineActivitiesMap.has(userKey)) {
        userMagazineActivitiesMap.set(userKey, {
          userName: conclusion.name,
          userEmail: conclusion.email,
          recordsCreated: [],
          summariesEdited: [],
          conclusionsEdited: [],
          totalActivity: 0,
        });
      }

      const userActivity = userMagazineActivitiesMap.get(userKey)!;

      // Find or create magazine entry for conclusions edited
      let magazineEntry = userActivity.conclusionsEdited.find((m) => m.magazineName === record.name);
      if (!magazineEntry) {
        magazineEntry = {
          magazineName: record.name,
          count: 0,
          volumes: [],
          titles: [],
          pageNumbers: [],
          recordIds: [],
        };
        userActivity.conclusionsEdited.push(magazineEntry);
      }

      magazineEntry.count++;
      addUniqueToArray(magazineEntry.volumes, record.volume || "");
      addUniqueToArray(magazineEntry.titles, record.title_name || "");
      addUniqueToArray(magazineEntry.pageNumbers, record.page_numbers || "");

      if (!magazineEntry.recordIds.includes(record.id)) {
        magazineEntry.recordIds.push(record.id);
      }

      userActivity.totalActivity++;
    }
  });

  // Convert to array and sort by total activity
  const userMagazineActivities = Array.from(userMagazineActivitiesMap.values()).sort(
    (a, b) => b.totalActivity - a.totalActivity,
  );

  // User activity insights
  const userActivityMap = new Map<
    string,
    {
      name: string;
      email: string;
      records: number;
      summaries: number;
      conclusions: number;
      summariesFilled: number;
      conclusionsFilled: number;
    }
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
        summariesFilled: 0,
        conclusionsFilled: 0,
      };
      entry.records += 1;
      if (r.summary && r.summary.trim() !== "") {
        entry.summariesFilled += 1;
      }
      if (r.conclusion && r.conclusion.trim() !== "") {
        entry.conclusionsFilled += 1;
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
        summariesFilled: 0,
        conclusionsFilled: 0,
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
        summariesFilled: 0,
        conclusionsFilled: 0,
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
      userMagazineActivities,
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
  userMagazineActivities,
}: DashboardProps & {
  records: RecordRow[];
  languages: string[];
  authors: string[];
  emails: string[];
  titles: string[];
  creators: string[];
  unconfirmedUsers: { name: string; email: string }[];
  userMagazineActivities: UserMagazineActivity[];
}) {
  const [filter, setFilter] = useState<FilterState>({ language: "", author: "", email: "", title: "", creator: "" });
  const [showDetails, setShowDetails] = useState<number | null>(null);
  const [unconfirmedUsersState, setUnconfirmedUsersState] =
    useState<{ name: string; email: string }[]>(unconfirmedUsers);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [showUserMagazineModal, setShowUserMagazineModal] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [showWorkModal, setShowWorkModal] = useState(false);
  const [isMarkingWorkDone, setIsMarkingWorkDone] = useState(false);
  const [isAccessDenied, setIsAccessDenied] = useState(false);

  const router = useRouter();

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

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        if (parsedUser) {
          setUser(parsedUser);
          if (parsedUser.name && parsedUser.email && parsedUser.access) {
            // Check if user has admin access
            if (!ADMIN_EMAILS.includes(parsedUser.email)) {
              setIsAccessDenied(true);
            }
          } else {
            router.push("/login");
          }
        }
      } catch (error) {
        console.error("Error parsing user data:", error);
        router.push("/login");
      }
    } else {
      router.push("/login");
    }
  }, []);

  // Check if current user is admin
  const isAdmin = user && ADMIN_EMAILS.includes(user.email);

  // Filter user magazine activities based on user access
  const filteredUserMagazineActivities = useMemo(() => {
    if (isAdmin) {
      return userMagazineActivities;
    }
    // Non-admin users only see their own data
    return userMagazineActivities.filter((activity) => activity.userEmail === user?.email);
  }, [userMagazineActivities, isAdmin, user]);

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

  // Function to handle work completion
  const handleWorkFinished = async () => {
    if (!user) return;

    setIsMarkingWorkDone(true);
    try {
      const response = await fetch("/api/notify-work-finished", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: user.name,
          email: user.email,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Error marking work as finished:", errorData);
        alert("Failed to mark work as finished. Please try again.");
        return;
      }

      const result = await response.json();
      alert("Work marked as finished! Sahebji has been notified.");
      setShowWorkModal(false);

      // Update user state to reflect work completion
      setUser((prev) => (prev ? { ...prev, work_done: true } : null));
    } catch (error) {
      console.error("Error:", error);
      alert("An error occurred. Please try again.");
    } finally {
      setIsMarkingWorkDone(false);
    }
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

  const openUserMagazineModal = (userKey: string) => {
    setSelectedUser(userKey);
    setShowUserMagazineModal(true);
  };

  const closeUserMagazineModal = () => {
    setSelectedUser(null);
    setShowUserMagazineModal(false);
  };

  const selectedUserActivity = selectedUser
    ? filteredUserMagazineActivities.find((u) => `${u.userName}|${u.userEmail}` === selectedUser)
    : null;

  // Show access denied message for non-admin users
  if (isAccessDenied) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        {showWorkModal && (
          <WorkCompletionModal
            isOpen={true}
            onClose={() => setShowWorkModal(false)}
            onConfirm={handleWorkFinished}
            isLoading={isMarkingWorkDone}
          />
        )}
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="mb-4">
            <svg className="w-16 h-16 text-red-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Restricted</h1>
          <p className="text-gray-600 mb-6">This dashboard is only accessible to authorized administrators.</p>
          <div className="space-y-3">
            {!isAdmin && !!user && (
              <button
                type="button"
                onClick={() => {
                  if (user && !user.work_done) setShowWorkModal(true);
                }}
                disabled={!!user?.work_done}
                className={`w-full px-4 py-2 rounded-lg font-medium ${
                  user?.work_done
                    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                    : "bg-green-600 text-white hover:bg-green-700"
                }`}
              >
                {user?.work_done ? "Work Already Marked as Finished" : "Work Finished, Notify Sahebji"}
              </button>
            )}
            <button
              onClick={() => router.push("/")}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Go Back to Main Table
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 md:text-4xl">📊 Application Usage Dashboard</h1>
        <p className="mt-2 text-gray-600">Comprehensive insights into user activity and content distribution</p>
      </header>

      <div className="mb-6 flex gap-4">
        <button
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition-colors"
          onClick={() => (window.location.href = "/")}
        >
          Back to Table
        </button>
        {!isAdmin && user && (
          <button
            onClick={() => setShowWorkModal(true)}
            disabled={user.work_done}
            className={`inline-flex items-center px-4 py-2 rounded-lg shadow transition-colors font-medium ${
              user.work_done
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-green-600 text-white hover:bg-green-700"
            }`}
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            {user.work_done ? "Work Already Finished" : "Work Finished, Notify Sahebji"}
          </button>
        )}
      </div>

      {/* Work Completion Modal */}
      <WorkCompletionModal
        isOpen={showWorkModal}
        onClose={() => setShowWorkModal(false)}
        onConfirm={handleWorkFinished}
        isLoading={isMarkingWorkDone}
      />

      {/* User Magazine Activity Modal */}
      {showUserMagazineModal && selectedUserActivity && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-bold text-gray-900">{selectedUserActivity.userName}</h3>
                <p className="text-gray-600">{selectedUserActivity.userEmail}</p>
                <p className="text-sm text-gray-500 mt-1">
                  Total Activity: {selectedUserActivity.totalActivity} actions
                </p>
              </div>
              <button onClick={closeUserMagazineModal} className="text-gray-400 hover:text-gray-600 text-2xl font-bold">
                ×
              </button>
            </div>

            <div className="p-6 space-y-8">
              {/* Records Created */}
              {selectedUserActivity.recordsCreated.length > 0 && (
                <div>
                  <h4 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
                    <span className="w-3 h-3 bg-blue-500 rounded-full mr-3"></span>
                    Records Created ({selectedUserActivity.recordsCreated.reduce((sum, mag) => sum + mag.count, 0)})
                  </h4>
                  <div className="grid gap-4">
                    {selectedUserActivity.recordsCreated.map((magazine, idx) => (
                      <div key={idx} className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                        <div className="flex justify-between items-start mb-3">
                          <h5 className="font-semibold text-blue-900">{magazine.magazineName}</h5>
                          <span className="bg-blue-600 text-white px-2 py-1 rounded text-sm font-medium">
                            {magazine.count} records
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                          <div>
                            <span className="font-medium text-gray-700">Volumes:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {magazine.volumes
                                .filter((v) => v)
                                .map((volume, i) => (
                                  <span
                                    key={i}
                                    className="bg-white px-2 py-1 rounded border border-blue-300 text-blue-800"
                                  >
                                    {volume}
                                  </span>
                                ))}
                            </div>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">Titles:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {magazine.titles
                                .filter((t) => t)
                                .slice(0, 3)
                                .map((title, i) => (
                                  <span
                                    key={i}
                                    className="bg-white px-2 py-1 rounded border border-blue-300 text-blue-800 text-xs"
                                  >
                                    {title.length > 20 ? title.substring(0, 20) + "..." : title}
                                  </span>
                                ))}
                              {magazine.titles.filter((t) => t).length > 3 && (
                                <span className="text-gray-500 text-xs">
                                  +{magazine.titles.filter((t) => t).length - 3} more
                                </span>
                              )}
                            </div>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">Pages:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {magazine.pageNumbers
                                .filter((p) => p)
                                .slice(0, 3)
                                .map((page, i) => (
                                  <span
                                    key={i}
                                    className="bg-white px-2 py-1 rounded border border-blue-300 text-blue-800"
                                  >
                                    {page}
                                  </span>
                                ))}
                              {magazine.pageNumbers.filter((p) => p).length > 3 && (
                                <span className="text-gray-500 text-xs">
                                  +{magazine.pageNumbers.filter((p) => p).length - 3} more
                                </span>
                              )}
                            </div>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">Languages:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {magazine.languages
                                .filter((l) => l)
                                .map((lang, i) => (
                                  <span
                                    key={i}
                                    className="bg-white px-2 py-1 rounded border border-blue-300 text-blue-800"
                                  >
                                    {lang}
                                  </span>
                                ))}
                            </div>
                          </div>
                        </div>
                        {magazine.authors.filter((a) => a).length > 0 && (
                          <div className="mt-3">
                            <span className="font-medium text-gray-700">Authors:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {magazine.authors
                                .filter((a) => a)
                                .slice(0, 5)
                                .map((author, i) => (
                                  <span
                                    key={i}
                                    className="bg-white px-2 py-1 rounded border border-blue-300 text-blue-800 text-xs"
                                  >
                                    {author}
                                  </span>
                                ))}
                              {magazine.authors.filter((a) => a).length > 5 && (
                                <span className="text-gray-500 text-xs">
                                  +{magazine.authors.filter((a) => a).length - 5} more
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Summaries Edited */}
              {selectedUserActivity.summariesEdited.length > 0 && (
                <div>
                  <h4 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
                    <span className="w-3 h-3 bg-green-500 rounded-full mr-3"></span>
                    Summaries Edited ({selectedUserActivity.summariesEdited.reduce((sum, mag) => sum + mag.count, 0)})
                  </h4>
                  <div className="grid gap-4">
                    {selectedUserActivity.summariesEdited.map((magazine, idx) => (
                      <div key={idx} className="bg-green-50 rounded-lg p-4 border border-green-200">
                        <div className="flex justify-between items-start mb-3">
                          <h5 className="font-semibold text-green-900">{magazine.magazineName}</h5>
                          <span className="bg-green-600 text-white px-2 py-1 rounded text-sm font-medium">
                            {magazine.count} edits
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                          <div>
                            <span className="font-medium text-gray-700">Volumes:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {magazine.volumes
                                .filter((v) => v)
                                .map((volume, i) => (
                                  <span
                                    key={i}
                                    className="bg-white px-2 py-1 rounded border border-green-300 text-green-800"
                                  >
                                    {volume}
                                  </span>
                                ))}
                            </div>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">Titles:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {magazine.titles
                                .filter((t) => t)
                                .slice(0, 3)
                                .map((title, i) => (
                                  <span
                                    key={i}
                                    className="bg-white px-2 py-1 rounded border border-green-300 text-green-800 text-xs"
                                  >
                                    {title.length > 20 ? title.substring(0, 20) + "..." : title}
                                  </span>
                                ))}
                              {magazine.titles.filter((t) => t).length > 3 && (
                                <span className="text-gray-500 text-xs">
                                  +{magazine.titles.filter((t) => t).length - 3} more
                                </span>
                              )}
                            </div>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">Pages:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {magazine.pageNumbers
                                .filter((p) => p)
                                .slice(0, 3)
                                .map((page, i) => (
                                  <span
                                    key={i}
                                    className="bg-white px-2 py-1 rounded border border-green-300 text-green-800"
                                  >
                                    {page}
                                  </span>
                                ))}
                              {magazine.pageNumbers.filter((p) => p).length > 3 && (
                                <span className="text-gray-500 text-xs">
                                  +{magazine.pageNumbers.filter((p) => p).length - 3} more
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 text-xs text-gray-600">
                          <span className="font-medium">Record IDs:</span> {magazine.recordIds.join(", ")}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Conclusions Edited */}
              {selectedUserActivity.conclusionsEdited.length > 0 && (
                <div>
                  <h4 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
                    <span className="w-3 h-3 bg-purple-500 rounded-full mr-3"></span>
                    Conclusions Edited (
                    {selectedUserActivity.conclusionsEdited.reduce((sum, mag) => sum + mag.count, 0)})
                  </h4>
                  <div className="grid gap-4">
                    {selectedUserActivity.conclusionsEdited.map((magazine, idx) => (
                      <div key={idx} className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                        <div className="flex justify-between items-start mb-3">
                          <h5 className="font-semibold text-purple-900">{magazine.magazineName}</h5>
                          <span className="bg-purple-600 text-white px-2 py-1 rounded text-sm font-medium">
                            {magazine.count} edits
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                          <div>
                            <span className="font-medium text-gray-700">Volumes:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {magazine.volumes
                                .filter((v) => v)
                                .map((volume, i) => (
                                  <span
                                    key={i}
                                    className="bg-white px-2 py-1 rounded border border-purple-300 text-purple-800"
                                  >
                                    {volume}
                                  </span>
                                ))}
                            </div>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">Titles:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {magazine.titles
                                .filter((t) => t)
                                .slice(0, 3)
                                .map((title, i) => (
                                  <span
                                    key={i}
                                    className="bg-white px-2 py-1 rounded border border-purple-300 text-purple-800 text-xs"
                                  >
                                    {title.length > 20 ? title.substring(0, 20) + "..." : title}
                                  </span>
                                ))}
                              {magazine.titles.filter((t) => t).length > 3 && (
                                <span className="text-gray-500 text-xs">
                                  +{magazine.titles.filter((t) => t).length - 3} more
                                </span>
                              )}
                            </div>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">Pages:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {magazine.pageNumbers
                                .filter((p) => p)
                                .slice(0, 3)
                                .map((page, i) => (
                                  <span
                                    key={i}
                                    className="bg-white px-2 py-1 rounded border border-purple-300 text-purple-800"
                                  >
                                    {page}
                                  </span>
                                ))}
                              {magazine.pageNumbers.filter((p) => p).length > 3 && (
                                <span className="text-gray-500 text-xs">
                                  +{magazine.pageNumbers.filter((p) => p).length - 3} more
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 text-xs text-gray-600">
                          <span className="font-medium">Record IDs:</span> {magazine.recordIds.join(", ")}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* No activity message */}
              {selectedUserActivity.recordsCreated.length === 0 &&
                selectedUserActivity.summariesEdited.length === 0 &&
                selectedUserActivity.conclusionsEdited.length === 0 && (
                  <div className="text-center py-8 text-gray-500">No magazine activity found for this user.</div>
                )}
            </div>
          </div>
        </div>
      )}

      {/* User Magazine Activity Section */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          User Magazine Activity Overview
          {!isAdmin && <span className="text-sm font-normal text-gray-500 ml-2">(Your Activity Only)</span>}
        </h2>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Records Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Summaries Edited
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Conclusions Edited
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Activity
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredUserMagazineActivities.slice(0, 20).map((userActivity, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-8 w-8">
                          <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center">
                            <span className="text-sm font-medium text-indigo-700">
                              {userActivity.userName.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{userActivity.userName}</div>
                          <div className="text-sm text-gray-500">{userActivity.userEmail}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {userActivity.recordsCreated.reduce((sum, mag) => sum + mag.count, 0)} records
                      </div>
                      <div className="text-xs text-gray-500">{userActivity.recordsCreated.length} magazines</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {userActivity.summariesEdited.reduce((sum, mag) => sum + mag.count, 0)} edits
                      </div>
                      <div className="text-xs text-gray-500">{userActivity.summariesEdited.length} magazines</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {userActivity.conclusionsEdited.reduce((sum, mag) => sum + mag.count, 0)} edits
                      </div>
                      <div className="text-xs text-gray-500">{userActivity.conclusionsEdited.length} magazines</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                        {userActivity.totalActivity}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => openUserMagazineModal(`${userActivity.userName}|${userActivity.userEmail}`)}
                        className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredUserMagazineActivities.length === 0 && (
            <div className="text-center py-8 text-gray-500">No user activity data available.</div>
          )}
        </div>
      </section>

      {/* Only show admin sections for admin users */}
      {isAdmin && (
        <>
          {/* Unconfirmed Users Section - Admin Only */}
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
                        <svg
                          className="w-4 h-4 mr-1"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          viewBox="0 0 24 24"
                        >
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

          {/* Metrics Grid - Admin Only */}
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

          {/* Magazine Insights Cards - Admin Only */}
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
                          <span
                            key={a}
                            className="inline-block bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded text-xs"
                          >
                            {a}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="mt-2">
                      <div className="text-xs text-gray-500 mb-1">Languages</div>
                      <div className="flex flex-wrap gap-1">
                        {mag.languages.map((l) => (
                          <span
                            key={l}
                            className="inline-block bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-xs"
                          >
                            {l}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="mt-2">
                      <div className="text-xs text-gray-500 mb-1">Volumes</div>
                      <div className="flex flex-wrap gap-1">
                        {mag.volumes.map((v) => (
                          <span
                            key={v}
                            className="inline-block bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs"
                          >
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

          {/* User Activity Chart - Admin Only */}
          <section className="bg-white rounded-xl shadow-sm p-6 mb-12 border border-gray-100">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Top User Activity</h2>
            <div className="w-full h-96">
              <ResponsiveContainer>
                <BarChart data={userActivity} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={60} />
                  <YAxis />
                  <Tooltip formatter={(value: number, name: string) => [`${value} ${name.toLowerCase()}`, name]} />
                  <Legend />
                  <Bar dataKey="records" fill={COLORS[0]} name="Records created" />
                  <Bar dataKey="summariesFilled" fill={COLORS[3]} name="Summaries Filled" />
                  <Bar dataKey="conclusionsFilled" fill={COLORS[4]} name="Conclusions Filled" />
                  <Bar dataKey="summaries" fill={COLORS[1]} name="Summary Edits" />
                  <Bar dataKey="conclusions" fill={COLORS[2]} name="Conclusion Edits" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Insights - Admin Only */}
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
        </>
      )}
    </div>
  );
}
