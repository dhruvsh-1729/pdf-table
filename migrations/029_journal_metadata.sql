-- 029: sourced journal metadata (two independent research passes, 2026-09-26). Sources/notes kept in metadata.
-- Only fields supported by a cited source are filled; Jain Vidya and Hita-mita had no verifiable source.
BEGIN;
UPDATE public.magazines SET
  description = COALESCE('The Indian Historical Quarterly was an English-language journal of Indian history and culture, edited by Narendra Nath Law and published in Calcutta from 1925 to 1963. It covered history, literature, religion, philosophy, archaeology, numismatics and epigraphy.', description), headquarters = COALESCE('Calcutta (Kolkata), India', headquarters),
  founded_year = COALESCE(1925, founded_year), issn_print = COALESCE('0019-4859', issn_print),
  website_url = COALESCE(NULL, website_url), metadata = metadata || '{"publisher": "Calcutta Oriental Press", "sources": ["https://search.worldcat.org/title/indian-historical-quarterly/oclc/2262240", "https://www.ideasofindia.org/project/indian-historical-quarterly/", "https://archive.org/details/in.ernet.dli.2015.33109", "https://portal.issn.org/resource/ISSN/0019-4859"], "research_notes": "Ceased 1963.", "researched_at": "2026-09-26"}'::jsonb, updated_at = now()
WHERE id = 10;
UPDATE public.magazines SET
  description = COALESCE('Jain Bharati is a Hindi monthly magazine published by the Jain Swetamber Terapanthi Mahasabha, Kolkata, covering Jain philosophy, practice and community life.', description), headquarters = COALESCE('Kolkata, India', headquarters),
  founded_year = COALESCE(1948, founded_year), issn_print = COALESCE(NULL, issn_print),
  website_url = COALESCE('https://jstmahasabha.org/activities/jain-bharati', website_url), metadata = metadata || '{"publisher": "Jain Swetamber Terapanthi Mahasabha", "sources": ["https://jstmahasabha.org/activities/jain-bharati"], "research_notes": "Began 1940 as ''Vivaran Patrika''; renamed Jain Bharati in 1948; monthly since 1989 (publisher''s page).", "researched_at": "2026-09-26"}'::jsonb, updated_at = now()
WHERE id = 1125;
UPDATE public.magazines SET
  description = COALESCE('Jain Journal is an English-language quarterly on Jainology published by Jain Bhawan, Kolkata, with research articles and book reviews on Jain philosophy, literature, history and culture.', description), headquarters = COALESCE('Kolkata, India', headquarters),
  founded_year = COALESCE(1966, founded_year), issn_print = COALESCE('0021-4043', issn_print),
  website_url = COALESCE('https://www.jainbhawan.in/jainjournal.html', website_url), metadata = metadata || '{"publisher": "Jain Bhawan", "sources": ["https://portal.issn.org/resource/ISSN/0021-4043", "https://www.jainbhawan.in/jainjournal.html", "https://jainqq.org/booktext/Jain_Journal_1968_04_Romanized/520010"], "research_notes": "Founding year 1966 is low-moderate confidence (MIAR snippet + volume numbering).", "researched_at": "2026-09-26"}'::jsonb, updated_at = now()
WHERE id = 1;
UPDATE public.magazines SET
  description = COALESCE('Sambodhi is the research journal of the Lalbhai Dalpatbhai Institute of Indology, Ahmedabad, publishing Indological papers in English, Gujarati and Hindi.', description), headquarters = COALESCE('Ahmedabad, India', headquarters),
  founded_year = COALESCE(1972, founded_year), issn_print = COALESCE('2249-6661', issn_print),
  website_url = COALESCE('https://www.ldindology.org/publication', website_url), metadata = metadata || '{"publisher": "L. D. Institute of Indology", "sources": ["https://portal.issn.org/resource/ISSN/2249-6661", "https://www.ldindology.org/publication", "https://jainqq.org/booktext/Sambodhi_1972_Vol_01/520751"], "research_notes": "Vol. 1 No. 1 dated April 1972 (eds. Dalsukh Malvania, H. C. Bhayani); institute page says ''since 1970''.", "researched_at": "2026-09-26"}'::jsonb, updated_at = now()
WHERE id = 8;
UPDATE public.magazines SET
  description = COALESCE('The Journal of Indian History and Culture is an annual peer-reviewed journal of the C.P. Ramaswami Aiyar Institute of Indological Research, Chennai, covering Indian history, art, architecture, religion, philosophy and archaeology.', description), headquarters = COALESCE('Chennai, India', headquarters),
  founded_year = COALESCE(1996, founded_year), issn_print = COALESCE('0975-7805', issn_print),
  website_url = COALESCE('https://journalcpriir.com/', website_url), metadata = metadata || '{"publisher": "C.P. Ramaswami Aiyar Institute of Indological Research", "sources": ["https://portal.issn.org/resource/ISSN/0975-7805", "https://journalcpriir.com/", "https://www.cprfoundation.org/jihc.html"], "research_notes": "UGC-CARE listed.", "researched_at": "2026-09-26"}'::jsonb, updated_at = now()
WHERE id = 11;
UPDATE public.magazines SET
  description = COALESCE('The Jaina Gazette was an English-language monthly, the organ of the Bharat Jaina Mahamandal (All-India Jain Association), published from Lucknow and later Madras, edited at various times by J. L. Jaini, Ajit Prasada and C. S. Mallinath.', description), headquarters = COALESCE(NULL, headquarters),
  founded_year = COALESCE(NULL, founded_year), issn_print = COALESCE(NULL, issn_print),
  website_url = COALESCE(NULL, website_url), metadata = metadata || '{"publisher": "Bharat Jaina Mahamandal (All-India Jain Association)", "sources": ["https://jainqq.org/booktext/Jaina_Gazette_1914_Romanized/034888", "https://jainqq.org/booktext/Jaina_Gazette_1927/034889", "https://jainqq.org/booktext/Jaina_Gazette_1928/034890"], "research_notes": "Place of publication moved (Lucknow 1914, Madras 1927-28). Founding year not stated in sources (volume numbering suggests c. 1904-05).", "researched_at": "2026-09-26"}'::jsonb, updated_at = now()
WHERE id = 2;
UPDATE public.magazines SET
  description = COALESCE('Jain Avenue is a monthly web-based magazine of the JAINA India Foundation, an entity of JAINA (USA), with articles on Jain practice and contemporary Jain life. Its first issue appeared on 15 August 2020.', description), headquarters = COALESCE('Mumbai, India', headquarters),
  founded_year = COALESCE(2020, founded_year), issn_print = COALESCE(NULL, issn_print),
  website_url = COALESCE('https://jainavenue.org/', website_url), metadata = metadata || '{"publisher": "JAINA India Foundation", "sources": ["http://web.archive.org/web/20240911140210/https://jainavenue.org/about-us/"], "research_notes": "jainavenue.org refused connections in Sep 2026; URL may be dead.", "researched_at": "2026-09-26"}'::jsonb, updated_at = now()
WHERE id = 6;
UPDATE public.magazines SET
  description = COALESCE('Jinamanjari was a biannual English-language journal of contemporary Jaina reflections, published by the Brahmi Jain Society (Toronto area) from 1990 to 2009 and edited by S. A. Bhuvanendra Kumar.', description), headquarters = COALESCE('Mississauga, Ontario, Canada', headquarters),
  founded_year = COALESCE(1990, founded_year), issn_print = COALESCE('1188-0287', issn_print),
  website_url = COALESCE(NULL, website_url), metadata = metadata || '{"publisher": "Brahmi Jain Society", "sources": ["https://portal.issn.org/resource/ISSN/1188-0287", "https://jainastudies.soas.ac.uk/ijjs/ijjs-2101-2025.pdf", "https://jainqq.org/booktext/Jinamanjari_2000_04_No_21/524021"], "research_notes": "First issue October 1990 (Cort, IJJS 21/1, 2025). Society name spelled Brāhmi/Bramhi in sources.", "researched_at": "2026-09-26"}'::jsonb, updated_at = now()
WHERE id = 5;
UPDATE public.magazines SET
  description = COALESCE(NULL, description), headquarters = COALESCE(NULL, headquarters),
  founded_year = COALESCE(NULL, founded_year), issn_print = COALESCE('0976-0644', issn_print),
  website_url = COALESCE(NULL, website_url), metadata = metadata || '{"publisher": null, "sources": ["https://portal.issn.org/resource/ISSN/0976-0644", "https://nsktu.ac.in/wp-content/uploads/2022/12/National-Sanskrit-University-Tirupati-Peer-reviewed-Journals-list..pdf"], "research_notes": "ISSN confirmed (key title ''Jnana desana''). Publisher ''Shrut Samvardhan Sansthan, Meerut'' appears only in a university journal list: unconfirmed, not displayed.", "researched_at": "2026-09-26"}'::jsonb, updated_at = now()
WHERE id = 540;
UPDATE public.magazines SET
  description = COALESCE('The Maha Bodhi, ''The International Buddhist Journal'', is the journal of the Maha Bodhi Society of India, founded by Anagarika Dharmapala and published from Kolkata since 1892, with articles on Buddhism and Buddhist studies.', description), headquarters = COALESCE('Kolkata, India', headquarters),
  founded_year = COALESCE(1892, founded_year), issn_print = COALESCE('0025-0406', issn_print),
  website_url = COALESCE('https://mbsiindia.org/maha-bodhi-journal.php', website_url), metadata = metadata || '{"publisher": "Maha Bodhi Society of India", "sources": ["https://portal.issn.org/resource/ISSN/0025-0406", "https://mbsiindia.org/maha-bodhi-journal.php", "https://en.wikipedia.org/wiki/Maha_Bodhi_Society"], "research_notes": "UGC-CARE listed.", "researched_at": "2026-09-26"}'::jsonb, updated_at = now()
WHERE id = 7;
UPDATE public.magazines SET
  description = COALESCE('Dharmadoot is the annual journal of the Maha Bodhi Society of India, Sarnath, published since 1935, with peer-reviewed articles in English and Hindi on Pali and Buddhist studies.', description), headquarters = COALESCE('Sarnath, Varanasi, India', headquarters),
  founded_year = COALESCE(1935, founded_year), issn_print = COALESCE('2347-3428', issn_print),
  website_url = COALESCE('https://mbsiindia.org/dharmadoot-journal.php', website_url), metadata = metadata || '{"publisher": "Maha Bodhi Society of India, Sarnath", "sources": ["https://portal.issn.org/resource/ISSN/2347-3428", "https://mbsiindia.org/dharmadoot-journal.php"], "research_notes": "UGC-CARE listed.", "researched_at": "2026-09-26"}'::jsonb, updated_at = now()
WHERE id = 9;
COMMIT;
