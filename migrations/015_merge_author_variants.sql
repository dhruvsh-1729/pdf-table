-- Step 15: merge spelling/title variants of the same author, remove junk authors.
--
-- Generated from the live data on 2026-09-26 and reviewed by hand. Groups are
-- names that are identical once spacing, punctuation, courtesy titles
-- (डॉ./प्रो./पं./श्री/Dr./Prof./Shri/Smt.) and Hindi nasal spelling
-- (कमलचन्द = कमलचंद) are ignored, plus the three Terapanth acharyas listed
-- under different titles (आचार्य / आचार्यश्री / गुरुदेव / युवाचार्य).
-- Survivor = the variant with the most records. Explicit ids keep this auditable.

BEGIN;

CREATE TEMP TABLE author_variant_merge (dup_id BIGINT PRIMARY KEY, keep_id BIGINT NOT NULL, dup_name TEXT, keep_name TEXT) ON COMMIT DROP;
INSERT INTO author_variant_merge (dup_id, keep_id, dup_name, keep_name) VALUES
  (496, 4285, 'Gokul Chandra Jain', 'Prof. Gokul Chandra Jain'),
  (3601, 5316, 'J P Vaswani', 'J. P. Vaswani'),
  (3684, 5316, 'JP Vaswani', 'J. P. Vaswani'),
  (3453, 2622, 'S.S. Sundaram', 'S. S. Sundaram'),
  (4362, 4355, 'पुष्पदन्त', 'पुष्पदंत'),
  (5235, 4681, 'डॉ. अनेकांत कुमार जैन', 'डॉ. अनेकान्तकुमार जैन'),
  (5282, 4681, 'डॉ. अनेकान्त कुमार जैन', 'डॉ. अनेकान्तकुमार जैन'),
  (4682, 4597, 'डॉ. (प्रो.) कुसुम पटोरिया', 'डॉ. (श्रीमती) कुसुम पटोरिया'),
  (5284, 4783, 'मुनि मदन कुमार', 'मुनि मदनकुमार'),
  (5001, 4711, 'डॉ. छगन मोहता', 'छगन मोहता'),
  (5152, 4704, 'सिद्धेश्वरप्रसाद', 'प्रो. सिद्धेश्वर प्रसाद'),
  (3245, 3596, 'M Jayaraman', 'M. Jayaraman'),
  (4374, 4354, 'श्री नेमीचन्द पटोरिया', 'नेमीचंद पटोरिया'),
  (4357, 4471, 'हीरालाल जैन', 'डॉ. हीरालाल जैन'),
  (4940, 4879, 'डॉ. कल्याणमल लोढा', 'प्रो. कल्याणमल लोढ़ा'),
  (4954, 4879, 'कल्याणमल लोढ़ा', 'प्रो. कल्याणमल लोढ़ा'),
  (5275, 5196, 'डॉ हीरालाल छाजेड़ (जैन)', 'डॉ. हीरालाल छाजेड (जैन)'),
  (2656, 3519, 'Shri. Natana Kasinathan', 'Natana Kasinathan'),
  (2667, 2657, 'M. Chandramoorthy', 'Shri. M.Chandramoorthy'),
  (2662, 2651, 'M.B. Vedavalli', 'M. B. Vedavalli'),
  (3246, 2710, 'Swami Mahamedhananda', 'Swami-Mahamedhananda'),
  (4380, 4404, 'छोटेलाल शर्मा', 'डॉ. छोटेलाल शर्मा'),
  (4557, 4461, 'डॉ. राजीव प्रचंडिया', 'श्री राजीव प्रचंडिया'),
  (4623, 4461, 'डॉ. राजीव प्रचण्डिया', 'श्री राजीव प्रचंडिया'),
  (4233, 4532, 'डॉ. राजेन्द्र कुमार बंसल', 'डॉ. राजेन्द्रकुमार बंसल'),
  (4238, 4291, 'S.M. JAIN', 'S. M. Jain'),
  (4967, 4793, 'डॉ. संतोष आचार्य', 'सन्तोष आचार्य'),
  (5010, 4793, 'डॉ संतोष आचार्य', 'सन्तोष आचार्य'),
  (5260, 4324, 'श्री चन्द्रप्रभ', 'चन्द्रप्रभ'),
  (3576, 2948, 'S.Vasanthi', 'S. Vasanthi'),
  (4576, 4564, 'पं कैलाशचन्द्र शास्त्री', 'पं. कैलाशचन्द्र शास्त्री'),
  (4714, 4700, 'प्रो. दयानन्द भार्गव', 'डॉ. दयानंद भार्गव'),
  (3024, 3371, 'P.C. Venkatasubbaiah', 'P. C. Venkatasubbaiah'),
  (5170, 4739, 'नंदकिशोर आचार्य', 'नन्दकिशोर आचार्य'),
  (4851, 4771, 'रमेशचंद्र शाह', 'रमेशचन्द्र शाह'),
  (5172, 4771, 'प्रो. रमेशचंद्र शाह', 'रमेशचन्द्र शाह'),
  (5225, 5175, 'डॉ. हीरालाल', 'हीरालाल'),
  (3985, 3225, 'S RADHAKRISHNAN', 'S. RADHAKRISHNAN'),
  (4588, 4449, 'डॉ. कपूरचंद जैन', 'डॉ. कपूरचन्द जैन'),
  (4665, 4445, 'डॉ. भागचन्द्र “भास्कर ''', 'भागचन्द्र भास्कर'),
  (4668, 4612, 'डॉ. कस्तूरचन्द्र “सुमन', 'डॉ. कस्तूरचन्द्र '' सुमन '''),
  (3060, 3159, 'A. Arputhaselvi', 'A. Arputha Selvi'),
  (3284, 3424, 'K.G. Vasantha Madhava', 'K. G. Vasantha Madhava'),
  (3441, 3424, 'K.G. Vasantha, Madhava', 'K. G. Vasantha Madhava'),
  (4651, 4627, 'प्रभाचन्द्र', 'पण्डित प्रभाचन्द्र'),
  (3310, 2946, 'M.N. RAJESH', 'M. N. Rajesh'),
  (3566, 3385, 'S. Gopalakrishnan', 'S.Gopalakrishnan'),
  (3438, 2238, 'K.A. Nilakanta Sastri', 'K. A. Nilakanta Sastri'),
  (3486, 2974, 'M.Amirthalingam', 'M. Amirthalingam'),
  (3526, 3529, 'Smt. R. Mohana Bai', 'R. Mohana Bai'),
  (4633, 4534, 'पण्डित कुन्दनलाल जैन', 'श्री कुन्दनलाल जैन'),
  (4649, 4605, 'पण्डित आशाधर', 'आशाधर'),
  (4523, 4521, 'पं. बालचन्द्र सिद्धान्तशास्त्री', 'पं. बालचन्द्र सिद्धांतशास्त्री'),
  (4724, 4556, 'महेन्द्र सागर प्रचंडिया', 'डॉ. महेन्द्रसागर प्रचंडिया'),
  (5256, 5105, 'बिनोदकुमार चोरडिया', 'बिनोदकुमार चोरड़िया'),
  (4212, 4713, 'डॉ.अनुपम जैन', 'डॉ. अनुपम जैन'),
  (4818, 4719, 'बच्छराज दूगड़', 'डा. बच्छराज दूगड़'),
  (5237, 5216, 'मुनि उदित कुमार', 'मुनि उदितकुमार'),
  (4812, 4698, 'आचार्य तुलसी', 'आचार्यश्री तुलसी'),
  (5267, 4698, 'गुरुदेव तुलसी', 'आचार्यश्री तुलसी'),
  (5183, 4699, 'आचार्य महाप्रज्ञ', 'आचार्यश्री महाप्रज्ञ'),
  (4867, 4699, 'आचार्य श्री महाप्रज्ञ', 'आचार्यश्री महाप्रज्ञ'),
  (5066, 4699, 'आचार्यश्री महाप्रज्ञजी', 'आचार्यश्री महाप्रज्ञ'),
  (5184, 5112, 'आचार्य महाश्रमण', 'आचार्यश्री महाश्रमण'),
  (4979, 5112, 'युवाचार्य महाश्रमण', 'आचार्यश्री महाश्रमण'),
  (4975, 5112, 'युवाचार्यश्री महाश्रमण', 'आचार्यश्री महाश्रमण'),
  (5127, 5112, 'शचार्यश्री महाश्रमण', 'आचार्यश्री महाश्रमण'),
  (5040, 4792, 'गोविंदचंद्र पांडे', 'डो. गोविन्द चन्द्र पांडे'),
  (4999, 4792, 'गोविंदचंढ़ पांडे', 'डो. गोविन्द चन्द्र पांडे'),
  (4995, 4792, 'डो. गोविंदचंढ़ पांडे', 'डो. गोविन्द चन्द्र पांडे'),
  (4687, 4792, 'डो. गोविन्कचन्द्र पांडे', 'डो. गोविन्द चन्द्र पांडे'),
  (5090, 4792, 'एएगोविन्दचन्द्र पांडे', 'डो. गोविन्द चन्द्र पांडे'),
  (4403, 4427, 'डॉ. गदाधर सिह', 'डॉ. गदाधर सिंह'),
  (4465, 4427, 'गदाधर सिह', 'डॉ. गदाधर सिंह'),
  (4349, 4427, 'डॉ० गदाधर सिह', 'डॉ. गदाधर सिंह'),
  (4476, 4427, 'डॉ० गदाधरसिह', 'डॉ. गदाधर सिंह'),
  (4432, 4427, 'डॉ. गदाधर सिंहू', 'डॉ. गदाधर सिंह'),
  (5276, 5205, 'डॉ. शान्ता जैन', 'डो. शान्ता जैन'),
  (5257, 5205, 'डॉ. शान्ताजैन', 'डो. शान्ता जैन'),
  (5200, 5223, 'मुमुकु शान्ता जैन', 'मुमुक्षु शान्ता जैन'),
  (4678, 4413, 'डॉ. कमलचंद सोगाणी', 'डॉ. कमलचन्द सोगाणी'),
  (4473, 4413, 'डॉ० कमलचन्द सोगाणी', 'डॉ. कमलचन्द सोगाणी'),
  (4475, 4413, 'डॉ० कमलचंद सोगाणी', 'डॉ. कमलचन्द सोगाणी'),
  (4725, 4941, 'विजयदेवनागायण', 'विजयदेव नागायण');

-- Only merge rows that still exist and still carry the reviewed names.
DELETE FROM author_variant_merge m
WHERE NOT EXISTS (SELECT 1 FROM public.authors a WHERE a.id = m.dup_id AND a.name::text = m.dup_name)
   OR NOT EXISTS (SELECT 1 FROM public.authors a WHERE a.id = m.keep_id AND a.name::text = m.keep_name);

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

-- OCR errors in the surviving names.
UPDATE public.authors SET name = 'डॉ. गोविन्दचन्द्र पांडे' WHERE id = 4792 AND name::text = 'डो. गोविन्द चन्द्र पांडे';
UPDATE public.authors SET name = 'डॉ. शान्ता जैन' WHERE id = 5205 AND name::text = 'डो. शान्ता जैन';
UPDATE public.authors SET name = 'विजयदेव नारायण' WHERE id = 4941 AND name::text = 'विजयदेव नागायण';

-- Junk "authors": a bare title or an OCR fragment, not a person.
DELETE FROM public.followed_authors WHERE author_id IN (4864, 4379, 4454, 4963, 5078, 4956);
DELETE FROM public.authors
WHERE id IN (4864, 4379, 4454, 4963, 5078, 4956)
  AND name::text IN ('आचार्य', 'प्रो', 'डॉ.', 'मुन', 'चित', 'साध्वी');

COMMIT;
