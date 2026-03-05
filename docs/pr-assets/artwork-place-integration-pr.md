# PR: Artwork-Place 백오피스 통합 (운영 1:1 모델)

## Summary

- Artwork 생성/수정 폼에 Place 입력을 통합했습니다.
- Place 독립 메뉴를 제거하고 `/admin/places*` 경로는 artwork 경로로 리다이렉트되도록 변경했습니다.
- Artwork 수정 시 공유 Place 부작용을 막기 위해 clone-and-rebind 규칙을 적용했습니다.
- 주소 입력 시 geocode 자동 좌표 반영 + 수동 lat/lng 수정 + 카카오 지도 미리보기를 Artwork 폼에서 제공합니다.

## API Contract Changes

### Before
- Artwork create/update payload에 `place_id`(number) 필수

### After
- Artwork create/update payload에 `place`(object) 필수
  - `name_ko`, `name_en`, `address`, `zone_id`, `lat`, `lng`
- 서버가 place를 생성/수정하고 최종 `place_id`를 artwork에 반영

## Key Behavior

1. Artwork 생성
- 트랜잭션에서 place -> artwork -> images/festival 순으로 저장

2. Artwork 수정
- 현재 place를 다른 활성 artwork가 공유하면
  - 새 place row 생성 후 현재 artwork만 새 place로 재연결
- 공유가 없으면 기존 place row 업데이트

3. Place 경로 정책
- `/admin/places` -> `/admin/artworks`
- `/admin/places/new` -> `/admin/artworks/new`
- `/admin/places/:id` -> `/admin/artworks`

## Verification

- `pnpm exec tsc --noEmit`
- `pnpm lint`
- `pnpm build`
- Playwright manual scenarios PASS
  - Artwork 생성 + Place 동시 생성
  - 주소 자동 geocode + 수동 좌표 수정 + 지도 마커 표시
  - shared place clone-and-rebind 분기
  - Place 메뉴 제거/구 경로 redirect

## Screenshots

- `docs/pr-assets/e2e-01-nav-no-place-menu.png`
- `docs/pr-assets/e2e-02-artwork-place-geocode-map.png`
- `docs/pr-assets/e2e-03-artwork-create-success.png`
- `docs/pr-assets/e2e-04-place-route-redirect.png`
