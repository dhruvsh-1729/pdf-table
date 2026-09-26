-- 026: The Jaina Gazette volumes track the year (vol. N ≈ year − 1904; vol. 23 = 1927).
-- Ten February 1936 records were entered as vol. 23 — a digit swap for vol. 32.
UPDATE public.records SET volume = '32'
WHERE magazine_id = 2 AND volume = '23' AND publication_year = 1936 AND timestamp = 'February - 1936';
