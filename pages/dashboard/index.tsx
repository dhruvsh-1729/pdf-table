// pages/dashboard.tsx
import { createClient } from "@supabase/supabase-js";
import { GetServerSideProps } from "next";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Legend, Tooltip } from "recharts";

/** -----------------------------
 * Types
 * ------------------------------ */
interface DashboardProps {
  totals: {
    records: number;
    summaryEdits: number;
    conclusionEdits: number;
    users: number;
  };
  records: RecordRow[];
  summaries: SummaryRow[];
  conclusions: ConclusionRow[];
  unconfirmedUsers: { name: string; email: string }[];
}

type RecordRow = {
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
};

type SummaryRow = {
  id: number;
  name?: string | null;
  email?: string | null;
  record_id?: number | null;
};

type ConclusionRow = {
  id: number;
  name?: string | null;
  email?: string | null;
  record_id?: number | null;
};

type FilterState = {
  language: string;
  author: string;
  email: string;
  title: string;
  creator: string;
};

type User = {
  name: string;
  email: string;
  access: string;
  work_done?: boolean;
};

type UserActivityRow = {
  name: string;
  email: string;
  records: number;
  summaries: number;
  conclusions: number;
  summariesFilled: number;
  conclusionsFilled: number;
};

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
    recordIds: number[];
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

// Add below your existing types
type RecordBrief = {
  id: number;
  title?: string | null;
  number?: string | null;
  pages?: string | null;
  timestamp?: string | null;
  language?: string | null;
  authors?: string | null;
  volume?: string | null;
};

type VolumeBucket = {
  volume: string | null; // e.g. "Vol. 12" or null
  count: number; // distinct records in this volume for this action
  recordIds: number[];
  titles: string[];
  numbers: string[];
  pageNumbers: string[];
  timestamps: string[];
  languages: string[];
  authors: string[];
  records: RecordBrief[]; // detailed rows for display
};

type MagazineVolumeGroup = {
  magazineName: string;
  totalCount: number; // sum of counts across volumes
  volumes: VolumeBucket[];
};

type UserMagazineActivityV2 = {
  userName: string;
  userEmail: string;
  recordsCreated: MagazineVolumeGroup[];
  summariesEdited: MagazineVolumeGroup[];
  conclusionsEdited: MagazineVolumeGroup[];
  totalActivity: number;
};

/** -----------------------------
 * Constants
 * ------------------------------ */
const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#A28DD0", "#FF6699"];
const ADMIN_EMAILS = ["dharmsasanwork99@gmail.com", "dhruvshdarshansh@gmail.com"];

/** -----------------------------
 * Utilities - Parsing / Cleanup
 * ------------------------------ */
/**
 * Normalize a value coming back from DB where it might be stored as:
 *  - plain string                      => "value"
 *  - JSON string array with single val => "["value"]"
 *  - quoted string                     => "\"value\""
 * Also unescape \n, \", \\, trims outer quotes and whitespace.
 */
function normalizeField(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  let str = String(input);

  // Try JSON.parse; if it parses to array/single value, unwrap sensibly
  try {
    const parsed = JSON.parse(str);
    if (Array.isArray(parsed)) {
      if (parsed.length === 0) return null;
      if (parsed.length === 1 && typeof parsed[0] === "string") str = parsed[0];
      else str = parsed.join(", ");
    } else if (typeof parsed === "string" || typeof parsed === "number") {
      str = String(parsed);
    }
  } catch {
    // not JSON — continue with raw string
  }

  // Unescape common sequences
  str = str
    .replace(/\\r\\n|\\n|\\r/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, "\\");

  // Strip outer quotes if present
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    str = str.slice(1, -1);
  }

  str = str.trim();
  return str === "" ? null : str;
}

function normalizeMaybe(input: unknown): string | undefined {
  const n = normalizeField(input);
  return n === null ? undefined : n;
}

/** -----------------------------
 * Server: getServerSideProps
 * ------------------------------ */
export const getServerSideProps: GetServerSideProps<DashboardProps> = async () => {
  const supabaseAdmin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Count queries (fast)
  const [recordsCount, summariesCount, conclusionsCount, usersCount] = await Promise.all([
    supabaseAdmin.from("records").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("summaries").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("conclusions").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("users").select("id", { count: "exact", head: true }),
  ]);

  const totals = {
    records: recordsCount.count ?? 0,
    summaryEdits: summariesCount.count ?? 0,
    conclusionEdits: conclusionsCount.count ?? 0,
    users: usersCount.count ?? 0,
  };

  // Fetch all records without limit (pagination loop)
  let recordsRaw: any[] = [];
  let from = 0;
  const pageSize = 1000;
  let done = false;
  while (!done) {
    const { data, error, count } = await supabaseAdmin
      .from("records")
      .select(
        `
        id, name, timestamp, summary, pdf_url, volume, number, title_name,
        page_numbers, authors, language, email, creator_name, conclusion
      `,
        { count: "exact" },
      )
      .order("timestamp", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (data && data.length > 0) {
      recordsRaw = recordsRaw.concat(data);
      from += pageSize;
      if (data.length < pageSize) done = true;
    } else {
      done = true;
    }
  }

  // Summaries (only minimal columns)
  const { data: summariesRaw } = await supabaseAdmin.from("summaries").select("id, name, email, record_id");

  // Conclusions (only minimal columns)
  const { data: conclusionsRaw } = await supabaseAdmin.from("conclusions").select("id, name, email, record_id");

  // Unconfirmed users
  const { data: unconfirmedUsersRaw } = await supabaseAdmin
    .from("users")
    .select("name, email, confirmed")
    .eq("confirmed", false);

  // --- Normalize Records
  const records: RecordRow[] = (recordsRaw ?? []).map((r) => ({
    id: Number(r.id ?? 0),
    name: normalizeField(r.name) ?? "",
    pdf_url: normalizeField(r.pdf_url) ?? "",
    timestamp: normalizeField(r.timestamp),
    summary: normalizeField(r.summary),
    volume: normalizeField(r.volume),
    number: normalizeField(r.number),
    title_name: normalizeField(r.title_name),
    page_numbers: normalizeField(r.page_numbers),
    authors: normalizeField(r.authors),
    language: normalizeField(r.language),
    email: normalizeField(r.email),
    creator_name: normalizeField(r.creator_name),
    conclusion: normalizeField(r.conclusion),
  }));

  // --- Normalize Summaries
  const summaries: SummaryRow[] = (summariesRaw ?? []).map((s) => ({
    id: Number(s.id ?? 0),
    name: normalizeField(s.name) ?? "",
    email: normalizeField(s.email),
    record_id: s.record_id ? Number(s.record_id) : null,
  }));

  // --- Normalize Conclusions
  const conclusions: ConclusionRow[] = (conclusionsRaw ?? []).map((c) => ({
    id: Number(c.id ?? 0),
    name: normalizeField(c.name) ?? "",
    email: normalizeField(c.email),
    record_id: c.record_id ? Number(c.record_id) : null,
  }));

  // --- Normalize Unconfirmed Users
  const unconfirmedUsers =
    (unconfirmedUsersRaw ?? []).map((u) => ({
      name: normalizeField(u.name) ?? "",
      email: normalizeField(u.email) ?? "",
    })) ?? [];

  return {
    props: {
      totals,
      records,
      summaries,
      conclusions,
      unconfirmedUsers,
    },
  };
};

/** -----------------------------
 * Components
 * ------------------------------ */
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
        <div className="flex items-center mb-4">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="ml-4">
            <h3 className="text-lg font-semibold text-gray-900">Mark Work as Finished</h3>
            <p className="text-sm text-gray-500">This action will notify the administrator</p>
          </div>
        </div>

        <p className="text-gray-700 mb-6">
          Are you sure you have finished all your assigned work? This will send a notification to Sahebji and mark your
          work as complete.
        </p>

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
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
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

/** -----------------------------
 * Page
 * ------------------------------ */
export default function Dashboard({ totals, records, summaries, conclusions, unconfirmedUsers }: DashboardProps) {
  const [filter, setFilter] = useState<FilterState>({ language: "", author: "", email: "", title: "", creator: "" });
  const [showUserMagazineModal, setShowUserMagazineModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [unconfirmedUsersState, setUnconfirmedUsersState] =
    useState<{ name: string; email: string }[]>(unconfirmedUsers);
  const [user, setUser] = useState<User | null>(null);
  const [showWorkModal, setShowWorkModal] = useState(false);
  const [isMarkingWorkDone, setIsMarkingWorkDone] = useState(false);
  const [isAccessDenied, setIsAccessDenied] = useState(false);

  const router = useRouter();
  const isAdmin = !!user && ADMIN_EMAILS.includes(user.email);

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (!stored) {
      router.push("/login");
      return;
    }
    try {
      const parsed: User = JSON.parse(stored);
      setUser(parsed);
      // Non-admin → restrict dashboard but still render personal view + "work finished" flow
      if (parsed.name && parsed.email && parsed.access) {
        if (!ADMIN_EMAILS.includes(parsed.email)) {
          setIsAccessDenied(true);
        }
      } else {
        router.push("/login");
      }
    } catch {
      router.push("/login");
    }
  }, [router]);

  /** -----------------------------
   * Derived data (client-only)
   * ------------------------------ */
  const languages = useMemo(
    () => Array.from(new Set(records.map((r) => r.language).filter(Boolean))) as string[],
    [records],
  );

  const authorsAll = useMemo(
    () =>
      Array.from(
        new Set(
          records.flatMap((r) =>
            (r.authors ?? "")
              .split(",")
              .map((a) => a.trim())
              .filter(Boolean),
          ),
        ),
      ) as string[],
    [records],
  );

  const emails = useMemo(
    () =>
      Array.from(
        new Set([
          ...records.map((r) => r.email).filter(Boolean),
          ...summaries.map((s) => s.email).filter(Boolean),
          ...conclusions.map((c) => c.email).filter(Boolean),
        ]),
      ) as string[],
    [records, summaries, conclusions],
  );

  const titles = useMemo(
    () => Array.from(new Set(records.map((r) => r.title_name).filter(Boolean))) as string[],
    [records],
  );

  const creators = useMemo(
    () => Array.from(new Set(records.map((r) => r.creator_name).filter(Boolean))) as string[],
    [records],
  );

  const recordsWithSummaries = useMemo(
    () => records.filter((r) => r.summary && r.summary.trim() !== "").length,
    [records],
  );
  const recordsWithConclusions = useMemo(
    () => records.filter((r) => r.conclusion && r.conclusion.trim() !== "").length,
    [records],
  );

  // const filteredRecords = useMemo(
  //   () =>
  //     records.filter(
  //       (r) =>
  //         (!filter.language || r.language === filter.language) &&
  //         (!filter.author ||
  //           (r.authors ?? "")
  //             .split(",")
  //             .map((a) => a.trim())
  //             .includes(filter.author)) &&
  //         (!filter.email || r.email === filter.email) &&
  //         (!filter.title || r.title_name === filter.title) &&
  //         (!filter.creator || r.creator_name === filter.creator),
  //     ),
  //   [records, filter],
  // );

  // Build top user activity rows (chart)
  const userActivityRows: UserActivityRow[] = useMemo(() => {
    type Entry = {
      name: string;
      email: string;
      records: number; // created by user (from records table)
      summaries: number; // DISTINCT record_id edited by this email
      conclusions: number; // DISTINCT record_id edited by this email
      summariesFilled: number; // records table has non-empty summary
      conclusionsFilled: number; // records table has non-empty conclusion
      _summaryRecordIds: Set<number>;
      _conclusionRecordIds: Set<number>;
    };

    const map = new Map<string, Entry>();
    const keyOf = (name: string, email: string) => `${name}|${email}`;

    const getOrCreate = (name: string, email: string): Entry => {
      const key = keyOf(name, email);
      if (!map.has(key)) {
        map.set(key, {
          name,
          email,
          records: 0,
          summaries: 0,
          conclusions: 0,
          summariesFilled: 0,
          conclusionsFilled: 0,
          _summaryRecordIds: new Set<number>(),
          _conclusionRecordIds: new Set<number>(),
        });
      }
      return map.get(key)!;
    };

    // Records created + filled counts (by creator)
    records.forEach((r) => {
      if (r.email && r.creator_name) {
        const entry = getOrCreate(r.creator_name, r.email);
        entry.records += 1;
        if (r.summary && r.summary.trim() !== "") entry.summariesFilled += 1;
        if (r.conclusion && r.conclusion.trim() !== "") entry.conclusionsFilled += 1;
      }
    });

    // Summaries: DISTINCT record_id per editor email
    summaries.forEach((s) => {
      if (s.email && s.name && typeof s.record_id === "number") {
        const entry = getOrCreate(s.name, s.email);
        entry._summaryRecordIds.add(s.record_id);
      }
    });

    // Conclusions: DISTINCT record_id per editor email
    conclusions.forEach((c) => {
      if (c.email && c.name && typeof c.record_id === "number") {
        const entry = getOrCreate(c.name, c.email);
        entry._conclusionRecordIds.add(c.record_id);
      }
    });

    // Finalize distinct counts
    const all = Array.from(map.values()).map((e) => ({
      name: e.name,
      email: e.email,
      records: e.records,
      summariesFilled: e.summariesFilled,
      conclusionsFilled: e.conclusionsFilled,
      summaries: e._summaryRecordIds.size,
      conclusions: e._conclusionRecordIds.size,
    }));

    // Sort by total activity (same as before)
    all.sort((a, b) => b.records + b.summaries + b.conclusions - (a.records + a.summaries + a.conclusions));

    return all.slice(0, 10);
  }, [records, summaries, conclusions]);

  // Magazine report per magazine (admin cards)
  const magazineReport = useMemo(() => {
    const m = new Map<
      string,
      {
        name: string;
        totalRecords: number;
        recordsWithSummaries: number;
        recordsWithConclusions: number;
        titles: string[];
        volumes: string[];
        authors: string[];
        languages: string[];
      }
    >();

    const addUnique = (arr: string[], v?: string | null) => {
      if (!v) return;
      if (v && !arr.includes(v)) arr.push(v);
    };

    records.forEach((r) => {
      const magName = r.name || "Untitled";
      if (!m.has(magName)) {
        m.set(magName, {
          name: magName,
          totalRecords: 0,
          recordsWithSummaries: 0,
          recordsWithConclusions: 0,
          titles: [],
          volumes: [],
          authors: [],
          languages: [],
        });
      }
      const entry = m.get(magName)!;
      entry.totalRecords += 1;
      if (r.summary && r.summary.trim() !== "") entry.recordsWithSummaries += 1;
      if (r.conclusion && r.conclusion.trim() !== "") entry.recordsWithConclusions += 1;
      addUnique(entry.titles, r.title_name);
      addUnique(entry.volumes, r.volume);
      addUnique(entry.languages, r.language);

      (r.authors ?? "")
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean)
        .forEach((a) => addUnique(entry.authors, a));
    });

    return Array.from(m.values()).sort((a, b) => b.totalRecords - a.totalRecords);
  }, [records]);

  // Build user magazine activities (modal) — filter by admin/non-admin later
  const userMagazineActivities: UserMagazineActivityV2[] = useMemo(() => {
    // helpers
    const keyOf = (name: string, email: string) => `${name}|${email}`;

    const addToMagazineVolumeGroup = (
      groups: Map<string, MagazineVolumeGroup>,
      magazineName: string,
      rec: RecordRow,
      distinctGuard: Set<number>,
    ) => {
      if (!rec) return;
      if (distinctGuard.has(rec.id)) return; // ensure distinct per action
      distinctGuard.add(rec.id);

      if (!groups.has(magazineName)) {
        groups.set(magazineName, { magazineName, totalCount: 0, volumes: [] });
      }
      const g = groups.get(magazineName)!;

      const volKey = rec.volume ?? "—";
      let bucket = g.volumes.find((v) => (v.volume ?? "—") === volKey);
      if (!bucket) {
        bucket = {
          volume: rec.volume ?? null,
          count: 0,
          recordIds: [],
          titles: [],
          numbers: [],
          pageNumbers: [],
          timestamps: [],
          languages: [],
          authors: [],
          records: [],
        };
        g.volumes.push(bucket);
      }

      // increment + push details
      bucket.count += 1;
      g.totalCount += 1;

      if (!bucket.recordIds.includes(rec.id)) bucket.recordIds.push(rec.id);
      if (rec.title_name) bucket.titles.push(rec.title_name);
      if (rec.number) bucket.numbers.push(rec.number);
      if (rec.page_numbers) bucket.pageNumbers.push(rec.page_numbers);
      if (rec.timestamp) bucket.timestamps.push(rec.timestamp);
      if (rec.language) bucket.languages.push(rec.language);
      if (rec.authors)
        bucket.authors.push(
          ...rec.authors
            .split(",")
            .map((a) => a.trim())
            .filter(Boolean),
        );

      bucket.records.push({
        id: rec.id,
        title: rec.title_name,
        number: rec.number,
        pages: rec.page_numbers,
        timestamp: rec.timestamp,
        language: rec.language,
        authors: rec.authors,
        volume: rec.volume,
      });
    };

    type UAEntry = {
      userName: string;
      userEmail: string;
      createdByMag: Map<string, MagazineVolumeGroup>; // magazineName → group
      summaryEditsByMag: Map<string, MagazineVolumeGroup>;
      conclusionEditsByMag: Map<string, MagazineVolumeGroup>;
      distinctCreated: Set<number>;
      distinctSummary: Set<number>;
      distinctConclusion: Set<number>;
    };
    const users = new Map<string, UAEntry>();

    const getOrInitUA = (name: string, email: string): UAEntry => {
      const k = keyOf(name, email);
      if (!users.has(k)) {
        users.set(k, {
          userName: name,
          userEmail: email,
          createdByMag: new Map(),
          summaryEditsByMag: new Map(),
          conclusionEditsByMag: new Map(),
          distinctCreated: new Set(),
          distinctSummary: new Set(),
          distinctConclusion: new Set(),
        });
      }
      return users.get(k)!;
    };

    // Records Created (by creator_name/email)
    records.forEach((r) => {
      if (!r.creator_name || !r.email) return;
      const ua = getOrInitUA(r.creator_name, r.email);
      addToMagazineVolumeGroup(ua.createdByMag, r.name || "Untitled", r, ua.distinctCreated);
    });

    // Summaries Edited (distinct record_id per (user,email))
    summaries.forEach((s) => {
      if (!s.name || !s.email || typeof s.record_id !== "number") return;
      const rec = records.find((r) => r.id === s.record_id);
      if (!rec) return;
      const ua = getOrInitUA(s.name, s.email);
      addToMagazineVolumeGroup(ua.summaryEditsByMag, rec.name || "Untitled", rec, ua.distinctSummary);
    });

    // Conclusions Edited (distinct record_id per (user,email))
    conclusions.forEach((c) => {
      if (!c.name || !c.email || typeof c.record_id !== "number") return;
      const rec = records.find((r) => r.id === c.record_id);
      if (!rec) return;
      const ua = getOrInitUA(c.name, c.email);
      addToMagazineVolumeGroup(ua.conclusionEditsByMag, rec.name || "Untitled", rec, ua.distinctConclusion);
    });

    // Materialize + sort
    const out: UserMagazineActivityV2[] = Array.from(users.values()).map((u) => {
      const materialize = (m: Map<string, MagazineVolumeGroup>): MagazineVolumeGroup[] =>
        Array.from(m.values())
          .map((g) => ({
            ...g,
            // sort volumes: named volumes first (alpha), null/— last
            volumes: g.volumes
              .map((v) => {
                // Create pairs of timestamp-number to maintain correspondence
                const timestampNumberPairs = v.timestamps.map((timestamp, index) => ({
                  timestamp,
                  number: v.numbers[index] || null,
                  recordId: v.recordIds[index] || null,
                }));

                // Sort pairs by timestamp
                timestampNumberPairs.sort((a, b) => {
                  const parseTimestamp = (ts: string): Date => {
                    if (!ts) return new Date(0);

                    // Try different date formats
                    // Format 1: "Month - Year" (e.g., "January - 2023")
                    const monthYearMatch = ts.match(/^([a-zA-Z]+)\s*-\s*(\d{4})$/i);
                    if (monthYearMatch) {
                      const [, monthStr, yearStr] = monthYearMatch;
                      const monthMap: { [key: string]: number } = {
                        january: 0,
                        february: 1,
                        march: 2,
                        april: 3,
                        may: 4,
                        june: 5,
                        july: 6,
                        august: 7,
                        september: 8,
                        october: 9,
                        november: 10,
                        december: 11,
                        jan: 0,
                        feb: 1,
                        mar: 2,
                        apr: 3,
                        jun: 5,
                        jul: 6,
                        aug: 7,
                        sep: 8,
                        oct: 9,
                        nov: 10,
                        dec: 11,
                      };
                      const month = monthMap[monthStr.toLowerCase()];
                      const year = parseInt(yearStr, 10);
                      return new Date(year, month ?? 0, 1);
                    }

                    // Format 2: "MM/YYYY" or "MM-YYYY"
                    const mmYyyyMatch = ts.match(/^(\d{1,2})[-\/](\d{4})$/);
                    if (mmYyyyMatch) {
                      const [, monthStr, yearStr] = mmYyyyMatch;
                      return new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1);
                    }

                    // Format 3: Standard date formats
                    const standardDate = new Date(ts);
                    if (!isNaN(standardDate.getTime())) {
                      return standardDate;
                    }

                    // Format 4: Year only
                    const yearOnlyMatch = ts.match(/^(\d{4})$/);
                    if (yearOnlyMatch) {
                      return new Date(parseInt(yearOnlyMatch[1], 10), 0, 1);
                    }

                    // Fallback: return epoch
                    return new Date(0);
                  };

                  const dateA = parseTimestamp(a.timestamp);
                  const dateB = parseTimestamp(b.timestamp);
                  return dateA.getTime() - dateB.getTime();
                });

                // Extract sorted arrays while maintaining correspondence
                const sortedTimestamps = timestampNumberPairs.map((pair) => pair.timestamp);
                const sortedNumbers = timestampNumberPairs
                  .map((pair) => pair.number)
                  .filter((num): num is string => num !== null);
                const sortedRecordIds = timestampNumberPairs
                  .map((pair) => pair.recordId)
                  .filter((id): id is number => id !== null);
                return {
                  ...v,
                  // dedupe strings a bit for cleaner chips, but maintain sorted order
                  titles: Array.from(new Set(v.titles)).slice(0, 100),
                  numbers: Array.from(new Set(sortedNumbers)).slice(0, 100),
                  pageNumbers: Array.from(new Set(v.pageNumbers)).slice(0, 100),
                  timestamps: Array.from(new Set(sortedTimestamps)).slice(0, 100),
                  languages: Array.from(new Set(v.languages)).slice(0, 100),
                  authors: Array.from(new Set(v.authors)).slice(0, 100),
                  recordIds: Array.from(new Set(sortedRecordIds)).slice(0, 100),
                  records: v.records.sort((a, b) => {
                    // Also sort records by timestamp
                    const parseTimestamp = (ts: string | null | undefined): Date => {
                      if (!ts) return new Date(0);

                      const monthYearMatch = ts.match(/^([a-zA-Z]+)\s*-\s*(\d{4})$/i);
                      if (monthYearMatch) {
                        const [, monthStr, yearStr] = monthYearMatch;
                        const monthMap: { [key: string]: number } = {
                          january: 0,
                          february: 1,
                          march: 2,
                          april: 3,
                          may: 4,
                          june: 5,
                          july: 6,
                          august: 7,
                          september: 8,
                          october: 9,
                          november: 10,
                          december: 11,
                          jan: 0,
                          feb: 1,
                          mar: 2,
                          apr: 3,
                          jun: 5,
                          jul: 6,
                          aug: 7,
                          sep: 8,
                          oct: 9,
                          nov: 10,
                          dec: 11,
                        };
                        const month = monthMap[monthStr.toLowerCase()];
                        const year = parseInt(yearStr, 10);
                        return new Date(year, month ?? 0, 1);
                      }

                      const mmYyyyMatch = ts.match(/^(\d{1,2})[-\/](\d{4})$/);
                      if (mmYyyyMatch) {
                        const [, monthStr, yearStr] = mmYyyyMatch;
                        return new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1);
                      }

                      const standardDate = new Date(ts);
                      if (!isNaN(standardDate.getTime())) {
                        return standardDate;
                      }

                      const yearOnlyMatch = ts.match(/^(\d{4})$/);
                      if (yearOnlyMatch) {
                        return new Date(parseInt(yearOnlyMatch[1], 10), 0, 1);
                      }

                      return new Date(0);
                    };

                    const dateA = parseTimestamp(a.timestamp);
                    const dateB = parseTimestamp(b.timestamp);
                    return dateA.getTime() - dateB.getTime();
                  }),
                };
              })
              .sort((a, b) => {
                const av = a.volume ?? "~~~";
                const bv = b.volume ?? "~~~";
                return av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" });
              }),
          }))
          .sort((a, b) => b.totalCount - a.totalCount);

      const created = materialize(u.createdByMag);
      const sumEd = materialize(u.summaryEditsByMag);
      const conEd = materialize(u.conclusionEditsByMag);

      const totalActivity =
        created.reduce((s, g) => s + g.totalCount, 0) +
        sumEd.reduce((s, g) => s + g.totalCount, 0) +
        conEd.reduce((s, g) => s + g.totalCount, 0);

      return {
        userName: u.userName,
        userEmail: u.userEmail,
        recordsCreated: created,
        summariesEdited: sumEd,
        conclusionsEdited: conEd,
        totalActivity,
      };
    });

    // sort users by total activity
    out.sort((a, b) => b.totalActivity - a.totalActivity);
    return out;
  }, [records, summaries, conclusions]);

  const filteredUserMagazineActivities = useMemo(() => {
    if (isAdmin) return userMagazineActivities;
    // Non-admin users only see their own data
    return userMagazineActivities.filter((ua) => ua.userEmail === user?.email);
  }, [userMagazineActivities, isAdmin, user]);

  /** -----------------------------
   * Client Actions
   * ------------------------------ */
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

  const confirmUser = async (name: string, email: string) => {
    // NOTE: Your API expected formatted strings previously—keeping compatibility:
    const formattedName = `["${name}"]`;
    const formattedEmail = `["${email}"]`;
    const res = await fetch("/api/confirm-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: formattedEmail, name: formattedName }),
    });
    if (!res.ok) {
      const err = await res.json();
      console.error("Error confirming user:", err);
      return;
    }
    setUnconfirmedUsersState((prev) => prev.filter((u) => u.name !== name || u.email !== email));
  };

  const handleWorkFinished = async () => {
    if (!user) return;
    setIsMarkingWorkDone(true);
    try {
      const res = await fetch("/api/notify-work-finished", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: user.name, email: user.email }),
      });
      if (!res.ok) {
        const err = await res.json();
        console.error("Error marking work finished:", err);
        alert("Failed to mark work as finished. Please try again.");
        return;
      }
      alert("Work marked as finished! Sahebji has been notified.");
      setShowWorkModal(false);
      setUser((prev) => (prev ? { ...prev, work_done: true } : null));
    } catch (e) {
      console.error(e);
      alert("An error occurred. Please try again.");
    } finally {
      setIsMarkingWorkDone(false);
    }
  };

  /** -----------------------------
   * Access Gate for Non-Admins
   * ------------------------------ */
  if (isAccessDenied) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        {showWorkModal && (
          <WorkCompletionModal
            isOpen
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
                d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-2.5L13.73 4c-.77-.83-1.96-.83-2.73 0L3.34 16.5C2.57 17.33 3.53 19 5.07 19z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Restricted</h1>
          <p className="text-gray-600 mb-6">This dashboard is only accessible to authorized administrators.</p>
          <div className="space-y-3">
            {!!user && (
              <button
                type="button"
                onClick={() => {
                  if (!user.work_done) setShowWorkModal(true);
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

  /** -----------------------------
   * Admin Dashboard UI
   * ------------------------------ */
  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 md:text-4xl">📊 Application Usage Dashboard</h1>
        <p className="mt-2 text-gray-600">Comprehensive insights into user activity and content distribution</p>
      </header>

      {/* Action Row */}
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

      {/* Work Modal */}
      <WorkCompletionModal
        isOpen={showWorkModal}
        onClose={() => setShowWorkModal(false)}
        onConfirm={handleWorkFinished}
        isLoading={isMarkingWorkDone}
      />

      {/* User Activity Overview Table (Visible to all, filtered for non-admins) */}
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
                  {[
                    "User",
                    "Records Created",
                    "Summaries Edited",
                    "Conclusions Edited",
                    "Total Activity",
                    "Actions",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredUserMagazineActivities.slice(0, 20).map((ua, idx) => {
                  const userKey = `${ua.userName}|${ua.userEmail}`;
                  return (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center">
                            <span className="text-sm font-medium text-indigo-700">
                              {ua.userName.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">{ua.userName}</div>
                            <div className="text-sm text-gray-500">{ua.userEmail}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">
                          {ua.recordsCreated.reduce((sum, m) => sum + m.totalCount, 0)} records
                        </div>
                        <div className="text-xs text-gray-500">{ua.recordsCreated.length} magazines</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">
                          {ua.summariesEdited.reduce((sum, m) => sum + m.totalCount, 0)} records
                        </div>
                        <div className="text-xs text-gray-500">{ua.summariesEdited.length} magazines</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">
                          {ua.conclusionsEdited.reduce((sum, m) => sum + m.totalCount, 0)} records
                        </div>
                        <div className="text-xs text-gray-500">{ua.conclusionsEdited.length} magazines</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                          {ua.totalActivity}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => openUserMagazineModal(userKey)}
                          className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredUserMagazineActivities.length === 0 && (
            <div className="text-center py-8 text-gray-500">No user activity data available.</div>
          )}
        </div>
      </section>

      {/* Modal: User Magazine Activity */}
      {showUserMagazineModal && selectedUserActivity && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
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
                <MagSection title="Records Created" color="blue" groups={selectedUserActivity.recordsCreated} />
              )}

              {/* Summaries Edited */}
              {selectedUserActivity.summariesEdited.length > 0 && (
                <MagSection title="Summaries Edited" color="green" groups={selectedUserActivity.summariesEdited} />
              )}

              {/* Conclusions Edited */}
              {selectedUserActivity.conclusionsEdited.length > 0 && (
                <MagSection title="Conclusions Edited" color="purple" groups={selectedUserActivity.conclusionsEdited} />
              )}

              {selectedUserActivity.recordsCreated.length === 0 &&
                selectedUserActivity.summariesEdited.length === 0 &&
                selectedUserActivity.conclusionsEdited.length === 0 && (
                  <div className="text-center py-8 text-gray-500">No magazine activity found for this user.</div>
                )}
            </div>
          </div>
        </div>
      )}

      {/* Admin-only Sections */}
      {isAdmin && (
        <>
          {/* Unconfirmed Users */}
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
                  {unconfirmedUsersState.map((u) => (
                    <li key={`${u.email}-${u.name}`} className="flex items-center gap-8 py-2">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold">
                          {u.name ? u.name.charAt(0).toUpperCase() : "?"}
                        </div>
                        <div>
                          <div className="font-medium text-gray-800">
                            {u.name || <span className="text-gray-400">No Name</span>}
                          </div>
                          <div className="text-xs text-gray-500">{u.email}</div>
                        </div>
                      </div>
                      <button
                        onClick={() => confirmUser(u.name, u.email)}
                        className="inline-flex items-center px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
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

          {/* Metrics Grid */}
          <div className="grid grid-cols-1 gap-6 mb-12 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Records" value={totals.records} />
            <MetricCard label="Summary Edits" value={totals.summaryEdits} />
            <MetricCard label="Conclusion Edits" value={totals.conclusionEdits} />
            <MetricCard label="Users" value={totals.users} />
            <MetricCard label="Records with Summaries" value={recordsWithSummaries} />
            <MetricCard label="Records with Conclusions" value={recordsWithConclusions} />
          </div>

          {/* Magazine Insights */}
          <section className="mb-12">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Magazine wise Insights</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {magazineReport.map((mag) => (
                <div
                  key={mag.name}
                  className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl shadow p-6 border border-gray-100 flex flex-col"
                >
                  <div className="flex items-center mb-4">
                    <div className="w-10 h-10 rounded-full bg-blue-200 flex items-center justify-center text-2xl font-bold text-blue-700">
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
                    {/* <BadgeList label="Top Authors" items={mag.authors} colorClass="bg-yellow-100 text-yellow-800" /> */}
                    <BadgeList label="Languages" items={mag.languages} colorClass="bg-indigo-100 text-indigo-700" />
                    <BadgeList label="Volumes" items={mag.volumes} colorClass="bg-purple-100 text-purple-700" />
                  </div>
                </div>
              ))}
              {magazineReport.length === 0 && (
                <div className="text-gray-500 text-center py-8 col-span-full">No magazine data available.</div>
              )}
            </div>
          </section>

          {/* Top User Activity (Chart) */}
          <section className="bg-white rounded-xl shadow-sm p-6 mb-12 border border-gray-100">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Top User Activity</h2>
            <div className="w-full h-96">
              <ResponsiveContainer>
                <BarChart data={userActivityRows} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={60} />
                  <YAxis />
                  <Tooltip formatter={(v: number, n: string) => [`${v} ${n.toLowerCase()}`, n]} />
                  <Legend />
                  <Bar dataKey="records" fill={COLORS[0]} name="Records Created" />
                  <Bar dataKey="summariesFilled" fill={COLORS[3]} name="Summaries Filled" />
                  <Bar dataKey="conclusionsFilled" fill={COLORS[4]} name="Conclusions Filled" />
                  <Bar dataKey="summaries" fill={COLORS[1]} name="Summary Edits" />
                  <Bar dataKey="conclusions" fill={COLORS[2]} name="Conclusion Edits" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </>
      )}

      {/* Quick Filters (client-side, no extra round trips) */}
      {/* <section className="bg-white rounded-xl shadow-sm p-6 mb-12 border border-gray-100">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Filters</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <Select
            value={filter.language}
            onChange={(v) => setFilter((f) => ({ ...f, language: v }))}
            label="Language"
            options={languages}
          />
          <Select
            value={filter.author}
            onChange={(v) => setFilter((f) => ({ ...f, author: v }))}
            label="Author"
            options={authorsAll}
          />
          <Select
            value={filter.email}
            onChange={(v) => setFilter((f) => ({ ...f, email: v }))}
            label="Email"
            options={emails}
          />
          <Select
            value={filter.title}
            onChange={(v) => setFilter((f) => ({ ...f, title: v }))}
            label="Title"
            options={titles}
          />
          <Select
            value={filter.creator}
            onChange={(v) => setFilter((f) => ({ ...f, creator: v }))}
            label="Creator"
            options={creators}
          />
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {["ID", "Name", "Title", "Volume", "Number", "Pages", "Authors", "Language", "Creator"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-gray-600">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRecords.slice(0, 50).map((r) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-3 py-2">{r.id}</td>
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2">{r.title_name ?? "—"}</td>
                  <td className="px-3 py-2">{r.volume ?? "—"}</td>
                  <td className="px-3 py-2">{r.number ?? "—"}</td>
                  <td className="px-3 py-2">{r.page_numbers ?? "—"}</td>
                  <td className="px-3 py-2">{r.authors ?? "—"}</td>
                  <td className="px-3 py-2">{r.language ?? "—"}</td>
                  <td className="px-3 py-2">{r.creator_name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredRecords.length === 0 && (
            <div className="text-gray-500 text-center py-6">No records match current filters.</div>
          )}
        </div>
      </section> */}
    </div>
  );
}

/** -----------------------------
 * Small UI helpers
 * ------------------------------ */
function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition-shadow">
      <h2 className="text-sm font-medium text-gray-500">{label}</h2>
      <p className="mt-2 text-3xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function BadgeList({ label, items, colorClass }: { label: string; items: string[]; colorClass: string }) {
  const maxVisible = 100;
  const visibleItems = items
    .sort((a, b) => {
      // Helper function to convert roman numerals to numbers
      const romanToNumber = (roman: string): number => {
        const romanNumerals: { [key: string]: number } = {
          I: 1,
          V: 5,
          X: 10,
          L: 50,
          C: 100,
          D: 500,
          M: 1000,
        };

        let result = 0;
        for (let i = 0; i < roman.length; i++) {
          const current = romanNumerals[roman[i]];
          const next = romanNumerals[roman[i + 1]];

          if (current < next) {
            result -= current;
          } else {
            result += current;
          }
        }
        return result;
      };

      // Helper function to extract and parse numbers (both arabic and roman)
      const extractNumber = (str: string): number => {
        // First try to extract regular numbers
        const numberMatch = str.match(/\d+/);
        if (numberMatch) {
          return parseInt(numberMatch[0], 10);
        }

        // Then try to extract roman numerals (case insensitive)
        const romanMatch = str.match(/\b([IVXLCDM]+)\b/i);
        if (romanMatch) {
          return romanToNumber(romanMatch[1].toUpperCase());
        }

        return 0; // Default if no number found
      };

      const numA = extractNumber(a);
      const numB = extractNumber(b);

      // If both have numbers, sort by number
      if (numA !== 0 || numB !== 0) {
        return numA - numB;
      }

      // Fall back to alphabetical sorting
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
    })
    .slice(0, maxVisible);
  const hiddenCount = items.length - maxVisible;

  return (
    <div className="mt-2">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="flex flex-wrap gap-1">
        {visibleItems.map((v) => (
          <span key={v} className={`inline-block ${colorClass} px-2 py-0.5 rounded text-xs`}>
            {v}
          </span>
        ))}
        {hiddenCount > 0 && (
          <span className="inline-block text-gray-500 px-2 py-0.5 rounded text-xs">+{hiddenCount} more</span>
        )}
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="text-sm">
      <div className="text-gray-600 mb-1">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 bg-white"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function MagSection({
  title,
  color,
  groups,
}: {
  title: string;
  color: "blue" | "green" | "purple";
  groups: MagazineVolumeGroup[];
}) {
  const colorMap = {
    blue: { bg: "bg-blue-50", border: "border-blue-200", tag: "bg-blue-600" },
    green: { bg: "bg-green-50", border: "border-green-200", tag: "bg-green-600" },
    purple: { bg: "bg-purple-50", border: "border-purple-200", tag: "bg-purple-600" },
  }[color];

  const total = groups.reduce((s, g) => s + g.totalCount, 0);

  return (
    <div>
      <h4 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
        <span className={`w-3 h-3 ${colorMap.tag} rounded-full mr-3`}></span>
        {title} ({total})
      </h4>

      <div className="grid gap-6">
        {groups.map((mag, idx) => (
          <div key={idx} className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold">
                  {mag.magazineName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-semibold text-gray-900">{mag.magazineName}</div>
                  <div className="text-xs text-gray-500">{mag.totalCount} record(s)</div>
                </div>
              </div>
            </div>

            {/* Per-volume cards */}
            <div className="p-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {mag.volumes.map((v, vi) => (
                <div key={vi} className={`${colorMap.bg} rounded-lg p-4 border ${colorMap.border}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex gap-3 flex-wrap">
                      {v.timestamps?.length > 0 && (
                        <div>
                          <div className="text-sm text-gray-500">Timestamps</div>
                          <div className="font-semibold text-gray-900">
                            {v.timestamps.slice(0, 10).join(", ")}
                            <span className="flex items-center text-zinc-300">
                              {v.timestamps.length > 10 && ` +${v.timestamps.length - 10} more`}
                            </span>
                          </div>
                        </div>
                      )}
                      <div>
                        <div className="text-sm text-gray-500">Volume</div>
                        <div className="font-semibold text-gray-900">{v.volume ?? "—"}</div>
                      </div>
                      {v.numbers?.length > 0 && (
                        <div>
                          <div className="text-sm text-gray-500">Numbers</div>
                          <div className="font-semibold text-gray-900">
                            {v.numbers.slice(0, 10).join(", ")}
                            <span className="flex items-center text-zinc-300">
                              {v.numbers.length > 10 && ` +${v.numbers.length - 10} more`}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                    <span className={`${colorMap.tag} text-white px-2 py-1 rounded text-sm font-medium`}>
                      {v.count} {v.count === 1 ? "record" : "records"}
                    </span>
                  </div>

                  {/* Chips */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                    <SmallBadges label="Titles" items={v.titles} colorClass="border-gray-300 text-gray-800" limit={4} />
                    <SmallBadges
                      label="Languages"
                      items={v.languages}
                      colorClass="border-gray-300 text-gray-800"
                      limit={3}
                    />
                  </div>

                  {v.authors?.length > 0 && (
                    <div className="mt-3">
                      <SmallBadges
                        label="Authors"
                        items={v.authors}
                        colorClass="border-gray-300 text-gray-800"
                        limit={6}
                      />
                    </div>
                  )}

                  {/* IDs + detailed lines */}
                  <div className="mt-3 text-xs text-gray-600">
                    <span className="font-medium">Record IDs:</span> {[...v.recordIds].sort((a, b) => a - b).join(", ")}
                  </div>

                  {/* <div className="mt-3">
                    <div className="text-xs text-gray-500 mb-1">Details</div>
                    <ul className="space-y-1 text-sm">
                      {v.records.slice(0, 10).map((r) => (
                        <li key={r.id} className="border-b last:border-0 border-gray-200 pb-1">
                          <span className="font-medium text-gray-900">#{r.id}</span>
                          {r.title ? (
                            <>
                              {" "}
                              — <span>{r.title}</span>
                            </>
                          ) : null}
                          {r.number ? <> • No: {r.number}</> : null}
                          {r.pages ? <> • Pages: {r.pages}</> : null}
                          {r.timestamp ? <> • {r.timestamp}</> : null}
                          {r.language ? <> • {r.language}</> : null}
                        </li>
                      ))}
                      {v.records.length > 10 && (
                        <li className="text-xs text-gray-500">+{v.records.length - 10} more</li>
                      )}
                    </ul>
                  </div> */}
                </div>
              ))}

              {mag.volumes.length === 0 && <div className="text-gray-500 text-sm p-4">No volume data.</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SmallBadges({
  label,
  items,
  colorClass,
  limit,
}: {
  label: string;
  items: string[];
  colorClass: string;
  limit?: number;
}) {
  const shown = limit ? items.filter(Boolean).slice(0, limit) : items.filter(Boolean);
  const hidden = limit ? Math.max(0, items.filter(Boolean).length - limit) : 0;
  return (
    <div>
      <span className="font-medium text-gray-700">{label}:</span>
      <div className="flex flex-wrap gap-1 mt-1">
        {shown.map((v, i) => (
          <span key={`${v}-${i}`} className={`bg-white px-2 py-1 rounded border ${colorClass} text-xs`}>
            {v.length > 24 ? v.slice(0, 24) + "…" : v}
          </span>
        ))}
        {hidden > 0 && <span className="text-gray-500 text-xs">+{hidden} more</span>}
      </div>
    </div>
  );
}
