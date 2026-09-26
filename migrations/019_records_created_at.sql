-- 019: track when records are created. Existing rows stay NULL ("before 2026-09-26").
-- Add the column without a default first so existing rows are not stamped with now().
ALTER TABLE public.records ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE public.records ALTER COLUMN created_at SET DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_records_created_at ON public.records (created_at);
