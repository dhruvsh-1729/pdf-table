-- 020: fields for data quality, provenance and filtering.
-- Deterministic backfills only; AI-derived values are filled by ops scripts.

BEGIN;

ALTER TABLE public.records
  ADD COLUMN IF NOT EXISTS publication_year  SMALLINT,
  ADD COLUMN IF NOT EXISTS publication_month SMALLINT,
  ADD COLUMN IF NOT EXISTS record_type       TEXT,
  ADD COLUMN IF NOT EXISTS text_quality      TEXT,
  ADD COLUMN IF NOT EXISTS summary_origin    TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS check_status      TEXT NOT NULL DEFAULT 'unchecked',
  ADD COLUMN IF NOT EXISTS audit_score       REAL,
  ADD COLUMN IF NOT EXISTS audit_notes       TEXT,
  ADD COLUMN IF NOT EXISTS audit_model       TEXT,
  ADD COLUMN IF NOT EXISTS audited_at        TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'records_record_type_check') THEN
    ALTER TABLE public.records ADD CONSTRAINT records_record_type_check CHECK (record_type IN
      ('article','book_review','books_received','editorial','obituary','notice','front_back_matter','poem','other'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'records_text_quality_check') THEN
    ALTER TABLE public.records ADD CONSTRAINT records_text_quality_check CHECK (text_quality IN
      ('good','partial','missing','garbled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'records_summary_origin_check') THEN
    ALTER TABLE public.records ADD CONSTRAINT records_summary_origin_check CHECK (summary_origin IN ('human','ai','unknown'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'records_check_status_check') THEN
    -- human_verified: a person reviewed it (legacy verifier workflow)
    -- ai_audited:     an AI audit found the summary supported by the source text
    -- flagged:        audit found unsupported claims, or no source text to support it; hidden on the site
    -- unchecked:      not yet reviewed
    ALTER TABLE public.records ADD CONSTRAINT records_check_status_check CHECK (check_status IN
      ('human_verified','ai_audited','flagged','unchecked'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_records_publication_year ON public.records (publication_year);
CREATE INDEX IF NOT EXISTS idx_records_check_status ON public.records (check_status);
CREATE INDEX IF NOT EXISTS idx_records_record_type ON public.records (record_type);

-- Publication year/month from the free-text `timestamp` ("October - 1972", "Mar 2019", "January-June 2011").
UPDATE public.records SET
  publication_year = (regexp_match(timestamp, '(1[89][0-9]{2}|20[0-2][0-9])'))[1]::smallint,
  publication_month = CASE lower(substring(timestamp from '^\s*([A-Za-z]{3})'))
    WHEN 'jan' THEN 1 WHEN 'feb' THEN 2 WHEN 'mar' THEN 3 WHEN 'apr' THEN 4 WHEN 'may' THEN 5 WHEN 'jun' THEN 6
    WHEN 'jul' THEN 7 WHEN 'aug' THEN 8 WHEN 'sep' THEN 9 WHEN 'oct' THEN 10 WHEN 'nov' THEN 11 WHEN 'dec' THEN 12 END
WHERE publication_year IS NULL;

-- Text quality: length plus share of letter characters (Devanagari/Gujarati blocks counted explicitly,
-- because their vowel signs are not [:alpha:]).
UPDATE public.records SET text_quality = CASE
  WHEN coalesce(length(btrim(extracted_text)), 0) < 300 THEN 'missing'
  WHEN length(regexp_replace(extracted_text, '[^[:alpha:]ऀ-ॿ઀-૿]', '', 'g'))::real
       / greatest(length(regexp_replace(extracted_text, '\s', '', 'g')), 1) < 0.6 THEN 'garbled'
  WHEN length(extracted_text) < 2000 THEN 'partial'
  ELSE 'good' END;

-- Legacy human verification (the `summaries` table holds verifier-submitted summaries).
UPDATE public.records r SET check_status = 'human_verified', summary_origin = 'human'
WHERE check_status = 'unchecked' AND EXISTS (SELECT 1 FROM public.summaries s WHERE s.record_id = r.id);

-- Record type from the title (conservative patterns; everything else defaults to article).
UPDATE public.records SET record_type = CASE
  WHEN title_name ~* '^\s*(book[- ]?reviews?|reviews?\s*(of|:)|review\s*article)' THEN 'book_review'
  WHEN title_name ~* '^\s*(books?\s+received|publications?\s+received|new\s+publications|our\s+publications|publications\s*$)' THEN 'books_received'
  WHEN title_name ~* '(obituar|in\s+memoriam|homage\s+to|condolence)' THEN 'obituary'
  WHEN title_name ~* '^\s*(editorial|editor''?s\s+(note|desk|page)|from\s+the\s+editor)' THEN 'editorial'
  WHEN title_name ~* '^\s*(notes?\s+and\s+news|news\s+and\s+notes|news|notices?|announcements?|reports?\s+and\s+news)\s*$' THEN 'notice'
  WHEN title_name ~* '^\s*(contents|index|errata|corrigenda|plates?|bibliograph(y|ical\s+notes)|list\s+of\s+contributors)\s*$' THEN 'front_back_matter'
  ELSE 'article' END
WHERE record_type IS NULL;

COMMIT;
