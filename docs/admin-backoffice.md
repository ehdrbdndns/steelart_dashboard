# SteelArt Admin Backoffice MVP

## Implemented Areas
- Admin auth (`/admin/login`) with NextAuth Credentials and ENV single account
- Protected admin pages and `/api/admin/*` with middleware
- CRUD APIs and admin pages for `artists`, `artworks`, `courses`, `home_banners`
- `course_items` add/reorder/delete with id-preserving reorder and checkin 409 guard
- S3 presigned upload for artwork media (`photo_day_url`, `photo_night_url`, `audio_url_ko`, `audio_url_en`)

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
- Upload folder must start with `artworks/`.
- If AWS env is missing: `503 FEATURE_NOT_CONFIGURED`.
- Artwork create requires all 4 media URLs; artwork edit keeps existing URL when media fields are omitted.

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
5. Start app: `pnpm dev`.

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
- Existing template routes were removed and root redirects to admin entry.
