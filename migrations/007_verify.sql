-- Step 6 + finalization.

SELECT COUNT(*) AS magazines_count FROM public.magazines;
SELECT COUNT(*) AS languages_count FROM public.languages;
SELECT COUNT(*) AS record_languages_count FROM public.record_languages;
SELECT COUNT(*) AS magazine_languages_count FROM public.magazine_languages;
SELECT COUNT(*) AS records_without_magazine FROM public.records WHERE magazine_id IS NULL;
SELECT COUNT(*) AS orphan_record_languages
FROM public.record_languages rl
LEFT JOIN public.records r ON rl.record_id = r.id
WHERE r.id IS NULL;

-- Extra anomaly check: parsed language values that did not map.
CREATE TEMP TABLE tmp_unmapped_language_tokens (
  unmapped_language_tokens bigint
) ON COMMIT DROP;

DO $$
DECLARE
  language_column text;
  unmapped_tokens bigint := 0;
BEGIN
  SELECT CASE
           WHEN EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'records' AND column_name = 'language'
           ) THEN 'language'
           WHEN EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'records' AND column_name = 'language_legacy'
           ) THEN 'language_legacy'
           ELSE NULL
         END
  INTO language_column;

  IF language_column IS NOT NULL THEN
    EXECUTE format(
      'SELECT COUNT(*)
       FROM (
         SELECT DISTINCT BTRIM(parsed.language_name) AS language_name
         FROM public.records r
         CROSS JOIN LATERAL public.split_record_languages(r.%1$I) parsed
         WHERE r.%1$I IS NOT NULL
           AND BTRIM(r.%1$I) <> ''''
           AND BTRIM(parsed.language_name) <> ''''
       ) x
       LEFT JOIN public.languages l ON l.name = x.language_name
       WHERE l.id IS NULL;',
      language_column
    )
    INTO unmapped_tokens;
  END IF;

  INSERT INTO tmp_unmapped_language_tokens (unmapped_language_tokens)
  VALUES (unmapped_tokens);
END;
$$;

SELECT unmapped_language_tokens
FROM tmp_unmapped_language_tokens;

DO $$
DECLARE
  missing_magazines bigint;
  orphan_record_languages bigint;
  unmapped_tokens bigint;
  before_magazines bigint;
  before_languages bigint;
  after_magazines bigint;
  after_languages bigint;
  after_record_languages bigint;
  after_magazine_languages bigint;
  name_column text;
  language_column text;
BEGIN
  SELECT CASE
           WHEN EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'records' AND column_name = 'name'
           ) THEN 'name'
           WHEN EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'records' AND column_name = 'name_legacy'
           ) THEN 'name_legacy'
           ELSE NULL
         END
  INTO name_column;

  SELECT CASE
           WHEN EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'records' AND column_name = 'language'
           ) THEN 'language'
           WHEN EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'records' AND column_name = 'language_legacy'
           ) THEN 'language_legacy'
           ELSE NULL
         END
  INTO language_column;

  SELECT COUNT(*) INTO missing_magazines
  FROM public.records
  WHERE magazine_id IS NULL;

  SELECT COUNT(*) INTO orphan_record_languages
  FROM public.record_languages rl
  LEFT JOIN public.records r ON r.id = rl.record_id
  WHERE r.id IS NULL;

  IF language_column IS NULL THEN
    unmapped_tokens := 0;
  ELSE
    EXECUTE format(
      'SELECT COUNT(*)
       FROM (
         SELECT DISTINCT BTRIM(parsed.language_name) AS language_name
         FROM public.records r
         CROSS JOIN LATERAL public.split_record_languages(r.%1$I) parsed
         WHERE r.%1$I IS NOT NULL
           AND BTRIM(r.%1$I) <> ''''
           AND BTRIM(parsed.language_name) <> ''''
       ) x
       LEFT JOIN public.languages l ON l.name = x.language_name
       WHERE l.id IS NULL;',
      language_column
    )
    INTO unmapped_tokens;
  END IF;

  IF missing_magazines > 0 OR orphan_record_languages > 0 OR unmapped_tokens > 0 THEN
    RAISE EXCEPTION
      'Verification failed. missing_magazines=%, orphan_record_languages=%, unmapped_tokens=%',
      missing_magazines,
      orphan_record_languages,
      unmapped_tokens;
  END IF;

  IF name_column IS NULL THEN
    before_magazines := 0;
  ELSE
    EXECUTE format(
      'SELECT COUNT(DISTINCT BTRIM(%1$I))
       FROM public.records
       WHERE %1$I IS NOT NULL
         AND BTRIM(%1$I) <> '''';',
      name_column
    )
    INTO before_magazines;
  END IF;

  IF language_column IS NULL THEN
    before_languages := 0;
  ELSE
    EXECUTE format(
      'SELECT COUNT(DISTINCT BTRIM(parsed.language_name))
       FROM public.records r
       CROSS JOIN LATERAL public.split_record_languages(r.%1$I) parsed
       WHERE r.%1$I IS NOT NULL
         AND BTRIM(r.%1$I) <> ''''
         AND BTRIM(parsed.language_name) <> '''';',
      language_column
    )
    INTO before_languages;
  END IF;

  SELECT COUNT(*) INTO after_magazines FROM public.magazines;
  SELECT COUNT(*) INTO after_languages FROM public.languages;
  SELECT COUNT(*) INTO after_record_languages FROM public.record_languages;
  SELECT COUNT(*) INTO after_magazine_languages FROM public.magazine_languages;

  RAISE NOTICE 'Migration summary: before_magazines=%, after_magazines=%, before_languages=%, after_languages=%, record_languages=%, magazine_languages=%',
    before_magazines,
    after_magazines,
    before_languages,
    after_languages,
    after_record_languages,
    after_magazine_languages;
END;
$$;

ALTER TABLE public.records
ALTER COLUMN magazine_id SET NOT NULL;

-- Step 2/4 finalization: keep old columns as _legacy for safety.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'records'
      AND column_name = 'name'
  ) THEN
    ALTER TABLE public.records RENAME COLUMN name TO name_legacy;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'records'
      AND column_name = 'language'
  ) THEN
    ALTER TABLE public.records RENAME COLUMN language TO language_legacy;
  END IF;
END;
$$;
