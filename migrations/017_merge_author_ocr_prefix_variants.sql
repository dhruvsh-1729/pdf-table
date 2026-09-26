-- Step 17: merge the last OCR variants, where OCR garbled the "डॉ." prefix itself
-- (डं०, डे., डं°, डी). Reviewed by hand on 2026-09-26.

BEGIN;

CREATE TEMP TABLE author_variant_merge (dup_id BIGINT PRIMARY KEY, keep_id BIGINT NOT NULL) ON COMMIT DROP;
INSERT INTO author_variant_merge (dup_id, keep_id) VALUES
  (4506, 4535),
  (4373, 4405),
  (4446, 4453),
  (4352, 4413),
  (4426, 4413),
  (4384, 4367),
  (5166, 4711),
  (4516, 4626),
  (4332, 4489),
  (4341, 4490);

DELETE FROM author_variant_merge m
WHERE NOT EXISTS (SELECT 1 FROM public.authors a WHERE a.id = m.dup_id)
   OR NOT EXISTS (SELECT 1 FROM public.authors a WHERE a.id = m.keep_id);

UPDATE public.authors keep
SET description = COALESCE(keep.description, src.description),
    cover_url   = COALESCE(keep.cover_url, src.cover_url),
    national    = COALESCE(keep.national, src.national),
    designation = COALESCE(keep.designation, src.designation),
    short_name  = COALESCE(keep.short_name, src.short_name)
FROM (
  SELECT m.keep_id,
         (ARRAY_AGG(a.description ORDER BY a.id) FILTER (WHERE a.description IS NOT NULL))[1] AS description,
         (ARRAY_AGG(a.cover_url   ORDER BY a.id) FILTER (WHERE a.cover_url   IS NOT NULL))[1] AS cover_url,
         (ARRAY_AGG(a.national    ORDER BY a.id) FILTER (WHERE a.national    IS NOT NULL))[1] AS national,
         (ARRAY_AGG(a.designation ORDER BY a.id) FILTER (WHERE a.designation IS NOT NULL))[1] AS designation,
         (ARRAY_AGG(a.short_name  ORDER BY a.id) FILTER (WHERE a.short_name  IS NOT NULL))[1] AS short_name
  FROM author_variant_merge m JOIN public.authors a ON a.id = m.dup_id
  GROUP BY m.keep_id
) src
WHERE keep.id = src.keep_id;

INSERT INTO public.record_authors (record_id, author_id)
SELECT ra.record_id, m.keep_id FROM public.record_authors ra JOIN author_variant_merge m ON m.dup_id = ra.author_id
ON CONFLICT (record_id, author_id) DO NOTHING;
INSERT INTO public.magazine_authors (magazine_id, author_id)
SELECT ma.magazine_id, m.keep_id FROM public.magazine_authors ma JOIN author_variant_merge m ON m.dup_id = ma.author_id
ON CONFLICT (magazine_id, author_id) DO NOTHING;
INSERT INTO public.followed_authors (user_id, author_id, name, created_at)
SELECT fa.user_id, m.keep_id, fa.name, fa.created_at FROM public.followed_authors fa JOIN author_variant_merge m ON m.dup_id = fa.author_id
ON CONFLICT (user_id, author_id) DO NOTHING;
DELETE FROM public.followed_authors fa USING author_variant_merge m WHERE fa.author_id = m.dup_id;
DELETE FROM public.authors a USING author_variant_merge m WHERE a.id = m.dup_id;

-- Corrected display names (skipped if it would collide with another author).
UPDATE public.authors SET name = 'डॉ. गुलाबचन्द जैन' WHERE id = 4626 AND NOT EXISTS (SELECT 1 FROM public.authors o WHERE o.id <> 4626 AND public.entity_name_key(o.name::text) = public.entity_name_key('डॉ. गुलाबचन्द जैन'));
UPDATE public.authors SET name = 'डॉ. प्रेमसागर जैन' WHERE id = 4489 AND NOT EXISTS (SELECT 1 FROM public.authors o WHERE o.id <> 4489 AND public.entity_name_key(o.name::text) = public.entity_name_key('डॉ. प्रेमसागर जैन'));
UPDATE public.authors SET name = 'डॉ. दरबारीलाल कोठिया' WHERE id = 4490 AND NOT EXISTS (SELECT 1 FROM public.authors o WHERE o.id <> 4490 AND public.entity_name_key(o.name::text) = public.entity_name_key('डॉ. दरबारीलाल कोठिया'));

COMMIT;
