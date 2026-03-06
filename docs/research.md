# Artwork-Place 통합 운영 조사 보고서

작성일: 2026-03-05  
대상 저장소: `/Users/donggyunyang/code/steelart_dashboard`  
브랜치: `codex/feta/place-crud`

## 1) 조사 목적

- `artworks`와 `places`의 실제 데이터 관계를 확인한다.
- 백오피스에서 두 도메인을 어떻게 운영 UX로 통합했는지 확인한다.
- 주소 입력 시 위도/경도 자동 입력 + 지도 확인 UX(카카오 지도)의 구현/제약을 확인한다.

## 2) 조사 범위 (실제 확인 파일)

### DB/계약
- `docs/db-schema.sql`
- `docs/db-contract.md`

### API
- `src/app/api/admin/artworks/route.ts`
- `src/app/api/admin/artworks/[id]/route.ts`
- `src/app/api/admin/artworks/[id]/soft-delete/route.ts`
- `src/app/api/admin/artworks/[id]/restore/route.ts`
- `src/app/api/admin/places/geocode/route.ts`

### Validator/폼/관리 화면
- `src/lib/server/validators/admin.ts`
- `src/components/admin/artworks-form.tsx`
- `src/components/admin/places-form.tsx`
- `src/app/admin/artworks/page.tsx`
- `src/app/admin/artworks/new/page.tsx`
- `src/app/admin/artworks/[id]/page.tsx`
- `src/app/admin/places/page.tsx`
- `src/app/admin/places/new/page.tsx`
- `src/app/admin/places/[id]/page.tsx`
- `src/config/site.tsx`
- `src/components/nav/admin-top-nav.tsx`

## 3) 핵심 결론

1. DB 관계는 그대로 `artworks.place_id -> places.id` (N:1)이다.
2. 백오피스 운영 모델은 Artwork 중심 1:1처럼 동작한다.
- Place 독립 메뉴를 제거했다.
- Artwork 생성/수정 폼에서 Place 정보를 함께 입력한다.
3. 주소 입력 시 서버 geocode로 좌표를 자동 입력하고, 사용자는 위도/경도를 수동 수정할 수 있다.
4. 카카오 키는 용도가 분리되어야 한다.
- 지도 SDK 로드: `NEXT_PUBLIC_KAKAO_MAP_SDK_KEY` (client)
- 주소 geocode: `KAKAO_REST_API_KEY` (server)
5. Artwork 수정 시 공유 Place 부작용은 clone-and-rebind 전략으로 차단된다.

## 4) 데이터/계약 관점 상세

## 4.1 물리 모델

`docs/db-schema.sql` 기준:
- `artworks.place_id`는 `NOT NULL`
- `fk_artworks_place` FK 존재
- `places`는 `deleted_at` soft delete 도메인

의미:
- 물리 모델은 Place 1개를 여러 Artwork가 참조할 수 있다.

## 4.2 API 계약

`src/lib/server/validators/admin.ts` 기준:
- Artwork create/update payload는 `place_id`가 아니라 `place` 객체를 받는다.
- `place` 필드:
  - `name_ko`, `name_en`, `address`, `zone_id`, `lat`, `lng`

효과:
- 프론트에서 장소 선택(select) 대신 장소 상세를 직접 입력하는 운영 UX를 강제한다.

## 5) API 동작 상세

## 5.1 Artwork 생성 (`POST /api/admin/artworks`)

`src/app/api/admin/artworks/route.ts`:
- 트랜잭션 내부에서 순서대로 처리
  1. `places` insert
  2. `artworks` insert (`place_id = insertedPlace.insertId`)
  3. `artwork_images`, `artwork_festivals` insert
- 응답에 artwork + place + images + festival_years를 함께 반환

보장:
- 중간 실패 시 rollback 되어 orphan 데이터가 남지 않는다.

## 5.2 Artwork 수정 (`PUT /api/admin/artworks/:id`)

`src/app/api/admin/artworks/[id]/route.ts`:
- 현재 artwork의 `place_id` 조회
- 같은 place를 다른 활성 artwork가 참조 중인지 카운트
  - `COUNT(*) FROM artworks WHERE place_id = ? AND deleted_at IS NULL AND id <> ?`
- 분기:
  - 공유 없음: 기존 place row update
  - 공유 있음: 새 place insert 후 현재 artwork만 새 place로 재연결

보장:
- 공유 Place를 수정해도 다른 작품의 장소가 연쇄 변경되지 않는다.

## 5.3 Place API 사용 전략

- 백오피스 화면에서 Place 독립 CRUD는 제거했다.
- `POST /api/admin/places/geocode`는 Artwork 폼의 주소->좌표 자동 입력 용도로 유지한다.
- 기존 place CRUD API는 호환/운영 안정성을 위해 서버에 남겨둔다.

## 6) 백오피스 UI/UX 구성

## 6.1 내비게이션/경로

- 사이드바 `장소` 메뉴 제거 (`src/config/site.tsx`)
- 상단 타이틀 매핑에서도 `/admin/places` 제거 (`src/components/nav/admin-top-nav.tsx`)
- 구 경로 redirect:
  - `/admin/places` -> `/admin/artworks`
  - `/admin/places/new` -> `/admin/artworks/new`
  - `/admin/places/[id]` -> `/admin/artworks`

## 6.2 Artwork 생성/수정 폼의 Place UX

`src/components/admin/artworks-form.tsx`:
- Place 섹션 필드:
  - 이름(한/영), 권역, 주소, 위도, 경도
- 주소 입력 후 debounce 자동 geocode 호출
- `좌표 다시 찾기` 수동 재조회 버튼 제공
- geocode 성공 시 lat/lng 자동 반영
- lat/lng는 사용자가 수동 수정 가능
- 카카오 지도 SDK 로드 시 미리보기 지도 + 마커 표시

## 6.3 목록 UX

`/admin/artworks`:
- 설치 장소 컬럼/필터는 유지
- 장소 필터 옵션에 통합 생성된 place도 즉시 반영

## 7) 카카오 키 분리 규칙

`.env`/`.env.example` 기준:
- `NEXT_PUBLIC_KAKAO_MAP_SDK_KEY`
  - 카카오 JS SDK `<script>` 로드용
  - 잘못된 키/허용 도메인 미설정 시 지도 미리보기 실패
- `KAKAO_REST_API_KEY`
  - `POST /api/admin/places/geocode` 서버 호출용
  - 누락 시 geocode API가 명확한 에러 반환
- 레거시 fallback:
  - `NEXT_PUBLIC_KAKAO_MAP_APP_KEY`는 SDK 키가 없을 때만 보조 사용

## 8) 시나리오 검증 결과 (2026-03-05)

Playwright 실제 브라우저 플로우로 수동 검증했다.

1. Artwork 생성 + Place 동시 생성: PASS
- 주소 입력 -> 자동 좌표 반영 확인
- 위도 수동 수정 반영 확인
- 저장 후 목록 최상단 신규 행 확인
- DB 확인(검증 시점 기준): 생성 artwork(id=126)와 신규 place(id=22) 연결 확인

2. Shared Place 수정 분기(clone-and-rebind): PASS
- 공유 place(id=1)를 참조하던 artwork(id=1) 수정
- 저장 후 artwork(id=1)의 place_id가 새 id(23)로 변경
- 같은 기존 place를 쓰던 artwork(id=21)은 place_id=1 유지

3. Place 메뉴/구 경로 정책: PASS
- 사이드바에 장소 메뉴 없음
- `/admin/places` -> `/admin/artworks`
- `/admin/places/new` -> `/admin/artworks/new`
- `/admin/places/1` -> `/admin/artworks`

4. 정적 검증: PASS
- `pnpm exec tsc --noEmit`
- `pnpm lint`
- `pnpm build`

## 9) 증적 파일

- `docs/pr-assets/e2e-01-nav-no-place-menu.png`
- `docs/pr-assets/e2e-02-artwork-place-geocode-map.png`
- `docs/pr-assets/e2e-03-artwork-create-success.png`
- `docs/pr-assets/e2e-04-place-route-redirect.png`

## 10) 운영상 유의점

1. 물리 모델은 N:1이므로, direct SQL/외부 배치가 place를 공유하게 만들 수 있다.
2. 백오피스는 수정 시 clone-and-rebind로 이 리스크를 방어한다.
3. geocode 실패는 실사용에서 빈번할 수 있으므로, 수동 lat/lng 입력 UX를 계속 유지해야 한다.
4. 지도 미리보기 실패는 대부분 SDK 키/도메인 허용 설정 이슈다.
