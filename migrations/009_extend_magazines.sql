-- Step 9: extend magazine master metadata and create magazine_authors mapping.

ALTER TABLE public.magazines
ADD COLUMN IF NOT EXISTS short_name TEXT,
ADD COLUMN IF NOT EXISTS slug TEXT,
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS cover_image_url TEXT,
ADD COLUMN IF NOT EXISTS cover_image_public_id TEXT,
ADD COLUMN IF NOT EXISTS logo_image_url TEXT,
ADD COLUMN IF NOT EXISTS logo_image_public_id TEXT,
ADD COLUMN IF NOT EXISTS website_url TEXT,
ADD COLUMN IF NOT EXISTS contact_email TEXT,
ADD COLUMN IF NOT EXISTS headquarters TEXT,
ADD COLUMN IF NOT EXISTS founded_year INTEGER,
ADD COLUMN IF NOT EXISTS issn_print TEXT,
ADD COLUMN IF NOT EXISTS issn_online TEXT,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'magazines_founded_year_check'
      AND conrelid = 'public.magazines'::regclass
  ) THEN
    ALTER TABLE public.magazines
    ADD CONSTRAINT magazines_founded_year_check
    CHECK (founded_year IS NULL OR founded_year BETWEEN 1500 AND EXTRACT(YEAR FROM now())::int + 1);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'magazines_website_url_check'
      AND conrelid = 'public.magazines'::regclass
  ) THEN
    ALTER TABLE public.magazines
    ADD CONSTRAINT magazines_website_url_check
    CHECK (website_url IS NULL OR website_url ~* '^https?://');
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'magazines_contact_email_check'
      AND conrelid = 'public.magazines'::regclass
  ) THEN
    ALTER TABLE public.magazines
    ADD CONSTRAINT magazines_contact_email_check
    CHECK (contact_email IS NULL OR contact_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_magazines_set_updated_at'
      AND tgrelid = 'public.magazines'::regclass
  ) THEN
    CREATE TRIGGER trg_magazines_set_updated_at
    BEFORE UPDATE ON public.magazines
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;
$$;

WITH base AS (
  SELECT
    m.id,
    NULLIF(REGEXP_REPLACE(LOWER(m.name), '[^a-z0-9]+', '-', 'g'), '') AS base_slug
  FROM public.magazines m
),
normalized AS (
  SELECT
    b.id,
    COALESCE(TRIM(BOTH '-' FROM b.base_slug), CONCAT('magazine-', b.id::text)) AS slug_seed
  FROM base b
),
ranked AS (
  SELECT
    n.id,
    n.slug_seed,
    ROW_NUMBER() OVER (PARTITION BY n.slug_seed ORDER BY n.id) AS rn,
    COUNT(*) OVER (PARTITION BY n.slug_seed) AS cnt
  FROM normalized n
)
UPDATE public.magazines m
SET slug = CASE WHEN r.cnt = 1 THEN r.slug_seed ELSE CONCAT(r.slug_seed, '-', m.id::text) END
FROM ranked r
WHERE r.id = m.id
  AND (m.slug IS NULL OR BTRIM(m.slug) = '');

CREATE UNIQUE INDEX IF NOT EXISTS idx_magazines_slug_unique
ON public.magazines(slug)
WHERE slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_magazines_is_active ON public.magazines(is_active);

CREATE TABLE IF NOT EXISTS public.magazine_authors (
  magazine_id BIGINT NOT NULL REFERENCES public.magazines(id) ON DELETE CASCADE,
  author_id BIGINT NOT NULL REFERENCES public.authors(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (magazine_id, author_id)
);

CREATE INDEX IF NOT EXISTS idx_magazine_authors_magazine_id ON public.magazine_authors(magazine_id);
CREATE INDEX IF NOT EXISTS idx_magazine_authors_author_id ON public.magazine_authors(author_id);

INSERT INTO public.magazine_authors (magazine_id, author_id)
SELECT DISTINCT r.magazine_id, ra.author_id
FROM public.records r
JOIN public.record_authors ra
  ON ra.record_id = r.id
WHERE r.magazine_id IS NOT NULL
ON CONFLICT (magazine_id, author_id) DO NOTHING;
