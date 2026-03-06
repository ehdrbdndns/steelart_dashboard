# Plan: Artwork-Place 백오피스 통합(백오피스 1:1 운영 모델)

작성일: 2026-03-05  
최종 업데이트: 2026-03-05  
대상 저장소: `/Users/donggyunyang/code/steelart_dashboard`  
작업 브랜치: `codex/feta/place-crud`

## 0) 계획 수립 근거 (실제 코드 확인)

요청대로 계획 작성 전 실제 소스를 읽고 구조를 확인했다.

확인 파일:
- DB/계약: `docs/db-schema.sql`, `docs/db-contract.md`
- Artwork API/UI:
  - `src/app/api/admin/artworks/route.ts`
  - `src/app/api/admin/artworks/[id]/route.ts`
  - `src/components/admin/artworks-form.tsx`
  - `src/app/admin/artworks/page.tsx`
  - `src/app/admin/artworks/new/page.tsx`
  - `src/app/admin/artworks/[id]/page.tsx`
- Place API/UI:
  - `src/app/api/admin/places/route.ts`
  - `src/app/api/admin/places/[id]/route.ts`
  - `src/app/api/admin/places/geocode/route.ts`
  - `src/components/admin/places-form.tsx`
  - `src/app/admin/places/page.tsx`
  - `src/app/admin/places/new/page.tsx`
  - `src/app/admin/places/[id]/page.tsx`
- 공통/네비게이션/검증:
  - `src/lib/server/validators/admin.ts`
  - `src/config/site.tsx`
  - `src/components/nav/admin-top-nav.tsx`

## 1) 목표와 범위

1. Place 독립 관리 메뉴/페이지를 제거한다.
2. Artwork 생성/수정 시 Place 정보를 함께 입력하고 저장한다.
3. 주소 입력 시 lat/lng 자동 반영 + 수동 수정 + 지도 미리보기 UX를 제공한다.
4. 물리 모델 N:1은 유지하되, 백오피스 운영은 1:1처럼 안전하게 동작시킨다.

## 2) 상세 단계 및 완료 상태

## Step 1. 계약 재정의 (Validation + Payload)

상태: [x]

완료 내용:
- `src/lib/server/validators/admin.ts`
  - `artworkPayloadSchema`, `artworkUpdatePayloadSchema`를 `place` 객체 기반으로 전환
  - `place_id` 직접 입력 계약 제거
- `src/components/admin/artworks-form.tsx`
  - 폼 타입/submit payload를 `place` 객체 계약으로 동기화

## Step 2. Artwork 생성 API 통합 저장

상태: [x]

완료 내용:
- `src/app/api/admin/artworks/route.ts`
  - 트랜잭션에서 place insert -> artwork insert -> images/festival insert 순으로 저장
  - 응답에 `place` 포함

## Step 3. Artwork 수정 시 1:1 운영 전략 반영

상태: [x]

완료 내용:
- `src/app/api/admin/artworks/[id]/route.ts`
  - 공유 place 검사 쿼리 추가
  - 공유 없음: 기존 place update
  - 공유 있음: 신규 place 생성 + 현재 artwork만 rebind
  - GET/PUT 응답에 `place` 객체 반환

## Step 4. Artwork 폼에 Place 섹션 통합

상태: [x]

완료 내용:
- `src/components/admin/artworks-form.tsx`
  - 설치 장소 select(`place_id`) 제거
  - Place 입력 섹션 통합
  - 주소 debounce geocode + 수동 재조회 버튼
  - lat/lng 수동 수정 가능
  - 카카오 지도 미리보기/마커 렌더

## Step 5. Place 페이지/진입점 제거

상태: [x]

완료 내용:
- 메뉴/타이틀 제거:
  - `src/config/site.tsx`
  - `src/components/nav/admin-top-nav.tsx`
- 구 경로 redirect:
  - `src/app/admin/places/page.tsx` -> `/admin/artworks`
  - `src/app/admin/places/new/page.tsx` -> `/admin/artworks/new`
  - `src/app/admin/places/[id]/page.tsx` -> `/admin/artworks`

## Step 6. Artwork 목록 UX 동기화

상태: [x]

완료 내용:
- `/admin/artworks` 목록에서 장소 컬럼/필터 유지 확인
- Artwork 통합 생성으로 추가된 place가 목록/필터에 즉시 노출됨을 확인

## Step 7. Place API 정리 전략

상태: [x]

완료 내용:
- `POST /api/admin/places/geocode`는 유지
- places CRUD API는 호환/안정성 목적으로 유지
- 운영 UX에서는 places 화면 진입 제거로 역할 분리 완료

## Step 8. 문서/운영 가이드 업데이트

상태: [x]

완료 내용:
- `docs/research.md` 전면 갱신 (현재 구현/검증 기준)
- `docs/admin-backoffice.md` 정책/키/운영 내용 동기화
- `docs/db-contract.md` 통합 운영 규칙 반영
- 본 문서(`docs/plan.md`) 단계 완료 체크 반영

## Step 9. 검증 계획 실행

상태: [x]

검증 결과:
1. 정적 검증: PASS
- `pnpm exec tsc --noEmit`
- `pnpm lint`
- `pnpm build`

2. Playwright 직접 시나리오 검증: PASS
- Artwork 생성 시 Place 동시 생성 성공
- 주소 입력 시 자동 geocode 반영, 위도 수동 수정 반영, 지도 마커 표시
- 공유 Place 수정 시 clone-and-rebind 동작 확인
- Place 메뉴 제거 및 `/admin/places*` 리다이렉트 확인

3. DB 교차 확인: PASS
- 신규 artwork(id=126) <-> 신규 place(id=22) 연결 확인 (검증 시점 기준)
- 공유 분기 테스트 후 artwork(id=1) place_id=23, artwork(id=21) place_id=1 유지 확인 (검증 시점 기준)

증적 스크린샷:
- `docs/pr-assets/e2e-01-nav-no-place-menu.png`
- `docs/pr-assets/e2e-02-artwork-place-geocode-map.png`
- `docs/pr-assets/e2e-03-artwork-create-success.png`
- `docs/pr-assets/e2e-04-place-route-redirect.png`

## Step 10. PR 작성 및 리뷰 준비

상태: [x]

완료 내용:
- PR 본문에 포함할 항목 준비 완료
- PR 초안 문서 작성: `docs/pr-assets/artwork-place-integration-pr.md`
  - 변경 배경(Artwork-Place 통합 목적)
  - API 계약 before/after
  - shared place clone 규칙
  - 정적 검증 로그
  - Playwright 시나리오/스크린샷 링크

권장 PR 본문 템플릿:

```md
## Summary
- Artwork 생성/수정 폼에 Place 입력 통합
- Place 독립 메뉴 제거 및 구 경로 리다이렉트
- Artwork 수정 시 shared place clone-and-rebind 적용

## API Contract Changes
- Before: artwork payload에 `place_id` 필수
- After: artwork payload에 `place` 객체 필수 (`name/address/zone/lat/lng`)

## Verification
- pnpm exec tsc --noEmit
- pnpm lint
- pnpm build
- Playwright headed/manual scenarios PASS

## Screenshots
- docs/pr-assets/e2e-01-nav-no-place-menu.png
- docs/pr-assets/e2e-02-artwork-place-geocode-map.png
- docs/pr-assets/e2e-03-artwork-create-success.png
- docs/pr-assets/e2e-04-place-route-redirect.png
```

## 3) 리스크와 대응

1. 외부 배치/직접 SQL로 shared place가 다시 생길 수 있음
- 대응: 수정 API의 clone-and-rebind 방어 유지

2. geocode 실패 가능성
- 대응: 수동 lat/lng 입력 경로 유지

3. 지도 미리보기 실패(키/도메인 설정)
- 대응: SDK 키/REST 키 분리, 도메인 허용 정책 문서화
