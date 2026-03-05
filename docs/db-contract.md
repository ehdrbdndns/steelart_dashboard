# DB Contract (Backoffice MVP)

## Source of Truth
- This contract is tied to `docs/db-schema.sql` generated from `SHOW CREATE TABLE`.
- Refresh command: `pnpm db:schema:export`.

## Covered Tables
- `artists`
- `artworks`
- `artwork_images`
- `artwork_festivals`
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
8. Artwork images are managed in `artwork_images` (1:N to `artworks`) and are replaced as a list on artwork save.
9. Artwork festival years are managed in `artwork_festivals` (1:N to `artworks`) and are replaced as a list on artwork save.

## Artwork Media Policy (Current Phase)
- Upload uses S3 presigned URL (`POST /api/admin/uploads/presign`).
- Artwork image fields are stored in `artwork_images.image_url` (not in `artworks` table).
- Artwork create requires:
  - `images[]` (minimum 1)
  - `audio_url_ko`
  - `audio_url_en`
- Artwork edit uses list replacement for images:
  - incoming `images[]` becomes the new image set for the artwork.
- Artwork edit may omit audio URL fields; omitted values retain the current DB value.
- Artwork create/update includes `festival_years[]`:
  - values are trimmed and de-duplicated.
  - year format is `YYYY`.
  - save uses replacement on `artwork_festivals`.

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
