-- Step 1: clean wrapped values in records table.

DO $$
DECLARE
  col_name text;
BEGIN
  FOR col_name IN
    SELECT c.column_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'records'
      AND c.data_type = 'text'
  LOOP
    EXECUTE format(
      $sql$
      UPDATE public.records
      SET %1$I = NULLIF(BTRIM(TRIM(BOTH '"' FROM TRIM(BOTH '[]' FROM %1$I))), '')
      WHERE %1$I IS NOT NULL
        AND %1$I LIKE '["%%"]';
      $sql$,
      col_name
    );
  END LOOP;
END;
$$;

DO $$
DECLARE
  name_col text;
  language_col text;
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

  IF name_col IS NOT NULL THEN
    EXECUTE format(
      'UPDATE public.records
       SET %1$I = BTRIM(%1$I)
       WHERE %1$I IS NOT NULL
         AND %1$I <> BTRIM(%1$I);',
      name_col
    );
  END IF;

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

  IF language_col IS NOT NULL THEN
    EXECUTE format(
      'UPDATE public.records
       SET %1$I = NULLIF(BTRIM(%1$I), '''')
       WHERE %1$I IS NOT NULL;',
      language_col
    );
  END IF;
END;
$$;
