-- 035: one shape for records.page_numbers ("112-118", "48", "i-iv"), so citations and Scholar meta are clean.
-- Before: 250 spaced/zero-padded ranges ("498 - 502", "09-13"), 6 "pg" prefixes, 3 Excel-mangled ranges
-- ("01-Nov" was 1-11), 2 typo'd reversed ranges, 5 placeholders ("-", "-NA-").
-- Old values are kept in records_page_numbers_backup_035 (revert: UPDATE ... FROM that table).

CREATE OR REPLACE FUNCTION public.normalize_page_numbers(p text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v text := btrim(coalesce(p, ''));
BEGIN
  -- Placeholders carry no page information.
  IF v = '' OR v !~ '[0-9ivxlcIVXLC]' OR v ~* '^-?\s*n/?a\s*-?$' OR v ~* 'unnumbered' THEN
    RETURN NULL;
  END IF;
  v := regexp_replace(v, '(?i)\mp[pg]?\.?\s*(?=[0-9])', '', 'g');      -- "pg 5-pg43", "pp. 5-9"
  v := regexp_replace(v, '\s*[–—-]\s*', '-', 'g');                     -- "498 - 502", en/em dashes
  v := regexp_replace(v, '(^|[^0-9])0+([1-9])', '\1\2', 'g');          -- "09-13", "04-05"
  v := regexp_replace(v, '\s*([,.;])\s*', ', ', 'g');                  -- "18-53. 1-24" -> "18-53, 1-24"
  v := regexp_replace(v, '\s+', ' ', 'g');
  RETURN nullif(btrim(v, ' ,-'), '');
END $$;

CREATE TABLE IF NOT EXISTS public.records_page_numbers_backup_035 (id bigint PRIMARY KEY, page_numbers text);

-- Hand fixes, decided from the neighbouring articles of the same issue.
INSERT INTO public.records_page_numbers_backup_035 (id, page_numbers)
  SELECT id, page_numbers FROM public.records WHERE id IN (1176, 1177, 4276, 4104, 4465, 4466)
  ON CONFLICT (id) DO NOTHING;
UPDATE public.records SET page_numbers = '1-11'    WHERE id = 1176 AND page_numbers = '01-Nov';  -- next: 12-48
UPDATE public.records SET page_numbers = '12-48'   WHERE id = 1177 AND page_numbers = 'Dec-48';  -- next: 49-55
UPDATE public.records SET page_numbers = '1-12'    WHERE id = 4276 AND page_numbers = '12-Jan';  -- next: 13-24
UPDATE public.records SET page_numbers = '782-794' WHERE id = 4104 AND page_numbers = '782-764'; -- next: 795-800
UPDATE public.records SET page_numbers = '870-883' WHERE id = 4465 AND page_numbers = '870-833'; -- next: 884-887
UPDATE public.records SET page_numbers = '884-887' WHERE id = 4466 AND page_numbers = '834-887'; -- prev: 870-883

INSERT INTO public.records_page_numbers_backup_035 (id, page_numbers)
  SELECT id, page_numbers FROM public.records
  WHERE page_numbers IS DISTINCT FROM public.normalize_page_numbers(page_numbers)
  ON CONFLICT (id) DO NOTHING;
UPDATE public.records SET page_numbers = public.normalize_page_numbers(page_numbers)
  WHERE page_numbers IS DISTINCT FROM public.normalize_page_numbers(page_numbers);

-- Keep it that way for every future write (portal edits, /add, the ingest pipeline).
CREATE OR REPLACE FUNCTION public.trg_normalize_page_numbers() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.page_numbers := public.normalize_page_numbers(NEW.page_numbers);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS records_normalize_page_numbers ON public.records;
CREATE TRIGGER records_normalize_page_numbers BEFORE INSERT OR UPDATE OF page_numbers ON public.records
  FOR EACH ROW EXECUTE FUNCTION public.trg_normalize_page_numbers();
