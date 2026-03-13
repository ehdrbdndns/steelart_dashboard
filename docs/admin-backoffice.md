# SteelArt Admin Backoffice MVP

## Implemented Areas

- Admin auth (`/admin/login`) with NextAuth Credentials and ENV single account
- Protected admin pages and `/api/admin/*` with middleware
- CRUD APIs and admin pages for `artists`, `artworks`, `courses`, `home_banners`
- Home banners are managed as an independent image domain (`banner_image_url`, no artwork FK)
- Home banner image replacement API: `PATCH /api/admin/home-banners/:id/image`
- `course_items` add/reorder/delete with id-preserving reorder and checkin 409 guard
- S3 presigned upload for artwork media (artwork images + `audio_url_ko`, `audio_url_en`)
- Artwork image dimension persistence (`image_width`, `image_height`) on create/edit/detail
- Artwork form image metadata capture from local file and manual URL input
- Artwork festival year management (`festival_years[]` -> `artwork_festivals`)
- Artist profile image upload (`profile_image_url`) with preview on artist form and list thumbnail
- Artwork form includes embedded Place fields (name/address/zone/lat/lng) and creates Place together
- Artwork form supports Kakao geocoding (`address` -> `lat`/`lng`) and map preview marker
- Artwork update uses shared-place guard: updates place directly when unshared, otherwise clones place and rebinds only current artwork
- `/admin/places*` routes are redirected to artwork pages (Place standalone menu removed)

## Environment Variables

- Core auth/db:
  - `NEXTAUTH_URL`, `NEXTAUTH_SECRET`
  - `ADMIN_EMAIL`, `ADMIN_PASSWORD`
  - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
  - `DB_SSL` (optional: `auto` default, or `true` / `false`)
- Kakao Maps:
  - `NEXT_PUBLIC_KAKAO_MAP_SDK_KEY` (Kakao Maps JavaScript SDK key, client-side)
  - `KAKAO_REST_API_KEY` (Kakao Local REST API key, server-side geocode)
  - Legacy fallback: `NEXT_PUBLIC_KAKAO_MAP_APP_KEY` is still read if SDK key is unset
- Mock seed mode:
  - `MOCK_MEDIA_BASE_URL` (optional)
  - `ALLOW_MOCK_SEED` (`true` required to run mock seed)
- AWS upload / fallback image fetch:
  - `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`

## Upload Policy

- `POST /api/admin/uploads/presign` returns `{ uploadUrl, fileUrl }`.
- Allowed MIME: `image/*`, `audio/*`.
- Upload folder:
  - `artworks/*` (artwork images/audio)
  - `artists/profile` or `artists/profile/*` (artist profile image)
  - `home-banners` or `home-banners/*` (home banner image)
- If AWS env is missing: `503 FEATURE_NOT_CONFIGURED`.
- Artwork create requires image list (`images[]`, min 1) + `audio_url_ko` + `audio_url_en`.
- Artwork edit replaces image list (`images[]`) and keeps existing audio URL when omitted.
- Artwork image payload shape is:

```ts
images: [
  {
    image_url: string;
    image_width: number;
    image_height: number;
  },
];
```

- Artwork image width/height is resolved from:
  - local file metadata after image upload
  - browser image loading for manual URL input
- If image dimensions cannot be resolved:
  - field-level error is shown
  - artwork form submit is blocked
- Artwork create/edit supports `festival_years[]` (trim + dedupe + `YYYY` validation).
- Artwork save replaces `artwork_festivals` rows for the target artwork.
- Artwork create/edit includes embedded `place` payload:
  - `place.name_ko`, `place.name_en`, `place.address`, `place.zone_id`, `place.lat`, `place.lng`
- Artist create requires `profile_image_url`; artist edit keeps existing URL when omitted.
- Home banner create requires `banner_image_url`; image can be replaced via dedicated PATCH API.

## Artwork Image Dimension Backfill

- Command: `pnpm db:backfill:artwork-image-dimensions`
- Behavior:
  - finds `artwork_images` rows with null width/height
  - attempts HTTP image fetch first
  - falls back to S3 `GetObject` when needed
- 2026-03-13 rerun result:
  - `target_rows=0`
  - `remaining_null_rows=0`

## Artist Profile Backfill

- Command: `pnpm db:backfill:artist-profile`
- Guard: `ALLOW_MOCK_SEED=true` and non-production only
- Behavior: fills empty `artists.profile_image_url` with `${MOCK_MEDIA_BASE_URL}/artists/profile-default.jpg`

## S3 CORS Checklist

1. Allow origins:
   - `http://localhost:3000`
   - your Vercel production domain
   - preview domains (for example `https://*.vercel.app`)
2. Allow methods: `PUT`, `GET`, `HEAD`
3. Allow headers: `Content-Type`, `x-amz-*`

## Runbook Checklist

1. Set `.env` values.
2. Run `pnpm db:schema:export`.
3. Run `pnpm db:backfill:artwork-image-dimensions` when introducing legacy data or after manual fixes.
4. Run `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`.
5. (Optional) Seed large mock dataset: `pnpm db:seed:mock`.
6. (Optional) Backfill artist profile image: `pnpm db:backfill:artist-profile`.
7. Start app: `pnpm dev`.

## Troubleshooting

- Login fails with `Invalid environment configuration`:
  - verify `ADMIN_PASSWORD` is set and matches the login input.
- `/api/admin/*` responds 401:
  - ensure logged-in session exists and `NEXTAUTH_SECRET` is set.
- presign upload fails in browser:
  - verify S3 bucket CORS and Vercel/localhost origins are configured.
- artwork image URL shows `이미지 크기를 읽지 못했습니다.`:
  - verify the URL points to an actual image
  - verify the image can be fetched from the browser or from S3 fallback for backfill
- Mock seed blocked:
  - set `ALLOW_MOCK_SEED=true`, and do not run in production.
- artwork form place geocode/map does not work:
  - verify `KAKAO_REST_API_KEY` is set
  - verify REST API is enabled for the app and key is valid in Kakao developer console
  - if SDK warning appears, verify `NEXT_PUBLIC_KAKAO_MAP_SDK_KEY` and allowed web domain (`localhost`/production)

## Notes

- `home_banners` uses hard delete by requirement.
- `home_banners` is independent from `artworks` and stores `banner_image_url` directly.
- `places` is no longer managed as a standalone admin menu; it is managed through artwork create/edit flow.
- `places` soft delete guard (`PLACE_IN_USE`) remains on API for data safety/compatibility.
- 작품 목록/코스 썸네일 API는 현재 `thumbnail_image_url`만 유지한다.
