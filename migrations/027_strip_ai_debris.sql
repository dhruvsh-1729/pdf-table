-- 027: remove ChatGPT citation debris that was pasted into summaries/conclusions, e.g.
--   "...study file:///home/oai/share/520754-212-427.pdf#:~:text=..." or "citeturn0search3" / "【4†source】".
-- Originals are copied to record_summary_history first. Runs in small committed batches so the
-- search_vector trigger work doesn't starve the live site (3s anon statement timeout).

CREATE OR REPLACE FUNCTION public.strip_ai_debris(t TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            -- a link that ended a sentence keeps the full stop
            regexp_replace(t, 'file:///\S+\.(\s|$)', '.\1', 'g'),
            'file:///\S+', '', 'g'),
          '(citeturn[0-9A-Za-z]*|turn[0-9]+(search|view|file|news)[0-9]*|【[^】]*】|filecite[0-9A-Za-z†:_-]*)', '', 'g'),
        '[ \t]{2,}', ' ', 'g'),
      '[ \t]+([.,;:])', '\1', 'g'))
$$;

CREATE OR REPLACE FUNCTION public.has_ai_debris(t TEXT) RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT t ~ '(file:///|citeturn|turn[0-9]+(search|view|file|news)[0-9]*|【[^】]*】|filecite)'
$$;

-- History (records table): one row per affected record.
INSERT INTO public.record_summary_history (record_id, summary, conclusion, summary_origin, check_status, audit_score, audit_notes, replaced_by, reason)
SELECT id, summary, conclusion, summary_origin, check_status, audit_score, audit_notes, 'migration-027', 'strip ChatGPT citation debris (records.summary/conclusion)'
FROM public.records
WHERE public.has_ai_debris(summary) OR public.has_ai_debris(conclusion);

-- History (volunteer tables).
INSERT INTO public.record_summary_history (record_id, summary, replaced_by, reason)
SELECT record_id, summary, 'migration-027', 'strip ChatGPT citation debris (summaries table, id ' || id || ')'
FROM public.summaries WHERE record_id IS NOT NULL AND public.has_ai_debris(summary);
INSERT INTO public.record_summary_history (record_id, conclusion, replaced_by, reason)
SELECT record_id, conclusion, 'migration-027', 'strip ChatGPT citation debris (conclusions table, id ' || id || ')'
FROM public.conclusions WHERE record_id IS NOT NULL AND public.has_ai_debris(conclusion);

UPDATE public.summaries SET summary = public.strip_ai_debris(summary) WHERE public.has_ai_debris(summary);
UPDATE public.conclusions SET conclusion = public.strip_ai_debris(conclusion) WHERE public.has_ai_debris(conclusion);

-- records: batches of 50 with a pause (each update recomputes search_vector).
DO $$
DECLARE n INT;
BEGIN
  LOOP
    UPDATE public.records r SET
      summary = CASE WHEN public.has_ai_debris(r.summary) THEN public.strip_ai_debris(r.summary) ELSE r.summary END,
      conclusion = CASE WHEN public.has_ai_debris(r.conclusion) THEN public.strip_ai_debris(r.conclusion) ELSE r.conclusion END
    WHERE r.id IN (
      SELECT id FROM public.records
      WHERE public.has_ai_debris(summary) OR public.has_ai_debris(conclusion)
      LIMIT 50);
    GET DIAGNOSTICS n = ROW_COUNT;
    EXIT WHEN n = 0;
    COMMIT;
    PERFORM pg_sleep(0.5);
  END LOOP;
END $$;
