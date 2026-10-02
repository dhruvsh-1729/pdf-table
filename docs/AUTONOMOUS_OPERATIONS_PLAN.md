# Aryan Culture: Autonomous Operations Plan

> **Working mode (2026-09-26):** no scheduled Claude cloud routine for now. The owner opens a Claude Code CLI session daily or every other day, and the maintainer works the plan there. Railway `ops-cron` (hourly, `5 * * * *` UTC) runs health checks and the Monday report on its own.
> **Session checklist:** (1) `select * from ops_runs where status <> 'success' order by id desc` since the last session; (2) check the live sites; (3) `git pull` both repos and read the other session's recent commits; (4) continue §13 and tick items off here; (5) append to §12.
>
> **Standing decisions (2026-09-26):** revenue ⏸ deferred · copyright/rights questions ⏸ deferred. Only work with material that is already clearly fine · Vedanta Kesari hidden (not deleted) · no uploads to Backblaze until the owner OKs it.

**Owner:** Dhruv (account holder and only human contact) · **Maintainer:** Claude (AI) · **Written:** 2026-09-26
**Scope:** aryanculture.org (`dhruvsh-1729/aryanculture`), data.aryanculture.org (`dhruvsh-1729/pdf-table`), the shared Supabase project, UploadThing, and Railway project `aryanculture`.

No human team is left. Maharaj saheb wants the project to keep going on its own. This file is the maintainer's source of truth: every scheduled run reads it, works the next unchecked items, and updates it.

---

## 0. Ground rules for the AI maintainer

1. **Never present AI output as human work.** Every summary, conclusion and tag records who produced it (`human`, `ai:<model>`) and who checked it (`human`, `ai_audit`, `none`). The site shows this.
2. **No fabrication.** A summary is only written from real source text of enough length. If the text is missing, the record is marked `needs_text`, not guessed. The same goes for PDFs: never create a document that imitates a publisher's issue.
3. **Rights first.** Every source has a `rights_status`: `public_domain`, `permission_granted`, `link_only` or `unknown`. Only the first two may have files hosted on UploadThing. `link_only` sources get metadata, a summary and a link to the publisher.
4. **Allowlisted sources only.** No open-web crawling. The discovery job may *propose* sources. The owner approves them by editing the registry (one line).
5. **Budgets and kill switch.** Every job type has a daily cost/volume cap stored in the DB. `ops_settings.paused = true` stops all automated writes.
6. **Reversible by default.** Destructive DB changes need a backup taken in the same run and a migration file in git. Bulk rewrites go to a staging column first, then get swapped in.
7. **Report every run.** Each run writes an `ops_runs` row. A weekly email to the owner covers what changed, what failed, spend, and anything needing a human.
8. **Escalate, don't guess,** for anything in §9 (money, legal, accounts, credentials).

---

## 1. Current state (audited 2026-09-26)

| Area | Fact |
|---|---|
| Corpus | 8,726 articles from 14 journals, 1906–2024. Jain studies ≈4,400, Indology/history ≈3,960, Vedanta Kesari 550, Buddhist 43 |
| Languages | English 67%, Hindi 29%, Gujarati 2% |
| Files | 8,211 PDFs on UploadThing. **513 Vedanta Kesari records have `pdf_url` pointing to HTML pages on vk.rkmm.org** (no PDF). 2 have no URL |
| Text | 1,381 records have no `extracted_text` (Jain Journal 752, IHQ 382, Sambodhi 223, …). **321 of 550 Vedanta Kesari records have fewer than 500 characters** (scrape failed; often only the title) |
| Summaries | All records have one. **1,715 have a long summary but under 500 characters of source text.** Some were written by volunteers from the PDF and are fine. Some are invented from the title (e.g. #7182 "TOTAL IMMUNITY", VK Oct 2017, summarised as vitamins/exercise advice) |
| Checked by a person | 1,465 records (17%) by 12 former volunteers. Nobody is left to check more |
| Dates | Publication date is free text in `records.timestamp`. A year can be parsed for ~98% |
| Subjects | 10 areas / 33 sub-areas cover 73% of records. Subject logic lives in book-master, not pdf_proj |
| Tags | 36,738 tags, 31,785 used once. Mostly noise |
| Authors | 3,092. Placeholder "Unexhibited" on 792 records. ~780 Devanagari names, many duplicating Latin-script names. 64 have descriptions. (Another session is merging variants: commit `fe754b3`) |
| Journals | All 15 journals have empty metadata (description, founding year, ISSN, publisher). One junk "test" journal |
| Ingestion | `pdf_proj/pages/add.tsx`: a person loads an issue PDF, marks split points, and the browser splits it with pdf-lib. The server extracts text (pdfjs; OCR off), DeepSeek fills title/summary/conclusion/authors/tags, the file goes to UploadThing, and the browser links tags/authors (not atomic). No subject assignment. No headless path |
| Infra | Railway services: `pdf-table` (portal), `magzine-summary` (site), `paddle-ocr` (self-hosted PaddleOCR), `doxsummarize` (OCR + Sarvam/Reducto/OpenRouter). Env includes DeepSeek, Sarvam, iLovePDF, LightPDF, B2 (Backblaze) and Resend keys |
| Usage | 1 public profile, 2 bookmarks, 29 reading-progress rows. Effectively no users yet |

---

## 2. Target architecture

```
                 ┌──────────────────── Railway project "aryanculture" ────────────────────┐
 Source registry │  worker service (new, same repo as pdf-table, `npm run worker`)        │
 (DB table)  ───▶│   • Postgres job queue (FOR UPDATE SKIP LOCKED), idempotent jobs       │
                 │   • adapters: vk_html, archive_org, drop_folder, pdf_url               │
                 │   • pipeline: fetch → OCR/extract → segment → enrich → audit → publish │
 Railway cron ──▶│  cron service: enqueues periodic jobs (discover, audit, backup, report)│
                 │  paddle-ocr (existing) · Supabase · UploadThing · DeepSeek/Sarvam      │
                 └────────────────────────────────────────────────────────────────────────┘
 Claude scheduled routine (weekly, cloud): reads this plan and ops_runs, reviews the
 low-confidence queue (views page images), fixes bugs, ships code, updates this file.
```

**Split of work:**
- **Deterministic code on Railway** does the volume: cheap, always on, budget-capped.
- **Claude** does judgement and engineering on a schedule:
  - edge-case review, such as article boundaries the model wasn't sure about
  - audits of samples
  - schema/code changes and incident fixes
  - the weekly report

**Why not a full-time crawler "searching for sources":** it would ingest copyrighted and low-quality material, cost unpredictable money, and create legal risk for Maharaj saheb's name. Pre-decided sources with per-source rights, plus a discovery job that only *suggests* new sources, is safer and gives better data.

---

## 3. Phase 0: Foundations and safety (do first)

- [x] **Ops tables**: done in migration `018_public_read_only_and_ops.sql`:
  - `ops_settings` (paused flag, daily caps per job type, report email)
  - `ops_runs` (who, what, counts, spend, errors)
  - `jobs` (type, payload, status, attempts, run_after, locked_by, error)
  - `sources` (registry, see §6)
- [ ] **Backups: WAITING ON OWNER.** A full manual backup exists locally at `pdf_proj/backups/supabase-full-20260926T150418Z.dump` (64 MB, `pg_dump -Fc` 17). The owner didn't know about Backblaze B2 (a private bucket `mag-summaries` and keys already exist in env). Ask before uploading anything there. Target design: a nightly `pg_dump` of the Supabase DB to Backblaze B2 (keys already in env). Keep 14 daily and 8 weekly. Test a restore into a scratch database once a month.
- [x] **Monitoring:** `ops/run.mjs health` (Railway cron service `ops-cron`). Original spec: hourly uptime checks for aryanculture.org, data.aryanculture.org and paddle-ocr, plus Railway deploy status. Write to `ops_runs`. Email the owner after 2 consecutive failures.
- [x] **Weekly report email** (`ops/run.mjs report`, Mondays ≥03:00 UTC) via Resend to dhruvshdarshansh@gmail.com: corpus growth, audit results, spend, errors, human actions needed.
- [ ] **Cost ledger:** record token usage per AI call (DeepSeek returns `usage`). Stop a job type when it hits its daily cap.
- [ ] **Permission rules** so scheduled runs aren't blocked (owner adds to Claude settings): git push to both repos, `railway up`/redeploy for the four services, and DB migrations that come with a backup.
- [ ] **Security left over from 2026-09-26:**
  - add `SESSION_SECRET` on pdf-table
  - rotate the two `123456` super-admin passwords
  - `magzine_summary` sends profile emails in page data (from the SEO audit)
  - [x] 2026-09-26: 19 catalog tables were writable and deletable with the public anon key. Now RLS is on with read-only `public_read` policies (migration 018), and live pages were verified afterwards. Still open: `records.email`/`creator_name` and `summaries.email` (volunteer emails) are readable by anon, so restrict with column grants or a view. Old note: the anon key has full access to most tables in the shared Supabase project. Enable RLS table by table with read-only policies for public data, and test against aryanculture.org before and after
- [ ] **Pin down the other active session:** confirm who or what is committing to pdf_proj (`c7456e2`, `fe754b3`). Coordinate through this file (§12) to avoid clashing migrations.

## 4. Phase 1: Data integrity (the archive must be trustworthy before it grows)

### 4.1 Schema (additive migrations)
- [x] `records.publication_year int`, `publication_month int`, parsed from `timestamp`. Backfill and report records that fail to parse.
- [x] (title heuristics; AI refinement still open) `records.record_type`: `article | book_review | editorial | notice | obituary | poem | news | index | other`. The AI classifies from title and text, and the site filters by it.
- [ ] Source and rights: `records.source_url` (publisher page), `records.hosted_pdf_url` (UploadThing, only if rights allow), `records.rights_status`. Migrate the VK HTML URLs out of `pdf_url` into `source_url`.
- [x] Provenance: `summary_origin` (`human|ai`), `summary_model`, `summary_prompt_version`, `summary_generated_at`, `check_status` (`human_verified|ai_audited|flagged|unchecked`), `audit_score`, `audit_notes`. Backfill: the 1,465 records in `summaries` → `human_verified`. Records with a creator email and no AI trace → `human` origin.
- [x] `records.text_quality`: `good | partial | missing | ocr_needed`, computed from length and script checks.

### 4.2 Text recovery
- [x] **Vedanta Kesari hidden from the public site** (2026-09-26, migration 018: `magazines.is_active = false` plus RLS). Rows are kept in the DB and in the backup. Owner's direction: if it isn't allowed, remove it and focus on the other journals. **Do not spend effort on VK text recovery unless the owner reopens it.** Deleting permanently needs the owner's explicit OK.
- [ ] ~~**Vedanta Kesari (550):**~~ (on hold) re-fetch each vk.rkmm.org article page with a polite, throttled adapter and pull the article body. The source site has a `/zfiles/public` download path; check whether it serves official PDFs. If so, *link* to them. Keep `rights_status = link_only` until permission is granted.
  - Do **not** generate PDFs from scraped text. That would be a fabricated document in the publisher's name, and the site states "© Ramakrishna Math & Mission Publications. All Rights Reserved".
  - Draft a permission request to RKM Publications for the owner to send (§9).
- [ ] **1,381 records with no text:** run PaddleOCR (existing service) on the UploadThing PDF. Use Devanagari models for Hindi/Sanskrit, and fall back to iLovePDF or Sarvam for poor pages. Store per-page text and an OCR confidence score.
- [ ] Re-extract for records whose text looks garbled (a mostly non-letter character ratio, or a script mismatch against the detected language).

### 4.3 Hallucination audit (highest priority after backups)
- [ ] For every record with `text_quality in (good, partial)`, an **audit job** asks the model whether each claim in the summary is supported by the text. It stores a score and the unsupported claims. Run a cheap model on everything and a stronger model on anything scoring low.
- [ ] Records with long summaries and missing text (1,715) get priority: recover text (4.2) first, then audit.
- [ ] Policy:
  - score ≥ 0.8 → `ai_audited`
  - 0.5–0.8 → regenerate from text, then re-audit
  - < 0.5, or no text → **hide the summary** (show title, metadata and the link only) until it's fixed
- [ ] Never overwrite a `human_verified` summary automatically. Flag disagreements for Claude's weekly review instead.
- [ ] Publish audit stats in the weekly report and on a public "About our data" page.

### 4.4 Entities and classification
- [ ] Authors:
  - fix "Unexhibited" (792): find the real author in the text or summary, otherwise set to `Unknown`
  - merge Latin and Devanagari duplicates through transliteration plus model confirmation (coordinate with `fe754b3`)
  - link authors named in the summary text
  - generate short, sourced author descriptions only from corpus evidence
- [ ] Replace free tags with a **controlled vocabulary** of about 300–600 concepts. Map the existing 36.7k tags to it, drop single-use noise, and keep a cleaned `keywords` list per record for search.
- [ ] Subjects: port the book-master subject suggester into pdf_proj. Classify the remaining ~27% of records and every new one.
- [x] (10/13 journals; Jain Vidya, Hita-mita, Jnana Desana publisher unverifiable) Journals: fill in description, publisher, founding year, ISSN, language and website from public sources, with the source cited in `metadata.sources`. Delete the "test" journal.
- [ ] Duplicate detection: same journal, volume, number and pages, or near-identical text.

## 5. Phase 2: Headless ingestion pipeline (replace the human in `/add`)

- [ ] Move the add.tsx logic into `lib/pipeline/` (Node, server-only):
  - `splitPdf(buffer, sections)` with pdf-lib, including rotation and whiteout support
  - `extractText(pdf)` using the pdfjs text layer, then PaddleOCR, then iLovePDF
  - `enrich(text)`: title, authors, summary, conclusion, record_type, subjects, keywords and language, as a single structured JSON call instead of 5 separate calls
  - `publish(record)`: **one transaction** covering the record plus authors, tags, subjects and languages. Upload the file first and roll back (delete the file) if the insert fails
- [ ] **Automatic article boundaries:**
  1. Extract per-page text and a layout signal (large-font lines near the top of the page, page headers and footers).
  2. If the issue has a contents page, parse it into titles, authors and start pages, then match pages to it, allowing for an offset between printed and PDF page numbers.
  3. Otherwise, ask the model page by page: "does a new article start on this page? title and author?"
  4. Combine both and give each boundary a confidence score. High confidence → publish automatically. Low confidence → the `needs_review` queue, which Claude's weekly run clears by looking at page images.
- [ ] Idempotency: key each issue by `(source_id, source_item_id)`. Re-running must not create duplicates.
- [ ] Rebuild `/add` on top of the same library, so a person can still use it if one turns up. The human and automatic paths share code.
- [ ] Tests: fixture PDFs (one English, one Hindi, one scanned) with known boundaries. CI fails if boundary accuracy drops.

## 6. Phase 3: Sources and acquisition

- [ ] `sources` table: `id, name, journal_id, adapter, base_url, rights_status, crawl_policy (rate, schedule), enabled, last_run, notes`.
- [ ] Adapters:
  - `vk_html`: Vedanta Kesari article pages. Link only; text for summaries only. Check the site's terms. Pause and escalate if they forbid this.
  - `archive_org`: Internet Archive items (public-domain runs, e.g. early Indian Historical Quarterly and Jaina Gazette volumes, if the rights check passes). Use their API and metadata.
  - `drop_folder`: a Google Drive or B2 folder where the owner or a well-wisher drops issue PDFs. **This is how physical or offline issues get in.** Each drop is processed automatically.
  - `pdf_url`: a one-off list of URLs approved by the owner.
- [ ] Rights check for each proposed source: publication year, author death dates where known, and the publisher's stated terms. Anything unclear → `unknown` → link-only until the owner decides.
- [ ] **Discovery job (monthly):** search for Jain and Indological journals and their archives, and write *proposals* (source, estimated volume, rights assessment) to the weekly report. Candidates to evaluate, not assume:
  - complete runs of the existing 14 journals
  - Tulsī Prajñā, Śramaṇa, Arhat Vacana, Anekānt
  - the jainelibrary.org holdings (permission needed)
- [ ] Coverage dashboard for the owner: per journal, which volumes and issues exist versus are missing.

## 7. Phase 4: Product, trust and SEO

- [ ] A badge on each record (Human-verified, AI-audited or Unchecked) with a short explanation. Label AI summaries as AI-generated.
- [ ] Citation export (Chicago, MLA, APA, BibTeX, RIS) with journal, volume, issue, pages and year, plus stable permalinks.
- [ ] Full-text search: Postgres `tsvector` on the cleaned text, with `simple` config plus trigram for Hindi/Sanskrit. Show matched snippets.
- [ ] Year filter and timeline views (depends on `publication_year`). Filter by record type.
- [ ] Hindi UI (the Jain community audience), starting with navigation and record pages.
- [ ] "Ask the archive": answers drawn from the text, **with citations to specific records**, and a refusal when the archive has no support.
- [ ] Journal, volume and issue browse pages (a table-of-contents view per issue).
- [ ] Keep the SEO work going. Structured data on record pages uses `ScholarlyArticle` with `isPartOf` pointing to the issue/journal, plus Google Scholar `citation_*` meta tags. These matter most for scholars finding the site.

## 8. Phase 5: Revenue — ⏸ DEFERRED (owner, 2026-09-26: "we can rethink about revenue and copyrights")

Do not build any of this until the owner reopens the topic. Kept for reference only.

A Jain monk does not handle money. Any revenue must go to a **trust or legal entity run by a lay person** (bank account, payment gateway, tax receipts). Claude can build everything technical, but cannot be the legal or financial party.

1. [ ] **Donations and sponsorship** (most realistic first income): "Sponsor a journal / a volume / digitisation of an issue", with the sponsor credited on those pages if they wish. Razorpay (India) or Stripe, receipts, and 80G if the trust has it. The page stays within the tradition's norms.
2. [ ] **Institutional access** for universities, libraries and research centres: bulk export, API, citation feeds, usage reports, and a custom digitisation service for their holdings. Priced per year.
3. [ ] **Premium researcher tier:** unlimited "Ask the archive", saved collections, exports. Only once audits show the data can be trusted.
4. [ ] **Grants:** Jain foundations and Indic-heritage or digital-humanities grants. Claude drafts applications; the owner submits.
5. [ ] Keep core browsing and summaries free. That is the public-good mission and it feeds SEO.
- [ ] Track: visitors, returning researchers, citation exports, donations. Report monthly.

## 9. Needs a human (owner, about 1 hour a month)

| Item | Why |
|---|---|
| Pay and keep accounts alive (Railway, Supabase, UploadThing, DeepSeek, Resend, domain, GitHub) | A lapsed card takes the site down |
| Approve new sources and rights decisions | Legal responsibility |
| Send permission requests Claude drafts (e.g. RKM Publications for Vedanta Kesari) | Needs a real sender |
| Drop offline or new issue PDFs into the drop folder | Claude can't get physical copies |
| Set up the trust's payment gateway and bank details | Legal and financial entity |
| Handle takedown or legal notices | Legal |
| Rotate credentials if one leaks; keep 2FA on accounts | Security |
| Approve database restores or anything that deletes data | Irreversible |

## 10. Recurring schedule (after Phase 0–2)

| Cadence | Job (Railway cron → worker) |
|---|---|
| Hourly | Uptime and deploy checks; process the `jobs` queue |
| Daily | Backup to B2; ingest from enabled sources; OCR/text recovery batch; audit batch (budget-capped); refresh the sitemap |
| Weekly | Claude routine (review the low-confidence queue, fix failures, ship improvements, update this file); report email |
| Monthly | Source discovery proposals; restore test; dependency and security updates; coverage report |

## 11. Budget guardrails (to confirm with the owner)

- DeepSeek: about a few cents per article for enrichment plus audit at current prices. Re-auditing the whole corpus once is roughly in the tens of US dollars (verify current pricing before running). Daily cap in `ops_settings`.
- Railway: worker plus cron adds roughly a small monthly amount on top of today's bill. PaddleOCR already runs there.
- UploadThing: check the plan's storage limit before bulk OCR re-uploads.
- The weekly Claude routine uses the owner's Claude plan. Keep it to one run a week, plus runs on demand.

## 12. Coordination log (append-only)

- 2026-09-26: Plan written. Password auth, admin panel and RLS on `users` are live on data.aryanculture.org. The site's repo moved to `dhruvsh-1729/aryanculture` with auto-deploy verified. Another session is active in pdf_proj (languages normalisation `c7456e2`, author merges `fe754b3`). Check its migrations before numbering new ones.

- 2026-09-26 (later): Migration 018 applied (public read-only RLS on catalog tables, VK and "test" journals hidden, ops tables). Migration 019 applied (`records.created_at`, existing rows NULL). `ops/` package added (health + weekly report). Owner deferred revenue and copyright work. Backups wait on the owner's choice of storage. The other session switched AI generation to Sarvam (`b93130e`) and is at migration 017. The next free migration number is 020.

- 2026-09-26: `ops-cron` Railway service created (repo pdf-table, `RAILWAY_DOCKERFILE_PATH=ops/Dockerfile`, cron `5 * * * *`, variables referencing pdf-table). First cron run succeeded (ops_runs #4). Config-as-code is deprecated on Railway for new services, so `ops/railway.json` is documentation only and settings live in the dashboard. Watch path `/ops/**` didn't save, so ops-cron rebuilds on every pdf-table push. The owner chose CLI sessions over a cloud routine.

- 2026-09-26 night (autonomous run, owner asleep): backups taken before changes (`backups/supabase-full-20260926T152109Z.dump`). Migrations 020–029 applied:
  - 020–022: quality, provenance, publication-year and text-source fields. 8,725/8,726 records are dated.
  - 023: record_summary_history.
  - 025/026: date and volume typo fixes.
  - 027/028: stripped pasted ChatGPT debris ("file:///home/oai/share/…#:~:text=…") from 546 summaries and 299 conclusions, plus an auto-strip trigger.
  - 029: sourced journal metadata.
  Scripts in `ops/`: recover-text (pdftotext → Tesseract), audit-summaries (Sarvam, full text, validated with negative controls), regenerate-summaries (history kept, published only if the re-audit passes), classify-subjects. The site hides flagged summaries and labels each summary's review status (aryanculture 2e38999). `SESSION_SECRET` set on pdf-table.
  - **Load incident:** 15:30 and 15:46–15:51 UTC, the site returned 500s. DB disk I/O was saturated (my audit reading full texts plus the other session's search backfill). All batch jobs now call `waitForHealthySite()` (pause 2 min when the homepage is slower than 2.5 s). Keep job concurrency ≤2 for DB-heavy readers.
  - The other session (kkms-de) owns search, author pages, tags typeahead, `summary_hi` and the PWA. Its search migration is `024_full_text_search.sql`. **The next free migration number is 030.**
  - DeepSeek balance is negative (−$2.40); all AI now goes through Sarvam (`sarvam-105b`, `reasoning_effort: null`).

- 2026-09-26 ~18:00 UTC: **Sarvam credits ran out (HTTP 402).** All AI work stopped: audit (1,005 ok / 337 flagged / 236 partial), regeneration (296 rewritten and published in total), and the other session's Hindi translation. Ingest job #1 (dry-run smoke test) was cancelled. **Before any AI job runs again, the owner must top up Sarvam.** Resume with `audit-summaries.mjs` (it skips audited records), then `regenerate-summaries.mjs`, then `classify-subjects.mjs`.
  - Correction: `summaries`/`conclusions` hold the PREVIOUS text saved when a volunteer edits a record (pages/api/update-record.ts), so they are edit history, not reviews. `check_status='human_verified'` therefore means "a volunteer edited this summary". The site label and withholding rule were adjusted by the other session.
  - ops-cron: Supabase's direct DB host is IPv6-only and Railway lacked outbound IPv6. Fixed by connecting through the IPv4 session pooler (`SUPABASE_DB_POOLER_HOST=aws-1-ap-south-1.pooler.supabase.com`, in `ops/pipeline/sql.mjs`); outbound IPv6 was also enabled. **Still to verify:** an end-to-end ingest job on Railway once Sarvam has credits (queue one with `payload.dry_run=true` first).
  - Text recovery pass 1: 957/1000 improved. Pass 2 (OCR only) running. Next free migration number: 031 (the other session used 030 for `summary_hi`).

- 2026-09-27 (SEO session, site repo): Shipped to aryanculture.org: 786 `/topics/[id]` pages plus a `/topics` hub (site migration 0020_topics.sql, applied), with tags on article and author pages as crawlable links; www→apex 301; 410 for the old WordPress URLs; keyword titles and descriptions; Google Scholar `citation_*` meta; thin pages noindexed and left out of the sitemap; IndexNow key plus `scripts/indexnow.mjs` (all URLs submitted). Search Console baseline on 2026-09-27: 3.7K indexed, 4,987 discovered but not indexed, average crawl response 754 ms, about 60 crawls a day. Next free site migration: 0021. Owner decisions pending: a Cloudflare CDN in front, buying .com/.in, Bing Webmaster import.

- 2026-10-02 (citations + insights session): Site: citations carry month, publisher, ISSN; RIS export and .bib/.ris download; Scholar meta and JSON-LD use month-precision dates and page bounds (aryanculture c40cbef). Migration 035 applied (page_numbers normaliser + trigger, 284 rows fixed, old values in records_page_numbers_backup_035). Migration 036 applied (record_insights, entities, record_entities, entity_stats). `ops/extract-insights.mjs` adds per article up to 3 verbatim key quotes (substring-checked against extracted_text; when the model OCR-corrected a quote the source's own wording is stored), works cited, and up to 15 discussed people/places/works/groups (each name must occur in the text). Full run started 18:58 IST: `logs/insights-20261002b.log`, budget ₹2,200, about ₹0.2 per article, ~4.5 h. Re-running the script resumes and retries `failed` rows. Site shows Key passages, Works cited, "Discussed in this article", and /entities pages (aryanculture 188002f, 971e7a3); insights are cached for 6 h, separately from the 7-day page cache. New Sarvam key is in the local .env files; **Railway still has the old key.** Migration 037 (tag dedupe: 123 spelling variants merged, 2,260 unused tags) is drafted but NOT applied: the auto-mode classifier blocked it, and the draft still calls the dropped `merge_tags`, so rewrite it before running. The controlled tag vocabulary (31,785 single-use tags) changes ~786 indexed topic URLs; it needs the owner's decision first. Next free migration: 037.

## 13. Execution order (next runs)

1. Phase 0: backups, ops tables, monitoring and report email.
2. 4.1 schema plus the 4.3 audit on the 1,715 suspicious records. Hide invented summaries.
3. 4.2 VK text recovery and OCR for the 1,381 records without text.
4. Phase 2 pipeline library and automatic boundaries (drop-folder adapter first).
5. 4.4 entity cleanup and controlled vocabulary.
6. Phase 4 trust features: badges, citations, full-text search.
7. Phase 3 source registry and discovery, then Phase 5 revenue.
