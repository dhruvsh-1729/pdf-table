-- Step 31: data-quality overview for the admin portal's /quality page.
--
-- One row per magazine (including inactive ones, so hidden data is visible
-- to admins) with coverage counts. Portal-only: service role executes it;
-- anon/authenticated cannot.
-- Safe to re-run.

CREATE OR REPLACE FUNCTION public.quality_overview()
RETURNS TABLE (
  magazine_id bigint,
  magazine_name text,
  is_active boolean,
  records bigint,
  no_author bigint,
  placeholder_author bigint,
  no_language bigint,
  no_subject bigint,
  no_tags bigint,
  no_year bigint,
  text_missing bigint,
  text_partial bigint,
  text_garbled bigint,
  summary_missing bigint,
  status_unchecked bigint,
  status_ai_audited bigint,
  status_human_verified bigint,
  status_flagged bigint,
  hindi_articles bigint,
  hindi_translated bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH r AS (
    SELECT
      rec.id, rec.magazine_id, rec.publication_year, rec.text_quality, rec.check_status,
      rec.summary, rec.summary_hi,
      EXISTS (SELECT 1 FROM record_authors ra JOIN authors a ON a.id = ra.author_id
              WHERE ra.record_id = rec.id AND lower(a.name::text) NOT IN ('unexhibited', 'unknown', 'anonymous')) AS has_real_author,
      EXISTS (SELECT 1 FROM record_authors ra JOIN authors a ON a.id = ra.author_id
              WHERE ra.record_id = rec.id AND lower(a.name::text) IN ('unexhibited', 'unknown', 'anonymous')) AS has_placeholder,
      EXISTS (SELECT 1 FROM record_languages rl WHERE rl.record_id = rec.id) AS has_language,
      EXISTS (SELECT 1 FROM record_languages rl JOIN languages l ON l.id = rl.language_id
              WHERE rl.record_id = rec.id AND l.name = 'Hindi') AS is_hindi,
      EXISTS (SELECT 1 FROM record_subjects rs WHERE rs.record_id = rec.id) AS has_subject,
      EXISTS (SELECT 1 FROM record_tags rt WHERE rt.record_id = rec.id) AS has_tags
    FROM records rec
  )
  SELECT
    m.id, m.name, m.is_active,
    count(r.id),
    count(r.id) FILTER (WHERE NOT r.has_real_author AND NOT r.has_placeholder),
    count(r.id) FILTER (WHERE NOT r.has_real_author AND r.has_placeholder),
    count(r.id) FILTER (WHERE NOT r.has_language),
    count(r.id) FILTER (WHERE NOT r.has_subject),
    count(r.id) FILTER (WHERE NOT r.has_tags),
    count(r.id) FILTER (WHERE r.publication_year IS NULL),
    count(r.id) FILTER (WHERE r.text_quality = 'missing'),
    count(r.id) FILTER (WHERE r.text_quality = 'partial'),
    count(r.id) FILTER (WHERE r.text_quality = 'garbled'),
    count(r.id) FILTER (WHERE coalesce(btrim(r.summary), '') = ''),
    count(r.id) FILTER (WHERE r.check_status = 'unchecked' OR r.check_status IS NULL),
    count(r.id) FILTER (WHERE r.check_status = 'ai_audited'),
    count(r.id) FILTER (WHERE r.check_status = 'human_verified'),
    count(r.id) FILTER (WHERE r.check_status = 'flagged'),
    count(r.id) FILTER (WHERE r.is_hindi),
    count(r.id) FILTER (WHERE r.is_hindi AND r.summary_hi IS NOT NULL)
  FROM magazines m
  JOIN r ON r.magazine_id = m.id
  GROUP BY m.id, m.name, m.is_active
  ORDER BY count(r.id) DESC;
$$;

REVOKE ALL ON FUNCTION public.quality_overview() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quality_overview() TO service_role;
