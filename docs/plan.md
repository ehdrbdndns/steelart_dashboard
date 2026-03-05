# Plan: Artwork CRUD + `artwork_festivals` 동기화

작성일: 2026-03-05  
대상 저장소: `/Users/donggyunyang/code/steelart_dashboard`

## 0) 계획 수립 근거 (실코드/실DB 확인)

본 계획은 구현 전에 실제 코드/DB를 확인하고 작성했다.

확인한 서버/클라이언트 파일:
- `src/lib/server/validators/admin.ts`
- `src/app/api/admin/artworks/route.ts`
- `src/app/api/admin/artworks/[id]/route.ts`
- `src/app/api/admin/artworks/[id]/soft-delete/route.ts`
- `src/app/api/admin/artworks/[id]/restore/route.ts`
- `src/components/admin/artworks-form.tsx`
- `src/app/admin/artworks/page.tsx`
- `src/app/admin/artworks/[id]/page.tsx`
- `src/app/admin/artworks/new/page.tsx`
- `src/app/api/admin/courses/[id]/items/route.ts`
- `src/components/admin/course-items-editor.tsx`
- `src/app/api/admin/users/[id]/route.ts`
- `src/lib/server/tx.ts`

확인한 문서/스크립트 파일:
- `scripts/export-db-schema.mjs`
- `scripts/seed-mock-data.mjs`
- `docs/db-schema.sql`
- `docs/db-contract.md`
- `docs/admin-backoffice.md`
- `docs/research.md`

실DB 확인 결과:
- 테이블명: `artwork_festivals` (요청 표현 ArtworkFestivalYear에 해당)
- DDL 핵심:
  - `id` bigint PK
  - `artwork_id` bigint NOT NULL
  - `year` varchar(10) NOT NULL
  - `created_at` datetime
  - `UNIQUE (artwork_id, year)`
  - FK: `artwork_id -> artworks.id ON DELETE CASCADE`
- 현황: `artwork_festivals` 데이터 0건

## 1) 사용자 메모 반영 사항

- 작업 브랜치는 **현재 브랜치에서 진행**
  - 현재 브랜치: `codex/feat/artwork-images-backoffice-refactor`
- 최종 검증은 **Playwright headed(비-headless)** 로 수행
- PR은 **기존 PR(#4)에 덧붙여 업데이트**
- PR 스크린샷은 **기존 이미지 교체 방식**으로 갱신
- 이번 단계는 **문서/계획 업데이트만 수행**하고 구현은 시작하지 않음

## 2) 목표

Artwork CRUD 시 `artwork_festivals`가 함께 CRUD되도록 백오피스를 확장한다.

목표 상태:
- 생성: 작품 생성 시 `festival_years[]` 저장
- 조회: 작품 단건/목록에서 축제연도 확인 가능
- 수정: 작품 수정 시 `festival_years[]` 동기화
- 삭제/복구: soft delete/restore와 충돌 없이 유지

## 3) 적용 정책 (계약 초안)

## 3.1 Payload 계약
- create/update payload에 `festival_years: string[]` 추가
- 정책:
  - trim 적용
  - 빈 문자열 제거
  - 중복 제거
  - 기본 포맷: `^\d{4}$` (예: `2024`)
  - 빈 배열 허용

## 3.2 Response 계약
- `GET /api/admin/artworks/:id`
  - `festival_years: string[]` 포함
- `GET /api/admin/artworks`
  - `festival_years_summary`(예: `2024, 2023`) 또는 배열 반환
  - 1차 구현은 목록 가독성/쿼리 비용 관점에서 summary 문자열 우선

## 3.3 트랜잭션 정책
- `artworks` 본문, `artwork_images`, `artwork_festivals` 저장은 동일 트랜잭션으로 처리
- 수정은 list replacement 전략 적용:
  - `DELETE FROM artwork_festivals WHERE artwork_id = ?`
  - 정규화된 `festival_years` 재insert

## 4) 상세 작업 단계

## Step 0. 브랜치 전략 [x]
- [x] 현재 브랜치에서 진행
- [x] 새 브랜치 생성 없음
- [x] 작업 브랜치: `codex/feat/artwork-images-backoffice-refactor`

## Step 1. Validator/타입 반영 [x]
- 대상: `src/lib/server/validators/admin.ts`
- [x] `artworkPayloadSchema`에 `festival_years` 추가
- [x] `artworkUpdatePayloadSchema`에 `festival_years` 추가
- [x] trim/중복제거/연도포맷 검증 반영

산출물:
- 서버 입력계약 차원에서 축제연도 품질 보장

## Step 2. Artwork 목록 API 확장 [x]
- 대상: `src/app/api/admin/artworks/route.ts`
- [x] 목록 SQL에 `artwork_festivals` 집계 join 추가
- [x] 응답 타입에 `festival_years_summary`(또는 배열) 추가
- [x] 기존 필터/정렬/페이지네이션/대표이미지 로직 유지

쿼리 방향:
- `GROUP_CONCAT(year ORDER BY CAST(year AS UNSIGNED) DESC)` 기반 summary 생성

## Step 3. Artwork 생성 API 확장 [x]
- 대상: `src/app/api/admin/artworks/route.ts`
- [x] 생성 트랜잭션에 `artwork_festivals` insert 추가
- [x] insert 전 `festival_years` 정규화(중복 제거)
- [x] 생성 응답에 `festival_years` 포함

## Step 4. Artwork 단건/수정 API 확장 [x]
- 대상: `src/app/api/admin/artworks/[id]/route.ts`
- [x] GET 응답에 `festival_years[]` 포함
- [x] PUT에서 축제연도 replacement 적용
- [x] `artworks + artwork_images + artwork_festivals`를 한 트랜잭션으로 유지

## Step 5. Artwork UI 반영 (shadcn 적극 활용) [x]
- 대상:
  - `src/components/admin/artworks-form.tsx`
  - `src/app/admin/artworks/[id]/page.tsx`
  - `src/app/admin/artworks/page.tsx`
- [x] 폼에 축제연도 다건 입력 UI 추가
  - 행 추가/삭제 또는 chip 입력
- [x] payload에 `festival_years[]` 반영
- [x] 수정 초기값 바인딩
- [x] 목록에 축제연도 컬럼(summary) 추가
- [x] 기존 shadcn 스타일/구조 일관성 유지

## Step 6. 연계 코드 회귀 확인 [x]
- 대상:
  - `src/app/api/admin/courses/[id]/items/route.ts`
  - `src/components/admin/course-items-editor.tsx`
  - `src/app/api/admin/users/[id]/route.ts`
- [x] Artwork 응답 확장 후 타입/사용부 영향 확인
- [x] 기존 기능 회귀 없음 확인

## Step 7. 문서/시드 동기화 [x]
- 대상:
  - `scripts/export-db-schema.mjs`
  - `docs/db-schema.sql`
  - `docs/db-contract.md`
  - `docs/admin-backoffice.md`
  - `docs/research.md`
  - `scripts/seed-mock-data.mjs`(선택)
- [x] schema export 대상에 `artwork_festivals` 포함
- [x] 운영 문서에 제작연도 vs 축제연도 역할 분리 명시
- [x] 필요 시 mock seed 축제연도 데이터 추가

## Step 8. 검증 [x]

## 8.1 정적 검증
- [x] `pnpm exec tsc --noEmit` (작업 중 지속 실행)
- [x] `pnpm lint`
- [x] `pnpm build`

## 8.2 E2E 검증 (Playwright headed)
- [x] 로그인
- [x] `/admin/artworks/new`: 축제연도 2~3개 입력 후 생성 성공
- [x] `/admin/artworks/:id`: 축제연도 추가/삭제 후 저장 성공
- [x] `/admin/artworks`: 축제연도 컬럼 노출 확인
- [x] soft delete/restore 후 축제연도 유지 확인

## Step 9. Git/PR 업데이트 [x]
- [x] 커밋/푸시 (현재 브랜치)
- [x] 기존 PR(#4) 본문 업데이트
  - `## 요약`
  - `## 변경내용`
  - `## 검증`
  - `## 스크린샷`
- [x] 스크린샷은 기존 파일 교체 방식으로 갱신
  - 작품 생성(축제연도 입력)
  - 작품 수정(축제연도 변경)
  - 작품 목록(축제연도 표시)

## 5) 완료 기준 (DoD)

- [x] Artwork create/update에 `artwork_festivals` 동기화 반영
- [x] Artwork detail/list에서 축제연도 확인 가능
- [x] 폼에서 축제연도 CRUD 가능
- [x] soft delete/restore 충돌 없음
- [x] 문서/스키마 export 동기화 완료
- [x] 타입체크/린트/빌드 통과
- [x] Playwright headed E2E 통과
- [x] 기존 PR 업데이트 + 스크린샷 교체 완료
