-- Step 4: create record_languages and map parsed languages.

CREATE TABLE IF NOT EXISTS public.record_languages (
  record_id BIGINT NOT NULL REFERENCES public.records(id) ON DELETE CASCADE,
  language_id BIGINT NOT NULL REFERENCES public.languages(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (record_id, language_id)
);

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
    RAISE NOTICE 'No language/language_legacy column found. Skipping record_languages backfill.';
    RETURN;
  END IF;

  EXECUTE format(
    'INSERT INTO public.record_languages (record_id, language_id)
     SELECT DISTINCT r.id, l.id
     FROM public.records r
     CROSS JOIN LATERAL public.split_record_languages(r.%1$I) parsed
     JOIN public.languages l
       ON l.name = BTRIM(parsed.language_name)
     WHERE r.%1$I IS NOT NULL
       AND BTRIM(r.%1$I) <> ''''
       AND BTRIM(parsed.language_name) <> ''''
     ON CONFLICT (record_id, language_id) DO NOTHING;',
    language_col
  );
END;
$$;

CREATE INDEX IF NOT EXISTS idx_record_languages_record_id ON public.record_languages(record_id);
CREATE INDEX IF NOT EXISTS idx_record_languages_language_id ON public.record_languages(language_id);
