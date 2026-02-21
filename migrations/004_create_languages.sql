-- Step 3: create languages table and seed from parsed records.language.

CREATE TABLE IF NOT EXISTS public.languages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.split_record_languages(raw_input text)
RETURNS TABLE(language_name text)
LANGUAGE plpgsql
AS $$
DECLARE
  known_languages text[] := ARRAY[
    'arabic','assamese','bengali','bodo','dogri','english','french','german','gujarati','hindi',
    'kannada','kashmiri','konkani','maithili','malayalam','manipuri','marathi','nepali','odia',
    'oriya','punjabi','sanskrit','santhali','sindhi','spanish','tamil','telugu','urdu'
  ];
  cleaned text;
  chunk text;
  and_parts text[];
  part text;
  all_known boolean;
BEGIN
  IF raw_input IS NULL THEN
    RETURN;
  END IF;

  cleaned := BTRIM(raw_input);
  IF cleaned = '' THEN
    RETURN;
  END IF;

  cleaned := TRIM(BOTH '"' FROM TRIM(BOTH '[]' FROM cleaned));
  cleaned := REGEXP_REPLACE(cleaned, '\\s+', ' ', 'g');

  FOREACH chunk IN ARRAY REGEXP_SPLIT_TO_ARRAY(cleaned, '\\s*(?:,|&)\\s*') LOOP
    chunk := BTRIM(chunk);
    IF chunk = '' THEN
      CONTINUE;
    END IF;

    IF chunk ~* '\\s+and\\s+' THEN
      and_parts := REGEXP_SPLIT_TO_ARRAY(chunk, '\\s+and\\s+');
      all_known := true;

      FOREACH part IN ARRAY and_parts LOOP
        part := BTRIM(part);
        IF part = '' OR LOWER(part) <> ALL(known_languages) THEN
          all_known := false;
          EXIT;
        END IF;
      END LOOP;

      IF all_known THEN
        FOREACH part IN ARRAY and_parts LOOP
          part := BTRIM(part);
          IF part <> '' THEN
            language_name := INITCAP(part);
            RETURN NEXT;
          END IF;
        END LOOP;
      ELSE
        language_name := chunk;
        RETURN NEXT;
      END IF;
    ELSE
      language_name := INITCAP(chunk);
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

CREATE TEMP TABLE tmp_language_candidates (
  language_name text
) ON COMMIT DROP;

DO $$
DECLARE
  language_col text;
BEGIN
  SELECT CASE
           WHEN EXISTS (
             SELECT 1
             FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name = 'records'
               AND column_name = 'language'
           ) THEN 'language'
           WHEN EXISTS (
             SELECT 1
             FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name = 'records'
               AND column_name = 'language_legacy'
           ) THEN 'language_legacy'
           ELSE NULL
         END
  INTO language_col;

  IF language_col IS NULL THEN
    RAISE NOTICE 'No language/language_legacy column found. Skipping language candidate extraction.';
    RETURN;
  END IF;

  EXECUTE format(
    'INSERT INTO tmp_language_candidates (language_name)
     SELECT DISTINCT BTRIM(parsed.language_name) AS language_name
     FROM public.records r
     CROSS JOIN LATERAL public.split_record_languages(r.%1$I) parsed
     WHERE r.%1$I IS NOT NULL
       AND BTRIM(r.%1$I) <> ''''
       AND BTRIM(parsed.language_name) <> '''';',
    language_col
  );
END;
$$;

-- Print extracted language candidates for review.
SELECT language_name
FROM tmp_language_candidates
ORDER BY language_name;

INSERT INTO public.languages (name)
SELECT language_name
FROM tmp_language_candidates
ON CONFLICT (name) DO NOTHING;
