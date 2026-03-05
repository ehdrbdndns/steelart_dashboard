# SteelArt Admin Backoffice MVP

## Implemented Areas
- Admin auth (`/admin/login`) with NextAuth Credentials and ENV single account
- Protected admin pages and `/api/admin/*` with middleware
- CRUD APIs and admin pages for `artists`, `artworks`, `courses`, `home_banners`
- Home banners are managed as an independent image domain (`banner_image_url`, no artwork FK)
- Home banner image replacement API: `PATCH /api/admin/home-banners/:id/image`
- `course_items` add/reorder/delete with id-preserving reorder and checkin 409 guard
- S3 presigned upload for artwork media (artwork images + `audio_url_ko`, `audio_url_en`)
- Artwork festival year management (`festival_years[]` -> `artwork_festivals`)
- Artist profile image upload (`profile_image_url`) with preview on artist form and list thumbnail

## Environment Variables
- Core auth/db:
  - `NEXTAUTH_URL`, `NEXTAUTH_SECRET`
  - `ADMIN_EMAIL`, `ADMIN_PASSWORD`
  - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- Mock seed mode:
  - `MOCK_MEDIA_BASE_URL` (optional)
  - `ALLOW_MOCK_SEED` (`true` required to run mock seed)
- AWS upload (required for presign):
  - `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`

## Upload Policy
- `POST /api/admin/uploads/presign` returns `{ uploadUrl, fileUrl }`.
- Allowed MIME: `image/*`, `audio/*`.
- Upload folder:
  - `artworks/*` (artwork images/audio)
  - `artists/profile` or `artists/profile/*` (artist profile image)
  - `home-banners` or `home-banners/*` (home banner image)
- If AWS env is missing: `503 FEATURE_NOT_CONFIGURED`.
- Artwork create requires image list(`images[]`, min 1) + `audio_url_ko` + `audio_url_en`.
- Artwork edit replaces image list(`images[]`) and keeps existing audio URL when omitted.
- Artwork create/edit supports `festival_years[]` (trim + dedupe + `YYYY` validation).
- Artwork save replaces `artwork_festivals` rows for the target artwork.
- Artist create requires `profile_image_url`; artist edit keeps existing URL when omitted.
- Home banner create requires `banner_image_url`; image can be replaced via dedicated PATCH API.

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
2. Run `pnpm lint` and `pnpm build`.
3. (Optional) Export schema: `pnpm db:schema:export`.
4. (Optional) Seed large mock dataset: `pnpm db:seed:mock`.
5. (Optional) Backfill artist profile image: `pnpm db:backfill:artist-profile`.
6. Start app: `pnpm dev`.

## Troubleshooting
- Login fails with `Invalid environment configuration`:
  - verify `ADMIN_PASSWORD` is set and matches the login input.
- `/api/admin/*` responds 401:
  - ensure logged-in session exists and `NEXTAUTH_SECRET` is set.
- presign upload fails in browser:
  - verify S3 bucket CORS and Vercel/localhost origins are configured.
- Mock seed blocked:
  - set `ALLOW_MOCK_SEED=true`, and do not run in production.

## Notes
- `home_banners` uses hard delete by requirement.
- `home_banners` is independent from `artworks` and stores `banner_image_url` directly.
- Existing template routes were removed and root redirects to admin entry.
