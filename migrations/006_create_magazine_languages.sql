-- Step 5: create magazine_languages and aggregate from records + record_languages.

CREATE TABLE IF NOT EXISTS public.magazine_languages (
  magazine_id BIGINT NOT NULL REFERENCES public.magazines(id) ON DELETE CASCADE,
  language_id BIGINT NOT NULL REFERENCES public.languages(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (magazine_id, language_id)
);

INSERT INTO public.magazine_languages (magazine_id, language_id)
SELECT DISTINCT r.magazine_id, rl.language_id
FROM public.records r
JOIN public.record_languages rl
  ON rl.record_id = r.id
WHERE r.magazine_id IS NOT NULL
ON CONFLICT (magazine_id, language_id) DO NOTHING;
