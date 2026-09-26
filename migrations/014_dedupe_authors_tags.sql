-- Step 14: merge duplicate authors and tags, and stop new duplicates.
--
-- Why duplicates exist:
--   * authors.name had no unique constraint. The upload page creates each
--     author and relies on a "name already exists" (409) error to reuse the
--     existing one, which never fired — so every upload created a new author
--     row ("आचार्यश्री महाप्रज्ञ" existed 40 times).
--   * The tag API compared names case-sensitively, so "Karma and Rebirth" and
--     "Karma And Rebirth" became separate tags.
--
-- Only rows whose names are identical after trimming, collapsing whitespace,
-- Unicode NFC normalisation and lower-casing are merged. Spelling variants
-- (e.g. "कमलचन्द" vs "कमलचंद") and honorific variants are NOT touched here.
--
-- The survivor of each group is the row with the most linked records (ties:
-- lowest id). Its missing profile fields are filled from the other rows.
--
-- Safe to re-run.

BEGIN;

CREATE OR REPLACE FUNCTION public.clean_entity_name(raw TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT BTRIM(REGEXP_REPLACE(NORMALIZE(raw, NFC), '\s+', ' ', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.entity_name_key(raw TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT LOWER(public.clean_entity_name(raw));
$$;

-- 1. Authors -------------------------------------------------------------------

CREATE TEMP TABLE author_merge ON COMMIT DROP AS
WITH ranked AS (
  SELECT a.id,
         public.entity_name_key(a.name::text) AS k,
         (SELECT COUNT(*) FROM public.record_authors ra WHERE ra.author_id = a.id) AS n
  FROM public.authors a
),
grouped AS (
  SELECT id, k,
         FIRST_VALUE(id) OVER (PARTITION BY k ORDER BY n DESC, id) AS keep_id
  FROM ranked
)
SELECT id AS dup_id, keep_id FROM grouped WHERE id <> keep_id;

-- Fill empty profile fields on the survivor from its duplicates.
UPDATE public.authors keep
SET description = COALESCE(keep.description, src.description),
    cover_url   = COALESCE(keep.cover_url, src.cover_url),
    national    = COALESCE(keep.national, src.national),
    designation = COALESCE(keep.designation, src.designation),
    short_name  = COALESCE(keep.short_name, src.short_name)
FROM (
  SELECT m.keep_id,
         (ARRAY_AGG(a.description ORDER BY a.id) FILTER (WHERE a.description IS NOT NULL))[1] AS description,
         (ARRAY_AGG(a.cover_url   ORDER BY a.id) FILTER (WHERE a.cover_url   IS NOT NULL))[1] AS cover_url,
         (ARRAY_AGG(a.national    ORDER BY a.id) FILTER (WHERE a.national    IS NOT NULL))[1] AS national,
         (ARRAY_AGG(a.designation ORDER BY a.id) FILTER (WHERE a.designation IS NOT NULL))[1] AS designation,
         (ARRAY_AGG(a.short_name  ORDER BY a.id) FILTER (WHERE a.short_name  IS NOT NULL))[1] AS short_name
  FROM author_merge m JOIN public.authors a ON a.id = m.dup_id
  GROUP BY m.keep_id
) src
WHERE keep.id = src.keep_id;

INSERT INTO public.record_authors (record_id, author_id)
SELECT ra.record_id, m.keep_id
FROM public.record_authors ra JOIN author_merge m ON m.dup_id = ra.author_id
ON CONFLICT (record_id, author_id) DO NOTHING;

INSERT INTO public.magazine_authors (magazine_id, author_id)
SELECT ma.magazine_id, m.keep_id
FROM public.magazine_authors ma JOIN author_merge m ON m.dup_id = ma.author_id
ON CONFLICT (magazine_id, author_id) DO NOTHING;

-- followed_authors has no FK to authors, so it must be repointed by hand.
INSERT INTO public.followed_authors (user_id, author_id, name, created_at)
SELECT fa.user_id, m.keep_id, fa.name, fa.created_at
FROM public.followed_authors fa JOIN author_merge m ON m.dup_id = fa.author_id
ON CONFLICT (user_id, author_id) DO NOTHING;
DELETE FROM public.followed_authors fa USING author_merge m WHERE fa.author_id = m.dup_id;

-- record_authors / magazine_authors rows of the duplicates cascade away.
DELETE FROM public.authors a USING author_merge m WHERE a.id = m.dup_id;

UPDATE public.authors
SET name = public.clean_entity_name(name::text)
WHERE name::text IS DISTINCT FROM public.clean_entity_name(name::text);

-- 2. Tags ----------------------------------------------------------------------

CREATE TEMP TABLE tag_merge ON COMMIT DROP AS
WITH ranked AS (
  SELECT t.id,
         public.entity_name_key(t.name) AS k,
         (SELECT COUNT(*) FROM public.record_tags rt WHERE rt.tag_id = t.id) AS n
  FROM public.tags t
),
grouped AS (
  SELECT id, k,
         FIRST_VALUE(id) OVER (PARTITION BY k ORDER BY n DESC, id) AS keep_id
  FROM ranked
)
SELECT id AS dup_id, keep_id FROM grouped WHERE id <> keep_id;

UPDATE public.tags keep
SET important = TRUE
FROM tag_merge m JOIN public.tags d ON d.id = m.dup_id
WHERE keep.id = m.keep_id AND d.important IS TRUE AND keep.important IS NOT TRUE;

INSERT INTO public.record_tags (record_id, tag_id)
SELECT rt.record_id, m.keep_id
FROM public.record_tags rt JOIN tag_merge m ON m.dup_id = rt.tag_id
ON CONFLICT (record_id, tag_id) DO NOTHING;

INSERT INTO public.tag_subsubjects (tag_id, subsubject_id)
SELECT m.keep_id, ts.subsubject_id
FROM public.tag_subsubjects ts JOIN tag_merge m ON m.dup_id = ts.tag_id
ON CONFLICT (tag_id, subsubject_id) DO NOTHING;

UPDATE public.subjects_tags st SET tag_id = m.keep_id
FROM tag_merge m WHERE st.tag_id = m.dup_id;
DELETE FROM public.subjects_tags st
USING public.subjects_tags other
WHERE st.subject_id IS NOT DISTINCT FROM other.subject_id
  AND st.tag_id IS NOT DISTINCT FROM other.tag_id
  AND st.id > other.id;

DELETE FROM public.tags t USING tag_merge m WHERE t.id = m.dup_id;

UPDATE public.tags
SET name = public.clean_entity_name(name)
WHERE name IS DISTINCT FROM public.clean_entity_name(name);

-- 3. Keep it that way ----------------------------------------------------------

-- Every write path (admin UI, upload page, imports, scripts) gets the same
-- whitespace/Unicode clean-up, and the unique indexes turn a duplicate insert
-- into a 23505 error that the APIs map to "already exists".
CREATE OR REPLACE FUNCTION public.trg_clean_entity_name()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.name := public.clean_entity_name(NEW.name::text);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS authors_clean_name ON public.authors;
CREATE TRIGGER authors_clean_name
  BEFORE INSERT OR UPDATE OF name ON public.authors
  FOR EACH ROW EXECUTE FUNCTION public.trg_clean_entity_name();

DROP TRIGGER IF EXISTS tags_clean_name ON public.tags;
CREATE TRIGGER tags_clean_name
  BEFORE INSERT OR UPDATE OF name ON public.tags
  FOR EACH ROW EXECUTE FUNCTION public.trg_clean_entity_name();

CREATE UNIQUE INDEX IF NOT EXISTS authors_name_key_unique ON public.authors (public.entity_name_key(name::text));
CREATE UNIQUE INDEX IF NOT EXISTS tags_name_key_unique ON public.tags (public.entity_name_key(name));

COMMIT;
