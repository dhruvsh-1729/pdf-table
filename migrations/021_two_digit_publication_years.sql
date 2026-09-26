-- 021: resolve "Mon-YY" dates (e.g. "Jun-55") using the journal's known year range.
-- A century is chosen only when exactly one of 19YY / 20YY falls within the range (±2 years).
WITH ranges AS (
  SELECT magazine_id, min(publication_year) - 2 AS lo, max(publication_year) + 2 AS hi
  FROM public.records WHERE publication_year IS NOT NULL GROUP BY magazine_id
), cand AS (
  SELECT r.id, (regexp_match(r.timestamp, '^([A-Za-z]{3})-([0-9]{2})$')) AS m, g.lo, g.hi
  FROM public.records r JOIN ranges g USING (magazine_id)
  WHERE r.publication_year IS NULL AND r.timestamp ~ '^[A-Za-z]{3}-[0-9]{2}$'
), resolved AS (
  SELECT id, m[1] AS mon,
    CASE
      WHEN (1900 + m[2]::int BETWEEN lo AND hi) AND NOT (2000 + m[2]::int BETWEEN lo AND hi) THEN 1900 + m[2]::int
      WHEN (2000 + m[2]::int BETWEEN lo AND hi) AND NOT (1900 + m[2]::int BETWEEN lo AND hi) THEN 2000 + m[2]::int
    END AS yr
  FROM cand
)
UPDATE public.records r SET
  publication_year = resolved.yr,
  publication_month = CASE lower(resolved.mon)
    WHEN 'jan' THEN 1 WHEN 'feb' THEN 2 WHEN 'mar' THEN 3 WHEN 'apr' THEN 4 WHEN 'may' THEN 5 WHEN 'jun' THEN 6
    WHEN 'jul' THEN 7 WHEN 'aug' THEN 8 WHEN 'sep' THEN 9 WHEN 'oct' THEN 10 WHEN 'nov' THEN 11 WHEN 'dec' THEN 12 END
FROM resolved
WHERE r.id = resolved.id AND resolved.yr IS NOT NULL;
