# DB Contract (Backoffice MVP)

## Source of Truth
- This contract is tied to `docs/db-schema.sql` generated from `SHOW CREATE TABLE`.
- Refresh command: `pnpm db:schema:export`.

## Covered Tables
- `artists`
- `artworks`
- `courses`
- `course_items`
- `course_checkins`
- `home_banners`
- `places`
- `zones`

## Critical Rules
1. `course_items` reorder must keep existing `id` values and only update `seq`.
2. `course_items` delete must fail with HTTP 409 when `course_checkins` exists.
3. `home_banners` is hard delete only and re-sequences `display_order`.
4. Soft delete domains (`artists`, `artworks`, `courses`) use `deleted_at` update/restore only.
5. All API writes must use parameter binding (`?`) with mysql2.

## Artwork Media Policy (Current Phase)
- Upload infra is deferred.
- Artwork media URL fields (`photo_day_url`, `photo_night_url`, `audio_url_ko`, `audio_url_en`) are auto-resolved server-side with mock URLs when client omits them.
