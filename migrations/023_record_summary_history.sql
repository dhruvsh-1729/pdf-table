-- 023: keep every summary/conclusion that automation replaces, so changes are reversible.
CREATE TABLE IF NOT EXISTS public.record_summary_history (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  record_id   BIGINT NOT NULL REFERENCES public.records(id) ON DELETE CASCADE,
  summary     TEXT,
  conclusion  TEXT,
  summary_origin TEXT,
  check_status   TEXT,
  audit_score    REAL,
  audit_notes    TEXT,
  replaced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  replaced_by TEXT NOT NULL,
  reason      TEXT
);
CREATE INDEX IF NOT EXISTS idx_record_summary_history_record ON public.record_summary_history (record_id);
ALTER TABLE public.record_summary_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.record_summary_history FROM anon, authenticated;
