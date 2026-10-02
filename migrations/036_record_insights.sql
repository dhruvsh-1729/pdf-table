-- 036: per-article "insights" drawn from the article's own text by ops/extract-insights.mjs:
--   * key quotes (verbatim — every quote is checked to be a substring of extracted_text before it is stored),
--   * works the article cites (footnotes / bibliography lines found in the text),
--   * people, places, works and groups it discusses (each name checked to occur in the text),
-- so readers can quote an article directly and browse the archive by who/what/where it discusses.

CREATE TABLE IF NOT EXISTS public.record_insights (
  record_id      bigint PRIMARY KEY REFERENCES public.records(id) ON DELETE CASCADE,
  status         text NOT NULL CHECK (status IN ('ok', 'no_text', 'failed')),
  quotes         jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{ "text": "..." }]
  cited_works    jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{ "text": "..." }] as printed in the article
  model          text,
  prompt_version text,
  dropped        jsonb,                                -- model output that failed verification (for audit)
  generated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.entities (
  id          bigserial PRIMARY KEY,
  kind        text NOT NULL CHECK (kind IN ('person', 'place', 'work', 'group')),
  name        text NOT NULL,
  name_key    text NOT NULL,   -- lower-case, diacritics and punctuation stripped; Devanagari kept
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, name_key)
);

CREATE TABLE IF NOT EXISTS public.record_entities (
  record_id bigint NOT NULL REFERENCES public.records(id) ON DELETE CASCADE,
  entity_id bigint NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  mentions  int NOT NULL DEFAULT 1,
  PRIMARY KEY (record_id, entity_id)
);
CREATE INDEX IF NOT EXISTS record_entities_entity_idx ON public.record_entities (entity_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['record_insights', 'entities', 'record_entities'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS public_read ON public.%I', t);
    EXECUTE format('CREATE POLICY public_read ON public.%I FOR SELECT TO anon, authenticated USING (true)', t);
  END LOOP;
END $$;

-- Entity pages list entities discussed by enough articles; this view gives the counts in one query.
CREATE OR REPLACE VIEW public.entity_stats WITH (security_invoker = on) AS
  SELECT e.id, e.kind, e.name, e.description, count(re.record_id)::int AS record_count
  FROM public.entities e JOIN public.record_entities re ON re.entity_id = e.id
  GROUP BY e.id;
