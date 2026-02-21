# Application Code Updates

This file is generated/maintained with the migration rollout.

## Goal
- Replace `records.name` reads/writes with `records.magazine_id` + `magazines` join.
- Replace `records.language` reads/writes with `record_languages` + `languages` join.
- Keep API response shape backward-compatible for frontend (`name`, `language`) by deriving values from relations.

## Changed Files
- `run_migration.mjs`
- `migrations/001_backup.mjs`
- `migrations/009_extend_magazines.sql`
- `migrations/010_verify_magazines.sql`
- `lib/recordRelations.ts`
- `lib/magazineUtils.ts`
- `lib/magazineQueries.ts`
- `lib/magazineAuthorUtils.ts`
- `pages/api/magazine-names.ts`
- `pages/api/magazines/index.ts`
- `pages/api/magazines/[id].ts`
- `pages/api/magazines/[id]/authors.ts`
- `pages/api/upload.ts`
- `pages/api/records/add.ts`
- `pages/api/update-record.ts`
- `pages/api/records-paginated.ts`
- `pages/api/records.ts`
- `pages/api/records-light.ts`
- `pages/api/records/extracted-text.ts`
- `pages/api/records/watermark.ts`
- `pages/api/ai/generate.ts`
- `pages/api/user-magazine-activity.ts`
- `pages/api/insights.ts`
- `pages/api/authors/[id]/records/index.ts`
- `pages/api/tags/[id]/records.ts`
- `pages/dashboard/index.tsx`
- `pages/magazines/index.tsx`
- `components/Header.tsx`
- `types.ts`
- `utils/authorRecordUtils.ts`
- `lib/ocrPipeline.js`
- `scripts/backfill-summary-conclusion.mjs`
- `scripts/migrate-cloudinary-to-uploadthing.mjs`

## Notes
- Legacy columns are retained as `records.name_legacy` and `records.language_legacy`.
- API endpoints still expose `name` and `language` so UI screens remain compatible.
- Magazine CRUD now supports metadata fields, image URLs/public IDs, website/contact details, and author mappings via `magazine_authors`.
