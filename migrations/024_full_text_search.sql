-- Step 24: full-text search over article text (Hindi + English).
--
-- The public site could only ILIKE-search titles, summaries and author text:
-- scanning extracted_text (107 MB of OCR) that way timed out. This adds a
-- weighted tsvector per record, kept current by a trigger, a GIN index, and
-- two functions the site calls:
--   search_records(q, max_results)      -> ranked matching record ids
--   record_search_snippets(ids[], q)    -> a highlighted passage per record
--
-- archive_simple (no stemming, English stopwords dropped) handles Devanagari
-- and exact terms; the short fields are also indexed with 'english' so
-- "temples" finds "temple". Two vectors: search_vector (everything, used for
-- matching through the GIN index) and search_meta (title/authors/summary/
-- conclusion only, small, used for ranking: ranking the full vector meant
-- de-TOASTing every matching article and took ~12s for common words).
--
-- Written to run against the live table without a rewrite/long lock: no
-- transaction wrapper (CREATE INDEX CONCURRENTLY), batched backfill.
-- Safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_ts_dict WHERE dictname = 'archive_simple_dict') THEN
    CREATE TEXT SEARCH DICTIONARY public.archive_simple_dict (TEMPLATE = pg_catalog.simple, STOPWORDS = english);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'archive_simple') THEN
    CREATE TEXT SEARCH CONFIGURATION public.archive_simple (COPY = pg_catalog.simple);
    ALTER TEXT SEARCH CONFIGURATION public.archive_simple
      ALTER MAPPING FOR asciiword, word, numword, asciihword, hword, numhword, hword_part, hword_asciipart, hword_numpart
      WITH public.archive_simple_dict;
  END IF;
END;
$$;

ALTER TABLE public.records ADD COLUMN IF NOT EXISTS search_vector tsvector;
ALTER TABLE public.records ADD COLUMN IF NOT EXISTS search_meta tsvector;

CREATE OR REPLACE FUNCTION public.records_search_meta(
  p_title text, p_authors text, p_summary text, p_conclusion text
)
RETURNS tsvector
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    setweight(to_tsvector('public.archive_simple', coalesce(p_title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(p_title, '')), 'A') ||
    setweight(to_tsvector('public.archive_simple', coalesce(p_authors, '')), 'B') ||
    setweight(to_tsvector('public.archive_simple', coalesce(p_summary, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(p_summary, '')), 'B') ||
    setweight(to_tsvector('public.archive_simple', coalesce(p_conclusion, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(p_conclusion, '')), 'C');
$$;

CREATE OR REPLACE FUNCTION public.records_search_vector(
  p_title text, p_authors text, p_summary text, p_conclusion text, p_text text
)
RETURNS tsvector
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    public.records_search_meta(p_title, p_authors, p_summary, p_conclusion) ||
    -- Article body: first 100k chars (95% of articles are under 43k).
    setweight(to_tsvector('public.archive_simple', left(coalesce(p_text, ''), 100000)), 'D');
$$;

CREATE OR REPLACE FUNCTION public.trg_records_search_vector()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector := public.records_search_vector(
    NEW.title_name, NEW.authors, NEW.summary, NEW.conclusion, NEW.extracted_text
  );
  NEW.search_meta := public.records_search_meta(NEW.title_name, NEW.authors, NEW.summary, NEW.conclusion);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS records_search_vector_trg ON public.records;
CREATE TRIGGER records_search_vector_trg
  BEFORE INSERT OR UPDATE OF title_name, authors, summary, conclusion, extracted_text
  ON public.records
  FOR EACH ROW EXECUTE FUNCTION public.trg_records_search_vector();

-- Backfill in batches of 300 rows (each batch its own short transaction).
DO $$
DECLARE
  done integer;
BEGIN
  LOOP
    UPDATE public.records r
    SET search_vector = public.records_search_vector(
          r.title_name, r.authors, r.summary, r.conclusion, r.extracted_text
        ),
        search_meta = public.records_search_meta(r.title_name, r.authors, r.summary, r.conclusion)
    WHERE r.id IN (SELECT id FROM public.records WHERE search_vector IS NULL OR search_meta IS NULL LIMIT 300);
    GET DIAGNOSTICS done = ROW_COUNT;
    EXIT WHEN done = 0;
    COMMIT;
  END LOOP;
END;
$$;

CREATE INDEX CONCURRENTLY IF NOT EXISTS records_search_vector_idx
  ON public.records USING gin (search_vector);

-- Ranked ids for a query. Accepts web-search syntax: "exact phrase", OR, -word.
-- SECURITY DEFINER on purpose: under RLS (migration 018) Postgres will not
-- evaluate the non-leakproof @@ operator before the policy, so it cannot use
-- the GIN index and scans every row (~20s). These functions bypass RLS and
-- apply the same visibility rule themselves (records of active magazines).
CREATE OR REPLACE FUNCTION public.search_records(q text, max_results integer DEFAULT 1000)
RETURNS TABLE (id bigint, rank real)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH query AS (
    SELECT websearch_to_tsquery('public.archive_simple', q) || websearch_to_tsquery('english', q) AS tsq
  )
  -- Title/summary relevance first; body-only matches follow.
  SELECT r.id, (ts_rank_cd(r.search_meta, query.tsq, 32) + 0.001)::real AS rank
  FROM public.records r
  JOIN public.magazines m ON m.id = r.magazine_id AND m.is_active
  CROSS JOIN query
  WHERE numnode(query.tsq) > 0
    AND r.search_vector @@ query.tsq
  ORDER BY rank DESC, r.id
  LIMIT LEAST(greatest(max_results, 1), 2000);
$$;

-- One highlighted passage per record, matches wrapped in [[ ]] for the client
-- to render. Only called for the ~20 records on the current results page.
CREATE OR REPLACE FUNCTION public.record_search_snippets(ids bigint[], q text)
RETURNS TABLE (id bigint, snippet text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH query AS (
    SELECT websearch_to_tsquery('public.archive_simple', q) || websearch_to_tsquery('english', q) AS tsq
  )
  SELECT r.id,
         ts_headline(
           'public.archive_simple',
           left(coalesce(r.summary, '') || E'\n' || coalesce(r.extracted_text, ''), 60000),
           query.tsq,
           'StartSel=[[, StopSel=]], MaxWords=35, MinWords=18, MaxFragments=2, FragmentDelimiter=" … "'
         ) AS snippet
  FROM public.records r
  JOIN public.magazines m ON m.id = r.magazine_id AND m.is_active
  CROSS JOIN query
  WHERE r.id = ANY(ids) AND numnode(query.tsq) > 0;
$$;

GRANT EXECUTE ON FUNCTION public.search_records(text, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_search_snippets(bigint[], text) TO anon, authenticated, service_role;
