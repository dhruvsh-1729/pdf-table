// pages/api/user-magazine-activity.ts
import { createClient } from "@supabase/supabase-js";
import type { NextApiRequest, NextApiResponse } from "next";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Pull only relevant columns
    const [{ data: records }, { data: summaries }, { data: conclusions }] = await Promise.all([
      supabase.from("records").select("id,name,volume,title_name,page_numbers,authors,language,creator_name,email"),
      supabase.from("summaries").select("id,name,email,record_id"),
      supabase.from("conclusions").select("id,name,email,record_id"),
    ]);

    // Build map
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

    const byUser = new Map<string, UserMagazineActivity>();
    const k = (n: string, e: string) => `${n}|${e}`;
    const addUnique = (arr: string[], v?: string | null) => {
      const val = (v ?? "").trim();
      if (val && !arr.includes(val)) arr.push(val);
    };

    // Records created
    (records ?? []).forEach((r: any) => {
      if (!r.creator_name || !r.email) return;
      const key = k(r.creator_name, r.email);
      if (!byUser.has(key)) {
        byUser.set(key, {
          userName: r.creator_name,
          userEmail: r.email,
          recordsCreated: [],
          summariesEdited: [],
          conclusionsEdited: [],
          totalActivity: 0,
        });
      }
      const u = byUser.get(key)!;
      let bucket = u.recordsCreated.find((m) => m.magazineName === r.name);
      if (!bucket) {
        bucket = {
          magazineName: r.name,
          count: 0,
          volumes: [],
          titles: [],
          pageNumbers: [],
          authors: [],
          languages: [],
        };
        u.recordsCreated.push(bucket);
      }
      bucket.count++;
      addUnique(bucket.volumes, r.volume);
      addUnique(bucket.titles, r.title_name);
      addUnique(bucket.pageNumbers, r.page_numbers);
      addUnique(bucket.languages, r.language);
      if (r.authors) {
        r.authors
          .split(",")
          .map((a: string) => a.trim())
          .filter(Boolean)
          .forEach((a: string) => addUnique(bucket!.authors, a));
      }
      u.totalActivity++;
    });

    const recById = new Map<number, any>((records ?? []).map((r: any) => [r.id, r]));

    // Summaries edited
    (summaries ?? []).forEach((s: any) => {
      if (!s.name || !s.email || !s.record_id) return;
      const r = recById.get(s.record_id);
      if (!r) return;
      const key = k(s.name, s.email);
      if (!byUser.has(key)) {
        byUser.set(key, {
          userName: s.name,
          userEmail: s.email,
          recordsCreated: [],
          summariesEdited: [],
          conclusionsEdited: [],
          totalActivity: 0,
        });
      }
      const u = byUser.get(key)!;
      let bucket = u.summariesEdited.find((m) => m.magazineName === r.name);
      if (!bucket) {
        bucket = { magazineName: r.name, count: 0, volumes: [], titles: [], pageNumbers: [], recordIds: [] };
        u.summariesEdited.push(bucket);
      }
      bucket.count++;
      addUnique(bucket.volumes, r.volume);
      addUnique(bucket.titles, r.title_name);
      addUnique(bucket.pageNumbers, r.page_numbers);
      if (!bucket.recordIds.includes(r.id)) bucket.recordIds.push(r.id);
      u.totalActivity++;
    });

    // Conclusions edited
    (conclusions ?? []).forEach((c: any) => {
      if (!c.name || !c.email || !c.record_id) return;
      const r = recById.get(c.record_id);
      if (!r) return;
      const key = k(c.name, c.email);
      if (!byUser.has(key)) {
        byUser.set(key, {
          userName: c.name,
          userEmail: c.email,
          recordsCreated: [],
          summariesEdited: [],
          conclusionsEdited: [],
          totalActivity: 0,
        });
      }
      const u = byUser.get(key)!;
      let bucket = u.conclusionsEdited.find((m) => m.magazineName === r.name);
      if (!bucket) {
        bucket = { magazineName: r.name, count: 0, volumes: [], titles: [], pageNumbers: [], recordIds: [] };
        u.conclusionsEdited.push(bucket);
      }
      bucket.count++;
      addUnique(bucket.volumes, r.volume);
      addUnique(bucket.titles, r.title_name);
      addUnique(bucket.pageNumbers, r.page_numbers);
      if (!bucket.recordIds.includes(r.id)) bucket.recordIds.push(r.id);
      u.totalActivity++;
    });

    const out = Array.from(byUser.values()).sort((a, b) => b.totalActivity - a.totalActivity);
    res.status(200).json({ userMagazineActivities: out });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}
