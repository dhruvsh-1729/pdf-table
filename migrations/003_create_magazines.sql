-- Step 2: create magazines table and map records.magazine_id.

CREATE TABLE IF NOT EXISTS public.magazines (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

DO $$
DECLARE
  name_col text;
BEGIN
  SELECT CASE
           WHEN EXISTS (
             SELECT 1
             FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name = 'records'
               AND column_name = 'name'
           ) THEN 'name'
           WHEN EXISTS (
             SELECT 1
             FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name = 'records'
               AND column_name = 'name_legacy'
           ) THEN 'name_legacy'
           ELSE NULL
         END
  INTO name_col;

  IF name_col IS NULL THEN
    RAISE NOTICE 'No name/name_legacy column found. Skipping magazine seed from records.';
    RETURN;
  END IF;

  EXECUTE format(
    'INSERT INTO public.magazines (name)
     SELECT DISTINCT BTRIM(r.%1$I)
     FROM public.records r
     WHERE r.%1$I IS NOT NULL
       AND BTRIM(r.%1$I) <> ''''
     ON CONFLICT (name) DO NOTHING;',
    name_col
  );
END;
$$;

ALTER TABLE public.records
ADD COLUMN IF NOT EXISTS magazine_id BIGINT;

DO $$
DECLARE
  name_col text;
BEGIN
  SELECT CASE
           WHEN EXISTS (
             SELECT 1
             FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name = 'records'
               AND column_name = 'name'
           ) THEN 'name'
           WHEN EXISTS (
             SELECT 1
             FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name = 'records'
               AND column_name = 'name_legacy'
           ) THEN 'name_legacy'
           ELSE NULL
         END
  INTO name_col;

  IF name_col IS NULL THEN
    RAISE NOTICE 'No name/name_legacy column found. Skipping records.magazine_id backfill.';
    RETURN;
  END IF;

  EXECUTE format(
    'UPDATE public.records r
     SET magazine_id = m.id
     FROM public.magazines m
     WHERE m.name = BTRIM(r.%1$I)
       AND (r.magazine_id IS DISTINCT FROM m.id);',
    name_col
  );
END;
$$;

DO $$
DECLARE
  missing_count bigint;
  name_col text;
BEGIN
  SELECT CASE
           WHEN EXISTS (
             SELECT 1
             FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name = 'records'
               AND column_name = 'name'
           ) THEN 'name'
           WHEN EXISTS (
             SELECT 1
             FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name = 'records'
               AND column_name = 'name_legacy'
           ) THEN 'name_legacy'
           ELSE NULL
         END
  INTO name_col;

  IF name_col IS NULL THEN
    SELECT COUNT(*) INTO missing_count
    FROM public.records
    WHERE magazine_id IS NULL;
  ELSE
    EXECUTE format(
      'SELECT COUNT(*)
       FROM public.records
       WHERE magazine_id IS NULL
         AND %1$I IS NOT NULL
         AND BTRIM(%1$I) <> '''';',
      name_col
    )
    INTO missing_count;
  END IF;

  IF missing_count > 0 THEN
    RAISE EXCEPTION 'Magazine mapping failed for % records.', missing_count;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'records_magazine_id_fkey'
      AND conrelid = 'public.records'::regclass
  ) THEN
    ALTER TABLE public.records
    ADD CONSTRAINT records_magazine_id_fkey
    FOREIGN KEY (magazine_id)
    REFERENCES public.magazines(id);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_records_magazine_id ON public.records(magazine_id);
