-- 025: two issue-date typos, evident from volume numbering.
-- The Indian Historical Quarterly vol. 1 was 1925 (nos. 1, 2, 4 are dated 1925); no. 3 was entered as "September - 1923".
UPDATE public.records SET timestamp = 'September - 1925', publication_year = 1925
WHERE magazine_id = 10 AND volume = '1' AND number = '3' AND timestamp = 'September - 1923';
-- Jinamanjari publishes two volumes a year (vol. 13 no. 1 = 1996); vol. 14 no. 2 was entered as "1966".
UPDATE public.records SET timestamp = '1996', publication_year = 1996
WHERE magazine_id = 5 AND volume = '14' AND number = '02' AND timestamp = '1966';
