-- Step 16: merge OCR-misspelt variants of the same author (second pass).
--
-- Pairs one edit apart or sharing a key after the improved normalisation
-- (डॉ०/पं० with a Devanagari zero, जेन/जैन, साध्वीं), each reviewed by hand on
-- 2026-09-26. Excluded as genuinely different people: धर्मचंद्र जैन / धर्मेन्द्र
-- जैन, एल. सी. जैन / एच. सी. जैन, विनय / विजय नाहटा.

BEGIN;

CREATE TEMP TABLE author_variant_merge (dup_id BIGINT PRIMARY KEY, keep_id BIGINT NOT NULL) ON COMMIT DROP;
INSERT INTO author_variant_merge (dup_id, keep_id) VALUES
  (4329, 4535),
  (4194, 4229),
  (4338, 4337),
  (4423, 4337),
  (4541, 4612),
  (4366, 4612),
  (4545, 4608),
  (4474, 4608),
  (4509, 4608),
  (4345, 4608),
  (4460, 4608),
  (4410, 4608),
  (4351, 4367),
  (4402, 4367),
  (4664, 4677),
  (4817, 4810),
  (4893, 4810),
  (5056, 4783),
  (4961, 4783),
  (4911, 4903),
  (5190, 4924),
  (4740, 4863),
  (4992, 4863),
  (4943, 4863),
  (4880, 4863),
  (5026, 4863),
  (4925, 4863),
  (5132, 4768),
  (4891, 4768),
  (4717, 4768),
  (4221, 4522),
  (4365, 4413),
  (4428, 4413),
  (4450, 4413),
  (4819, 4739),
  (4808, 4739),
  (4951, 5471),
  (4748, 5471),
  (5017, 4771),
  (4798, 4771),
  (4705, 4771),
  (5108, 4686),
  (4738, 4686),
  (4406, 4372),
  (4386, 4372),
  (4421, 4372),
  (4459, 4372),
  (4376, 4449),
  (4414, 4449),
  (4400, 4449),
  (4417, 4385),
  (4457, 4385),
  (4466, 4385),
  (4408, 4405),
  (4409, 4404),
  (4393, 4328),
  (4691, 5460),
  (4709, 4747),
  (4892, 4747),
  (4887, 4838),
  (4889, 4879),
  (4407, 4556),
  (4493, 4556),
  (4411, 4424),
  (5441, 4694),
  (5011, 4787),
  (4874, 4964),
  (4982, 4855),
  (5069, 4855),
  (5297, 5271),
  (5457, 5271),
  (5433, 4643),
  (4849, 4958),
  (5065, 5119),
  (5079, 4695),
  (5076, 5491),
  (5157, 5447),
  (4514, 4437),
  (4957, 4703),
  (4997, 4692),
  (4613, 4605),
  (4614, 4605),
  (4629, 4532),
  (4511, 4498),
  (4518, 4521),
  (4527, 4521),
  (4667, 4670),
  (4672, 4670),
  (4858, 5442),
  (5102, 5442),
  (5198, 5105),
  (5060, 4699),
  (4777, 4699),
  (4370, 4453),
  (4468, 4453),
  (4488, 4453),
  (4660, 4453),
  (4635, 4487),
  (5192, 5194);

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
UPDATE public.authors SET name = 'डॉ. देवेन्द्रकुमार शास्त्री' WHERE id = 4337 AND NOT EXISTS (SELECT 1 FROM public.authors o WHERE o.id <> 4337 AND public.entity_name_key(o.name::text) = public.entity_name_key('डॉ. देवेन्द्रकुमार शास्त्री'));
UPDATE public.authors SET name = 'डॉ. कस्तूरचन्द्र ''सुमन''' WHERE id = 4612 AND NOT EXISTS (SELECT 1 FROM public.authors o WHERE o.id <> 4612 AND public.entity_name_key(o.name::text) = public.entity_name_key('डॉ. कस्तूरचन्द्र ''सुमन'''));
UPDATE public.authors SET name = 'डॉ. आदित्य प्रचण्डिया ''दीप्ति''' WHERE id = 4608 AND NOT EXISTS (SELECT 1 FROM public.authors o WHERE o.id <> 4608 AND public.entity_name_key(o.name::text) = public.entity_name_key('डॉ. आदित्य प्रचण्डिया ''दीप्ति'''));
UPDATE public.authors SET name = 'डॉ. गजानन नरसिंह साठे' WHERE id = 4367 AND NOT EXISTS (SELECT 1 FROM public.authors o WHERE o.id <> 4367 AND public.entity_name_key(o.name::text) = public.entity_name_key('डॉ. गजानन नरसिंह साठे'));
UPDATE public.authors SET name = 'धर्मवीर भारती' WHERE id = 4903 AND NOT EXISTS (SELECT 1 FROM public.authors o WHERE o.id <> 4903 AND public.entity_name_key(o.name::text) = public.entity_name_key('धर्मवीर भारती'));
UPDATE public.authors SET name = 'साध्वी निर्वाणश्री' WHERE id = 4924 AND NOT EXISTS (SELECT 1 FROM public.authors o WHERE o.id <> 4924 AND public.entity_name_key(o.name::text) = public.entity_name_key('साध्वी निर्वाणश्री'));
UPDATE public.authors SET name = 'डॉ. एस. राधाकृष्णन्' WHERE id = 4863 AND NOT EXISTS (SELECT 1 FROM public.authors o WHERE o.id <> 4863 AND public.entity_name_key(o.name::text) = public.entity_name_key('डॉ. एस. राधाकृष्णन्'));
UPDATE public.authors SET name = 'डॉ. सोहनलाल देवोत' WHERE id = 4522 AND NOT EXISTS (SELECT 1 FROM public.authors o WHERE o.id <> 4522 AND public.entity_name_key(o.name::text) = public.entity_name_key('डॉ. सोहनलाल देवोत'));
UPDATE public.authors SET name = 'प्रो. प्रवीणचन्द्र जैन' WHERE id = 4372 AND NOT EXISTS (SELECT 1 FROM public.authors o WHERE o.id <> 4372 AND public.entity_name_key(o.name::text) = public.entity_name_key('प्रो. प्रवीणचन्द्र जैन'));
UPDATE public.authors SET name = 'पं. भंवरलाल पोल्याका' WHERE id = 4385 AND NOT EXISTS (SELECT 1 FROM public.authors o WHERE o.id <> 4385 AND public.entity_name_key(o.name::text) = public.entity_name_key('पं. भंवरलाल पोल्याका'));
UPDATE public.authors SET name = 'डॉ. कैलाशचन्द्र भाटिया' WHERE id = 4328 AND NOT EXISTS (SELECT 1 FROM public.authors o WHERE o.id <> 4328 AND public.entity_name_key(o.name::text) = public.entity_name_key('डॉ. कैलाशचन्द्र भाटिया'));
UPDATE public.authors SET name = 'एम. एन. राय' WHERE id = 4838 AND NOT EXISTS (SELECT 1 FROM public.authors o WHERE o.id <> 4838 AND public.entity_name_key(o.name::text) = public.entity_name_key('एम. एन. राय'));
UPDATE public.authors SET name = 'डॉ. गंगाराम' WHERE id = 4424 AND NOT EXISTS (SELECT 1 FROM public.authors o WHERE o.id <> 4424 AND public.entity_name_key(o.name::text) = public.entity_name_key('डॉ. गंगाराम'));
UPDATE public.authors SET name = 'डॉ. ज्योतिप्रसाद जैन' WHERE id = 4643 AND NOT EXISTS (SELECT 1 FROM public.authors o WHERE o.id <> 4643 AND public.entity_name_key(o.name::text) = public.entity_name_key('डॉ. ज्योतिप्रसाद जैन'));
UPDATE public.authors SET name = 'कन्हैयालाल सेठिया' WHERE id = 5491 AND NOT EXISTS (SELECT 1 FROM public.authors o WHERE o.id <> 5491 AND public.entity_name_key(o.name::text) = public.entity_name_key('कन्हैयालाल सेठिया'));
UPDATE public.authors SET name = 'आचार्य पूज्यपाद' WHERE id = 4498 AND NOT EXISTS (SELECT 1 FROM public.authors o WHERE o.id <> 4498 AND public.entity_name_key(o.name::text) = public.entity_name_key('आचार्य पूज्यपाद'));
UPDATE public.authors SET name = 'डॉ. राजकुमारी जैन' WHERE id = 4487 AND NOT EXISTS (SELECT 1 FROM public.authors o WHERE o.id <> 4487 AND public.entity_name_key(o.name::text) = public.entity_name_key('डॉ. राजकुमारी जैन'));
UPDATE public.authors SET name = 'डॉ. साध्वी कुन्दन रेखा' WHERE id = 5194 AND NOT EXISTS (SELECT 1 FROM public.authors o WHERE o.id <> 5194 AND public.entity_name_key(o.name::text) = public.entity_name_key('डॉ. साध्वी कुन्दन रेखा'));

-- OCR reads the surname जैन as "जेन"; fix it wherever that doesn't collide.
UPDATE public.authors a
SET name = REGEXP_REPLACE(a.name::text, '(^|\s)जेन(\s|$)', '\1जैन\2', 'g')
WHERE a.name::text ~ '(^|\s)जेन(\s|$)'
  AND NOT EXISTS (
    SELECT 1 FROM public.authors o
    WHERE o.id <> a.id
      AND public.entity_name_key(o.name::text) = public.entity_name_key(REGEXP_REPLACE(a.name::text, '(^|\s)जेन(\s|$)', '\1जैन\2', 'g'))
  );

COMMIT;
