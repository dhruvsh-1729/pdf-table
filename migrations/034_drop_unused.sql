-- Step 34: drop data nothing reads, to keep well inside the Free Plan's 500 MB.
--
-- 1. search_meta: since 033 it is identical to search_vector (37 MB stored
--    twice). search_records now ranks on search_vector.
-- 2. subjects, subjects_tags, magazine_subjects: empty since the subject
--    taxonomy moved to subject_areas / subsubjects / record_subjects /
--    record_subsubjects. Neither app queries them.
-- 3. tag_subsubjects (16k rows): written only by merge_tags and the old
--    subject SQL generator, never read. record_subsubjects holds the result.
--
-- Backups taken 2026-10-01 in kkms/backups/ (CSV + DDL, old function bodies).
-- VACUUM FULL reclaims the dropped column's space; run with psql -f.

CREATE OR REPLACE FUNCTION public.search_records(q text, max_results integer DEFAULT 1000)
 RETURNS TABLE(id bigint, rank real)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with query as (
    select websearch_to_tsquery('public.archive_simple', q) || websearch_to_tsquery('english', q) as tsq
  ),
  matches as (
    select r.id, r.search_title, r.search_vector
    from public.records r
    join public.magazines m on m.id = r.magazine_id and m.is_active
    cross join query
    where numnode(query.tsq) > 0
      and r.search_vector @@ query.tsq
  ),
  sized as (
    select count(*) as n from matches
  )
  select mt.id,
         (case
            when sized.n <= 300 then ts_rank_cd(mt.search_vector, query.tsq, 32)
            else ts_rank_cd(mt.search_title, query.tsq, 32)
          end + 0.001)::real as rank
  from matches mt, sized, query
  order by rank desc, mt.id
  limit least(greatest(max_results, 1), 2000);
$function$;

CREATE OR REPLACE FUNCTION public.trg_records_search_vector()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.search_vector := public.records_search_vector(
    new.title_name, new.authors, new.summary, new.conclusion, new.extracted_text
  );
  new.search_title := public.records_search_meta(new.title_name, new.authors, null, null);
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.merge_tags(p_keep integer, p_merge integer[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_merge integer[] := array_remove(p_merge, p_keep);
  v_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tags WHERE id = p_keep) THEN
    RAISE EXCEPTION 'tag % does not exist', p_keep USING ERRCODE = 'P0002';
  END IF;
  IF coalesce(array_length(v_merge, 1), 0) = 0 THEN
    RAISE EXCEPTION 'nothing to merge' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM tags WHERE id = ANY (v_merge)) <> array_length(v_merge, 1) THEN
    RAISE EXCEPTION 'some tags to merge do not exist' USING ERRCODE = 'P0002';
  END IF;

  UPDATE tags SET important = true
  WHERE id = p_keep AND EXISTS (SELECT 1 FROM tags WHERE id = ANY (v_merge) AND important);

  INSERT INTO record_tags (record_id, tag_id)
  SELECT record_id, p_keep FROM record_tags WHERE tag_id = ANY (v_merge)
  ON CONFLICT DO NOTHING;

  DELETE FROM tags WHERE id = ANY (v_merge);

  SELECT count(*) INTO v_count FROM record_tags WHERE tag_id = p_keep;
  RETURN v_count;
END;
$function$;

ALTER TABLE public.records DROP COLUMN IF EXISTS search_meta;

DROP TABLE IF EXISTS public.magazine_subjects;
DROP TABLE IF EXISTS public.subjects_tags;
DROP TABLE IF EXISTS public.subjects;
DROP TABLE IF EXISTS public.tag_subsubjects;

VACUUM FULL ANALYZE public.records;
