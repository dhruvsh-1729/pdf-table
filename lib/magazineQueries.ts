export const MAGAZINE_SELECT_COLUMNS =
  "id,name,short_name,slug,description,cover_image_url,cover_image_public_id,logo_image_url,logo_image_public_id,website_url,contact_email,headquarters,founded_year,issn_print,issn_online,is_active,metadata,created_at,updated_at";

function mapAuthorRows(rows: any[]) {
  const map = new Map<number, any[]>();
  for (const row of rows || []) {
    const magazineId = Number(row.magazine_id);
    if (!Number.isFinite(magazineId)) continue;
    if (!map.has(magazineId)) map.set(magazineId, []);
    const author = row.authors;
    if (author) map.get(magazineId)!.push(author);
  }
  return map;
}

function mapRecordCounts(rows: any[]) {
  const counts = new Map<number, number>();
  for (const row of rows || []) {
    const magazineId = Number(row.magazine_id);
    if (!Number.isFinite(magazineId)) continue;
    counts.set(magazineId, (counts.get(magazineId) || 0) + 1);
  }
  return counts;
}

function mapLanguageRows(rows: any[]) {
  const map = new Map<number, any[]>();
  for (const row of rows || []) {
    const magazineId = Number(row.magazine_id);
    if (!Number.isFinite(magazineId)) continue;
    if (!map.has(magazineId)) map.set(magazineId, []);

    const lang = row.languages;
    if (!lang) continue;
    const current = map.get(magazineId)!;
    const exists = current.some((item) => Number(item.id) === Number(lang.id));
    if (!exists) current.push(lang);
  }
  return map;
}

export async function enrichMagazines(supabase: any, magazines: any[]) {
  const ids = (magazines || []).map((m) => Number(m.id)).filter((id) => Number.isFinite(id));
  if (!ids.length) return [];

  const [{ data: magazineAuthors, error: authorError }, { data: recordRows, error: recordError }, { data: languageRows, error: langError }] =
    await Promise.all([
      supabase
        .from("magazine_authors")
        .select("magazine_id, author_id, authors(id, name, short_name, designation)")
        .in("magazine_id", ids),
      supabase.from("records").select("magazine_id").in("magazine_id", ids),
      supabase.from("magazine_languages").select("magazine_id, language_id, languages(id, name)").in("magazine_id", ids),
    ]);

  if (authorError) throw authorError;
  if (recordError) throw recordError;
  if (langError) throw langError;

  const authorMap = mapAuthorRows(magazineAuthors || []);
  const countMap = mapRecordCounts(recordRows || []);
  const languageMap = mapLanguageRows(languageRows || []);

  return magazines.map((magazine) => ({
    ...magazine,
    authors: authorMap.get(Number(magazine.id)) || [],
    records_count: countMap.get(Number(magazine.id)) || 0,
    languages: languageMap.get(Number(magazine.id)) || [],
  }));
}

export async function fetchMagazineById(supabase: any, id: number) {
  const { data, error } = await supabase
    .from("magazines")
    .select(MAGAZINE_SELECT_COLUMNS)
    .eq("id", id)
    .single();

  if (error) throw error;

  const enriched = await enrichMagazines(supabase, data ? [data] : []);
  return enriched[0] || null;
}
