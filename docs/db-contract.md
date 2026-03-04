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
4. `home_banners` is independent from `artworks` and uses `banner_image_url` only.
5. Soft delete domains (`artists`, `artworks`, `courses`) use `deleted_at` update/restore only.
6. All API writes must use parameter binding (`?`) with mysql2.
7. Home banner image replacement is handled by a dedicated endpoint (`PATCH /api/admin/home-banners/:id/image`).

## Artwork Media Policy (Current Phase)
- Upload uses S3 presigned URL (`POST /api/admin/uploads/presign`).
- Artwork create requires all media URL fields:
  - `photo_day_url`
  - `photo_night_url`
  - `audio_url_ko`
  - `audio_url_en`
- Artwork edit may omit media URL fields; omitted fields retain the current DB value.

## Artist Profile Image Policy
- Artists table includes `profile_image_url`.
- Artist create requires `profile_image_url`.
- Artist edit may omit `profile_image_url`; omitted value retains current DB value.
- Empty legacy profile URLs can be backfilled with:
  - `pnpm db:backfill:artist-profile`

## Home Banner Image Policy
- Home banners store `banner_image_url` directly (no FK to artworks).
- Home banner create requires `banner_image_url`.
- Home banner image can be updated via:
  - `PATCH /api/admin/home-banners/:id/image`
