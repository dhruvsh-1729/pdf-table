-- 018: lock the shared Supabase project's catalog tables to read-only for the
-- public (anon/authenticated) keys, hide inactive magazines from the public
-- site, and add the tables used by the autonomous ops jobs.
--
-- Context: aryanculture.org reads with the anon key (it is in the browser
-- bundle). Before this migration anon could INSERT/UPDATE/DELETE/TRUNCATE every
-- catalog table. The data portal (pdf_proj) writes with the service role, which
-- bypasses RLS, so it is unaffected.

BEGIN;

-- 1. Read-only public access ---------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'authors','languages','magazine_authors','magazine_languages','magazine_subjects',
    'subject_areas','subjects','subsubjects','tag_subsubjects','tags',
    'magazines','records',
    'record_authors','record_languages','record_subjects','record_subsubjects','record_tags',
    'summaries','conclusions'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon, authenticated', t);
    EXECUTE format('DROP POLICY IF EXISTS public_read ON public.%I', t);
  END LOOP;
END $$;

-- Plain lookup tables: everything is public.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'authors','languages','magazine_authors','magazine_languages','magazine_subjects',
    'subject_areas','subjects','subsubjects','tag_subsubjects','tags'
  ] LOOP
    EXECUTE format('CREATE POLICY public_read ON public.%I FOR SELECT TO anon, authenticated USING (true)', t);
  END LOOP;
END $$;

-- 2. Hide inactive magazines and everything hanging off them ------------------
CREATE POLICY public_read ON public.magazines
  FOR SELECT TO anon, authenticated USING (is_active);

CREATE POLICY public_read ON public.records
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.magazines m WHERE m.id = records.magazine_id AND m.is_active));

-- Per-record child rows follow their record's visibility (the subquery is itself
-- subject to the records policy above).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'record_authors','record_languages','record_subjects','record_subsubjects','record_tags',
    'summaries','conclusions'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY public_read ON public.%I FOR SELECT TO anon, authenticated
         USING (EXISTS (SELECT 1 FROM public.records r WHERE r.id = %I.record_id))', t, t);
  END LOOP;
END $$;

-- Vedanta Kesari: rights unclear ("© Ramakrishna Math & Mission Publications. All
-- Rights Reserved.") and 321/550 records have no real source text. Hidden from
-- the public site until the owner decides; rows are kept (and backed up).
UPDATE public.magazines SET is_active = false WHERE name IN ('Vedanta Kesari', 'test');

-- 3. Ops tables (service role only) --------------------------------------------
CREATE TABLE IF NOT EXISTS public.ops_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.ops_settings (key, value) VALUES
  ('paused', 'false'),
  ('report_email', '"dhruvshdarshansh@gmail.com"'),
  ('health_urls', '["https://aryanculture.org/", "https://data.aryanculture.org/login", "https://aryanculture.org/sitemap.xml"]'),
  ('backup_retention', '{"daily": 14, "weekly": 8}'),
  ('daily_caps', '{"ai_calls": 0, "ocr_pages": 0}')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.ops_runs (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job         TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed', 'skipped')),
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  actor       TEXT NOT NULL DEFAULT 'cron',
  summary     TEXT,
  details     JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_ops_runs_job_started ON public.ops_runs (job, started_at DESC);

CREATE TABLE IF NOT EXISTS public.jobs (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type       TEXT NOT NULL,
  payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key TEXT UNIQUE,
  status     TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed', 'cancelled')),
  priority   INTEGER NOT NULL DEFAULT 100,
  attempts   INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  run_after  TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_by  TEXT,
  locked_at  TIMESTAMPTZ,
  last_error TEXT,
  result     JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jobs_ready ON public.jobs (status, priority, run_after);

CREATE TABLE IF NOT EXISTS public.sources (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  magazine_id   BIGINT REFERENCES public.magazines(id),
  adapter       TEXT NOT NULL,
  base_url      TEXT,
  rights_status TEXT NOT NULL DEFAULT 'unknown'
                CHECK (rights_status IN ('public_domain', 'permission_granted', 'link_only', 'unknown')),
  enabled       BOOLEAN NOT NULL DEFAULT false,
  config        JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_run_at   TIMESTAMPTZ,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ops_settings','ops_runs','jobs','sources'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;

COMMIT;
