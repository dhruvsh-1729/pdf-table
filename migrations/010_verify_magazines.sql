-- Step 10: verification for magazine extension tables and mappings.

SELECT COUNT(*) AS magazines_total FROM public.magazines;
SELECT COUNT(*) AS active_magazines FROM public.magazines WHERE is_active = true;
SELECT COUNT(*) AS magazines_with_website FROM public.magazines WHERE website_url IS NOT NULL;
SELECT COUNT(*) AS magazines_with_logo FROM public.magazines WHERE logo_image_url IS NOT NULL;
SELECT COUNT(*) AS magazines_with_cover FROM public.magazines WHERE cover_image_url IS NOT NULL;
SELECT COUNT(*) AS magazine_authors_total FROM public.magazine_authors;

SELECT COUNT(*) AS orphan_magazine_author_magazine
FROM public.magazine_authors ma
LEFT JOIN public.magazines m ON m.id = ma.magazine_id
WHERE m.id IS NULL;

SELECT COUNT(*) AS orphan_magazine_author_author
FROM public.magazine_authors ma
LEFT JOIN public.authors a ON a.id = ma.author_id
WHERE a.id IS NULL;

SELECT COUNT(*) AS orphan_record_magazine
FROM public.records r
LEFT JOIN public.magazines m ON m.id = r.magazine_id
WHERE r.magazine_id IS NOT NULL
  AND m.id IS NULL;

DO $$
DECLARE
  orphan_mm bigint;
  orphan_ma bigint;
  orphan_rm bigint;
BEGIN
  SELECT COUNT(*) INTO orphan_mm
  FROM public.magazine_authors ma
  LEFT JOIN public.magazines m ON m.id = ma.magazine_id
  WHERE m.id IS NULL;

  SELECT COUNT(*) INTO orphan_ma
  FROM public.magazine_authors ma
  LEFT JOIN public.authors a ON a.id = ma.author_id
  WHERE a.id IS NULL;

  SELECT COUNT(*) INTO orphan_rm
  FROM public.records r
  LEFT JOIN public.magazines m ON m.id = r.magazine_id
  WHERE r.magazine_id IS NOT NULL
    AND m.id IS NULL;

  IF orphan_mm > 0 OR orphan_ma > 0 OR orphan_rm > 0 THEN
    RAISE EXCEPTION 'Magazine extension verification failed. orphan_mm=%, orphan_ma=%, orphan_rm=%',
      orphan_mm,
      orphan_ma,
      orphan_rm;
  END IF;

  RAISE NOTICE 'Magazine extension summary: magazines=%, magazine_authors=%',
    (SELECT COUNT(*) FROM public.magazines),
    (SELECT COUNT(*) FROM public.magazine_authors);
END;
$$;
