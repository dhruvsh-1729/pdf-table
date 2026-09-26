-- Step 30: Hindi translations of article summaries and conclusions.
--
-- summary_hi / conclusion_hi are machine translations (Sarvam
-- sarvam-translate:v1) of the English summary and conclusion, made by
-- scripts/translate-summaries-hi.mjs for Hindi-language articles whose
-- summary has been checked (check_status human_verified / ai_audited).
-- summary_hi_hash is md5(summary || '|' || conclusion) at translation time:
-- if the English text changes later, the hash no longer matches and the site
-- hides the stale translation until the script re-translates it.
-- Safe to re-run.

ALTER TABLE public.records
  ADD COLUMN IF NOT EXISTS summary_hi text,
  ADD COLUMN IF NOT EXISTS conclusion_hi text,
  ADD COLUMN IF NOT EXISTS summary_hi_source text,
  ADD COLUMN IF NOT EXISTS summary_hi_hash text,
  ADD COLUMN IF NOT EXISTS summary_hi_at timestamptz;

-- True when the stored Hindi translation still matches the English text.
CREATE OR REPLACE FUNCTION public.summary_hi_is_current(r public.records)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT r.summary_hi IS NOT NULL
     AND r.summary_hi_hash = md5(coalesce(r.summary, '') || '|' || coalesce(r.conclusion, ''));
$$;
