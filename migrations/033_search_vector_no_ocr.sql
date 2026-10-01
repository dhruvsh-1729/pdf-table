-- Step 33: stop indexing OCR body text, to fit the Supabase Free Plan.
--
-- The database hit 685 MB against the Free Plan's 500 MB (over the limit,
-- Free projects go read-only). 308 MB of that was search_vector plus its GIN
-- index, almost all built from extracted_text, and ~150 MB was dead space
-- left behind by the backfills of 2026-09-26.
--
-- search_vector now covers title/authors/summary/conclusion only (same as
-- search_meta). Search no longer matches words found only in an article's
-- body. extracted_text itself is kept: summaries are regenerated from it.
-- records_search_vector keeps its signature so callers don't change.
--
-- VACUUM FULL rewrites records and its indexes (ACCESS EXCLUSIVE lock for
-- about a minute). Run without a transaction wrapper: psql -f.

CREATE OR REPLACE FUNCTION public.records_search_vector(
  p_title text, p_authors text, p_summary text, p_conclusion text, p_text text
) RETURNS tsvector
LANGUAGE sql IMMUTABLE
AS $$
  SELECT public.records_search_meta(p_title, p_authors, p_summary, p_conclusion);
$$;

-- extracted_text no longer feeds the vectors, so edits to it needn't fire.
DROP TRIGGER IF EXISTS records_search_vector_trg ON public.records;
CREATE TRIGGER records_search_vector_trg
  BEFORE INSERT OR UPDATE OF title_name, authors, summary, conclusion ON public.records
  FOR EACH ROW EXECUTE FUNCTION public.trg_records_search_vector();

UPDATE public.records SET search_vector = search_meta
WHERE search_vector IS DISTINCT FROM search_meta;

VACUUM FULL ANALYZE public.records;
