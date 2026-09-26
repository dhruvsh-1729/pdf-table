-- Step 12: normalize languages.
--
-- Problems this fixes (found in the live data, Sept 2026):
--   * Auto-detection (franc) stored raw ISO 639-3 codes as language names:
--     "Hin" (1,941 records), "Mag", "Bho", "Npi". franc also misread noisy OCR
--     text as "Afrikaans", "Waray" and "Lingala".
--   * records.language_legacy held free-form strings ("English, Sanskrit",
--     "Hindi. Gujarati", "hin", "mag", ...). The public site grouped on that
--     column, so every combination showed up as its own language option.
--   * magazine_languages was only filled once (migration 006) and never kept
--     up to date, so newer magazines (Jain Bharati, Jain Vidya, Jnana Desana)
--     had no languages at all.
--
-- After this migration:
--   * languages holds one canonical row per real language, with a BCP 47 code.
--   * record_languages is the single source of truth for a record's languages.
--   * records.language_legacy and magazine_languages are derived from
--     record_languages by triggers, so every write path stays consistent.
--
-- Safe to re-run.

BEGIN;

-- 1. Canonical metadata on languages ---------------------------------------

ALTER TABLE public.languages ADD COLUMN IF NOT EXISTS code TEXT;

-- 2. Re-point misdetected / code-named languages at the right language ------
--
-- Each mapping was checked against the records' magazine and extracted text:
--   Hin, Mag, Bho -> Hindi     (all in Jain Bharati / Jain Vidya, Hindi journals;
--                               Mag/Bho were Hindi OCR text with Gujarati noise)
--   Npi -> Sanskrit            (2 Jain Vidya records; both are Sanskrit verse)
--   Afrikaans, Waray, Lingala -> English
--                              (1 record each in Jain Avenue / The Maha Bodhi,
--                               English articles with noisy OCR)

CREATE TEMP TABLE tmp_language_remap (from_name TEXT PRIMARY KEY, to_name TEXT NOT NULL) ON COMMIT DROP;
INSERT INTO tmp_language_remap (from_name, to_name) VALUES
  ('Hin', 'Hindi'),
  ('Mag', 'Hindi'),
  ('Bho', 'Hindi'),
  ('Npi', 'Sanskrit'),
  ('Afrikaans', 'English'),
  ('Waray', 'English'),
  ('Lingala', 'English');

INSERT INTO public.languages (name)
SELECT DISTINCT m.to_name
FROM tmp_language_remap m
WHERE NOT EXISTS (SELECT 1 FROM public.languages l WHERE l.name = m.to_name);

INSERT INTO public.record_languages (record_id, language_id)
SELECT rl.record_id, dst.id
FROM public.record_languages rl
JOIN public.languages src ON src.id = rl.language_id
JOIN tmp_language_remap m ON m.from_name = src.name
JOIN public.languages dst ON dst.name = m.to_name
ON CONFLICT (record_id, language_id) DO NOTHING;

DELETE FROM public.record_languages rl
USING public.languages src, tmp_language_remap m
WHERE src.id = rl.language_id AND m.from_name = src.name;

DELETE FROM public.magazine_languages ml
USING public.languages src, tmp_language_remap m
WHERE src.id = ml.language_id AND m.from_name = src.name;

DELETE FROM public.languages l
USING tmp_language_remap m
WHERE l.name = m.from_name;

-- 3. Merge any case/whitespace duplicates into one canonical row -----------

WITH ranked AS (
  SELECT id, name,
         FIRST_VALUE(id) OVER (PARTITION BY LOWER(BTRIM(name)) ORDER BY id) AS keep_id
  FROM public.languages
),
dupes AS (SELECT id, keep_id FROM ranked WHERE id <> keep_id),
moved AS (
  INSERT INTO public.record_languages (record_id, language_id)
  SELECT rl.record_id, d.keep_id
  FROM public.record_languages rl JOIN dupes d ON d.id = rl.language_id
  ON CONFLICT (record_id, language_id) DO NOTHING
  RETURNING 1
)
DELETE FROM public.languages l USING dupes d WHERE l.id = d.id;

UPDATE public.languages SET name = BTRIM(name) WHERE name <> BTRIM(name);

CREATE UNIQUE INDEX IF NOT EXISTS languages_name_lower_key ON public.languages (LOWER(name));

-- 4. BCP 47 codes (used by the site for schema.org inLanguage) -------------

UPDATE public.languages l
SET code = c.code
FROM (VALUES
  ('English', 'en'), ('Hindi', 'hi'), ('Sanskrit', 'sa'), ('Prakrit', 'pra'),
  ('Pali', 'pi'), ('Gujarati', 'gu'), ('Apabhramsa', 'inc'), ('Bengali', 'bn'),
  ('Kannada', 'kn'), ('Telugu', 'te'), ('Tamil', 'ta'), ('Malayalam', 'ml'),
  ('Marathi', 'mr'), ('Punjabi', 'pa'), ('Odia', 'or'), ('Assamese', 'as'),
  ('Urdu', 'ur'), ('Persian', 'fa'), ('Arabic', 'ar'), ('Chinese', 'zh'),
  ('Tibetan', 'bo'), ('Japanese', 'ja'), ('French', 'fr'), ('German', 'de'),
  ('Italian', 'it'), ('Spanish', 'es'), ('Portuguese', 'pt'), ('Nepali', 'ne'),
  ('Sindhi', 'sd'), ('Kashmiri', 'ks'), ('Konkani', 'kok'), ('Maithili', 'mai'),
  ('Magahi', 'mag'), ('Bhojpuri', 'bho'), ('Rajasthani', 'raj'), ('Sinhala', 'si'),
  ('Burmese', 'my'), ('Thai', 'th'), ('Greek', 'el'), ('Latin', 'la')
) AS c(name, code)
WHERE l.name = c.name AND l.code IS DISTINCT FROM c.code;

-- Apabhramsa has no ISO 639 code of its own; 'inc' (Indo-Aryan) is the
-- closest valid collective tag, but it's too vague to advertise. Leave it null.
UPDATE public.languages SET code = NULL WHERE name = 'Apabhramsa';

-- 5. Records with no language at all -----------------------------------------
-- Only one record (8565, Jain Bharati) — its text is Hindi.

INSERT INTO public.record_languages (record_id, language_id)
SELECT r.id, l.id
FROM public.records r
JOIN public.magazines m ON m.id = r.magazine_id
JOIN public.languages l ON l.name = 'Hindi'
WHERE m.name = 'Jain Bharati'
  AND NOT EXISTS (SELECT 1 FROM public.record_languages rl WHERE rl.record_id = r.id)
ON CONFLICT (record_id, language_id) DO NOTHING;

-- 6. Derived data: records.language_legacy + magazine_languages -------------

-- Canonical display string for a set of records, e.g. "English, Sanskrit".
CREATE OR REPLACE FUNCTION public.refresh_record_language_legacy(record_ids BIGINT[])
RETURNS void
LANGUAGE sql
AS $$
  UPDATE public.records r
  SET language_legacy = sub.names
  FROM (
    SELECT ids.id,
           (SELECT STRING_AGG(l.name, ', ' ORDER BY l.name)
            FROM public.record_languages rl
            JOIN public.languages l ON l.id = rl.language_id
            WHERE rl.record_id = ids.id) AS names
    FROM UNNEST(record_ids) AS ids(id)
  ) sub
  WHERE r.id = sub.id
    AND r.language_legacy IS DISTINCT FROM sub.names;
$$;

-- magazine_languages = distinct languages of the magazine's records.
CREATE OR REPLACE FUNCTION public.refresh_magazine_languages(magazine_ids BIGINT[])
RETURNS void
LANGUAGE sql
AS $$
  DELETE FROM public.magazine_languages ml
  WHERE ml.magazine_id = ANY(magazine_ids)
    AND NOT EXISTS (
      SELECT 1
      FROM public.records r
      JOIN public.record_languages rl ON rl.record_id = r.id
      WHERE r.magazine_id = ml.magazine_id AND rl.language_id = ml.language_id
    );

  INSERT INTO public.magazine_languages (magazine_id, language_id)
  SELECT DISTINCT r.magazine_id, rl.language_id
  FROM public.records r
  JOIN public.record_languages rl ON rl.record_id = r.id
  WHERE r.magazine_id = ANY(magazine_ids)
  ON CONFLICT (magazine_id, language_id) DO NOTHING;
$$;

CREATE OR REPLACE FUNCTION public.trg_record_languages_rollup()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  ids BIGINT[];
BEGIN
  SELECT ARRAY_AGG(DISTINCT record_id) INTO ids FROM changed_rows;
  IF ids IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM public.refresh_record_language_legacy(ids);
  PERFORM public.refresh_magazine_languages(
    ARRAY(SELECT DISTINCT r.magazine_id FROM public.records r WHERE r.id = ANY(ids))
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS record_languages_rollup_ins ON public.record_languages;
CREATE TRIGGER record_languages_rollup_ins
  AFTER INSERT ON public.record_languages
  REFERENCING NEW TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_record_languages_rollup();

DROP TRIGGER IF EXISTS record_languages_rollup_del ON public.record_languages;
CREATE TRIGGER record_languages_rollup_del
  AFTER DELETE ON public.record_languages
  REFERENCING OLD TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_record_languages_rollup();

DROP TRIGGER IF EXISTS record_languages_rollup_upd ON public.record_languages;
CREATE TRIGGER record_languages_rollup_upd
  AFTER UPDATE ON public.record_languages
  REFERENCING NEW TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_record_languages_rollup();

-- Moving a record to another magazine, or deleting it, changes the languages
-- of both the old and the new magazine.
CREATE OR REPLACE FUNCTION public.trg_records_magazine_languages()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  mags BIGINT[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT ARRAY_AGG(DISTINCT magazine_id) INTO mags FROM old_rows;
  ELSE
    -- Transition tables can't be combined with UPDATE OF <column>, so filter
    -- to rows whose magazine actually changed (most updates are text edits).
    SELECT ARRAY_AGG(DISTINCT m) INTO mags
    FROM (
      SELECT o.magazine_id AS m FROM old_rows o JOIN new_rows n ON n.id = o.id
      WHERE o.magazine_id IS DISTINCT FROM n.magazine_id
      UNION
      SELECT n.magazine_id FROM old_rows o JOIN new_rows n ON n.id = o.id
      WHERE o.magazine_id IS DISTINCT FROM n.magazine_id
    ) x;
  END IF;

  IF mags IS NOT NULL THEN
    PERFORM public.refresh_magazine_languages(mags);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS records_magazine_languages_upd ON public.records;
CREATE TRIGGER records_magazine_languages_upd
  AFTER UPDATE ON public.records
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_records_magazine_languages();

DROP TRIGGER IF EXISTS records_magazine_languages_del ON public.records;
CREATE TRIGGER records_magazine_languages_del
  AFTER DELETE ON public.records
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_records_magazine_languages();

-- Renaming a language (language master page) must update every record's
-- display string that includes it.
CREATE OR REPLACE FUNCTION public.trg_languages_rename()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    PERFORM public.refresh_record_language_legacy(
      ARRAY(SELECT rl.record_id FROM public.record_languages rl WHERE rl.language_id = NEW.id)
    );
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS languages_rename ON public.languages;
CREATE TRIGGER languages_rename
  AFTER UPDATE OF name ON public.languages
  FOR EACH ROW EXECUTE FUNCTION public.trg_languages_rename();

-- 7. Rebuild all derived data once ------------------------------------------

SELECT public.refresh_record_language_legacy(ARRAY(SELECT id FROM public.records));
SELECT public.refresh_magazine_languages(ARRAY(SELECT id FROM public.magazines));

COMMIT;
