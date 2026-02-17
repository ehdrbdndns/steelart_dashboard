# SteelArt Admin Backoffice MVP

## Implemented Areas
- Admin auth (`/admin/login`) with NextAuth Credentials and ENV single account
- Protected admin pages and `/api/admin/*` with middleware
- CRUD APIs and admin pages for `artists`, `artworks`, `courses`, `home_banners`
- `course_items` add/reorder/delete with id-preserving reorder and checkin 409 guard
- Mock media URL auto-injection for artworks (upload feature deferred)

## Environment Variables
- Core auth/db:
  - `NEXTAUTH_URL`, `NEXTAUTH_SECRET`
  - `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`
  - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- Mock mode:
  - `MOCK_MEDIA_BASE_URL` (optional)
  - `ALLOW_MOCK_SEED` (`true` required to run mock seed)
- AWS (optional in this phase):
  - `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`

## Current Upload Policy (Phase)
- `POST /api/admin/uploads/presign` returns `503 FEATURE_DISABLED`.
- Artwork media fields are auto-populated by server mock URLs when omitted.

## Runbook Checklist
1. Set `.env` values.
2. Run `pnpm lint` and `pnpm build`.
3. (Optional) Export schema: `pnpm db:schema:export`.
4. (Optional) Seed large mock dataset: `pnpm db:seed:mock`.
5. Start app: `pnpm dev`.

## Troubleshooting
- Login fails with `Invalid environment configuration`:
  - verify `ADMIN_PASSWORD_HASH` keeps escaped dollar signs (`\$2b\$10\$...`).
- `/api/admin/*` responds 401:
  - ensure logged-in session exists and `NEXTAUTH_SECRET` is set.
- Mock seed blocked:
  - set `ALLOW_MOCK_SEED=true`, and do not run in production.

## Notes
- `home_banners` uses hard delete by requirement.
- Existing template routes were removed and root redirects to admin entry.
