# Plan: ArtworkImages 도입에 따른 Artwork 백오피스 전환

작성일: 2026-03-04  
대상 저장소: `/Users/donggyunyang/code/steelart_dashboard`

## 0) 계획 수립 근거 (실코드 확인)

본 계획은 구현 전에 아래 실제 파일을 읽고 작성했다.
- Artwork UI:  
  `src/app/admin/artworks/page.tsx`, `src/app/admin/artworks/new/page.tsx`, `src/app/admin/artworks/[id]/page.tsx`, `src/components/admin/artworks-form.tsx`
- Artwork API:  
  `src/app/api/admin/artworks/route.ts`, `src/app/api/admin/artworks/[id]/route.ts`, `src/app/api/admin/artworks/[id]/soft-delete/route.ts`, `src/app/api/admin/artworks/[id]/restore/route.ts`
- 연계 로직:  
  `src/components/admin/course-items-editor.tsx`, `src/app/api/admin/courses/[id]/items/route.ts`, `src/app/api/admin/users/[id]/route.ts`
- 공통 검증/업로드:  
  `src/lib/server/validators/admin.ts`, `src/app/api/admin/uploads/presign/route.ts`, `src/components/admin/file-upload-field.tsx`
- 문서/시드:  
  `docs/db-schema.sql`, `docs/db-contract.md`, `docs/admin-backoffice.md`, `docs/research.md`, `scripts/seed-mock-data.mjs`, `scripts/seed-users-realistic.mjs`

## 1) 작업 원칙

## 1.1 브랜치 (시작 단계 필수)
- [x] 새 브랜치 생성 후 작업 시작
- 브랜치명: `codex/feat/artwork-images-backoffice-refactor`
- 명령: `git checkout -b codex/feat/artwork-images-backoffice-refactor`

## 1.2 작업 범위
- 이번 작업은 **Artwork 테이블 변경 대응용 백오피스/관리 API/연계 API/문서/시드**까지 포함
- DB DDL 자체는 본 저장소 코드 변경 범위 밖이지만, 코드 반영 전 스키마 정합성은 반드시 검증

## 1.3 검증/PR 원칙
- 최종 E2E는 반드시 **Playwright(요청 표현: Playwrite) headed(비-headless)** 로 수행
- 완료 시 PR 템플릿(`.github/pull_request_template.md`)으로 작성
- 기능별 스크린샷을 PR 본문에 첨부

## 1.4 UI 구현 원칙 (shadcn 적극 활용)
- Artwork UI 개편 시 기본 HTML 위젯 위주 구현을 지양하고, `shadcn/ui` 컴포넌트를 우선 사용한다.
- 우선 적용 대상(예시):
  - 입력/검증: `Input`, `Textarea`, `Select`, `Button`, `Label`
  - 레이아웃/구조: `Card`, `Separator`, `Tabs`, `Dialog`(필요 시)
  - 상태 표현: `Badge`, `Alert`(또는 프로젝트 내 동일 역할 컴포넌트)
  - 리스트/테이블: 프로젝트의 기존 테이블 스타일과 `shadcn` 패턴을 일관되게 유지
- 목표:
  - 시각적 일관성 확보
  - 접근성/상태표현(에러, 로딩, 비활성) 표준화
  - 유지보수 시 컴포넌트 재사용성 극대화

## 2) 변경 목표

현재 `artworks.photo_day_url`, `artworks.photo_night_url` 중심 구조를,
`artwork_images`(1:N) 기반 구조로 전환한다.

목표 상태:
- Artwork는 여러 장의 이미지를 가질 수 있음
- 생성/수정 UI에서 이미지 다건 업로드/정렬/삭제 가능
- Artwork API가 이미지 목록을 함께 다룸
- Artwork를 참조하는 코스/유저 연계 로직이 새 구조와 충돌 없이 동작

## 3) 현재 코드 기준 문제점

1. Artwork 생성/수정 payload가 `photo_day_url`, `photo_night_url`에 강결합
2. `artworks` INSERT/UPDATE SQL이 day/night 컬럼을 직접 다룸
3. 폼도 이미지 2개 고정 필드로 설계됨 (`FileUploadField` 2개)
4. `courses/:id/items` API가 `a.photo_day_url`을 직접 조회
5. 시드(`seed-mock-data.mjs`)도 artwork 생성 시 day/night URL 컬럼에 직접 insert

즉, DB에서 해당 컬럼이 제거되면 UI/API/시드가 모두 깨진다.

## 4) 목표 계약(안)

## 4.1 DB 전제
- `artworks.photo_day_url`, `artworks.photo_night_url` 제거됨
- 신규 `artwork_images` 테이블 존재
  - 최소 필요 컬럼(예시): `id`, `artwork_id`, `image_url`, `display_order`, `created_at`, `updated_at`
  - 권장 제약: `UNIQUE(artwork_id, display_order)`, `FK(artwork_id -> artworks.id)`

## 4.2 Artwork API 계약
- `GET /api/admin/artworks`
  - 목록 기본 필드 + 대표 이미지(첫 이미지) URL 포함
- `POST /api/admin/artworks`
  - 입력: 기존 기본 필드 + 오디오 2개 + `images[]`
- `GET /api/admin/artworks/:id`
  - 단건 기본 필드 + `images[]` 반환
- `PUT /api/admin/artworks/:id`
  - 기본 필드 수정 + 이미지 목록 동기화(전체 교체 방식)
- soft delete/restore API는 유지

## 4.3 UI 계약
- Artwork 생성/수정 폼에서 day/night 고정 이미지 필드 제거
- 다건 이미지 섹션 추가:
  - 이미지 업로드
  - 미리보기
  - 순서 변경
  - 삭제
- 생성 시 이미지 최소 1장 필수

## 5) 상세 작업 단계

## Step 0. 브랜치 생성 [x]
- [x] `codex/feat/artwork-images-backoffice-refactor` 브랜치 생성 후 진행

## Step 1. 스키마 정합성 점검 [x]
- [x] 실제 DB/스키마에서 아래 확인
  - [x] `artworks.photo_day_url` 없음
  - [x] `artworks.photo_night_url` 없음
  - [x] `artwork_images` 테이블 존재 및 FK/정렬 컬럼 확인
- [x] 스키마 불일치 시 코드 계약부터 확정(테이블 컬럼명 통일)

## Step 2. 서버 validator/타입 계약 수정 [x]
- 파일: `src/lib/server/validators/admin.ts`
- [x] `artworkPayloadSchema`에서 `photo_day_url`, `photo_night_url` 제거
- [x] 이미지 배열 스키마 추가 (`images: [{ image_url }]`, min 1)
- [x] `artworkUpdatePayloadSchema`도 동일 계약으로 정리
- [x] 생성/수정에서 이미지 최소 개수 정책 반영(최소 1장)

## Step 3. Artwork API 리팩터링 [x]
- 파일:
  - `src/app/api/admin/artworks/route.ts`
  - `src/app/api/admin/artworks/[id]/route.ts`
- [x] 목록 GET
  - [x] `artwork_images` 서브쿼리로 대표 이미지 URL 반환
  - [x] 기존 정렬/필터/페이지네이션 유지
- [x] 생성 POST
  - [x] `artworks` base insert
  - [x] `artwork_images` 다건 insert (트랜잭션)
  - [x] 생성 결과 반환 시 이미지 목록 포함
- [x] 단건 GET
  - [x] 작품 기본 row + 이미지 목록 조회
- [x] 수정 PUT
  - [x] base update
  - [x] 이미지 목록 동기화(기존 이미지 전체 교체 후 재insert, 트랜잭션)
  - [x] 최종 row + images 반환

## Step 4. Artwork 폼/페이지 UI 전환 [x]
- 파일:
  - `src/components/admin/artworks-form.tsx`
  - `src/app/admin/artworks/[id]/page.tsx`
  - `src/app/admin/artworks/page.tsx`
- [x] UI 구성은 `shadcn/ui` 컴포넌트 우선 원칙으로 구현
- [x] 폼에서 day/night 필드 제거
- [x] 다건 이미지 편집 UI 추가(업로드/삭제/정렬/미리보기)
- [x] 생성 시 이미지 최소 1장 미입력 시 에러 처리
- [x] 수정 초기 데이터에 `images[]` 바인딩
- [x] 목록 페이지 컬럼 정리(대표 이미지 노출 포함)

## Step 5. 연계 API/컴포넌트 대응 [x]
- 파일:
  - `src/app/api/admin/courses/[id]/items/route.ts`
  - `src/components/admin/course-items-editor.tsx`
- [x] `a.photo_day_url` 참조 제거
- [x] 대표 이미지 URL을 `artwork_images`에서 조회하도록 SQL 변경
- [x] 응답 타입 필드명 정리(`thumbnail_image_url`)
- [x] 프론트 타입 동기화

참고:
- `src/app/api/admin/users/[id]/route.ts`는 현재 title/category 중심이므로 직접 영향은 작지만 회귀 확인 대상에 포함

## Step 6. 업로드 경로/미디어 정책 정리 [x]
- 파일:
  - `src/app/api/admin/uploads/presign/route.ts`
  - `src/components/admin/artworks-form.tsx`
- [x] 업로드 폴더 규칙을 새 이미지 구조에 맞춰 정리(예: `artworks/images/*`)
- [x] 오디오 업로드 흐름(`audio_url_ko`, `audio_url_en`) 유지 검증
- [x] `FileUploadField` 재사용 시 미리보기/오류 UX 확인

## Step 7. 시드 스크립트 수정 [x]
- 파일:
  - `scripts/seed-mock-data.mjs`
  - 필요 시 `scripts/seed-users-realistic.mjs`
- [x] artwork insert에서 제거된 컬럼 참조 삭제
- [x] artwork_images insert 추가(작품당 다건 이미지)
- [x] 코스/좋아요/체크인 생성 흐름 회귀 확인

## Step 8. 문서 동기화 [x]
- 파일:
  - `docs/db-schema.sql` (재export)
  - `docs/db-contract.md`
  - `docs/admin-backoffice.md`
  - `docs/research.md`
- [x] Artwork 이미지 정책을 `artwork_images` 기준으로 업데이트
- [x] API 계약/검증 정책/운영 가이드 갱신

## Step 9. 검증 (로컬 + E2E) [x]

## 9.1 정적/빌드 검증
- [x] `pnpm exec tsc --noEmit`
- [x] `pnpm lint`
- [x] `pnpm build`

## 9.2 Playwright E2E (headless 금지, headed 필수)
- [x] 브라우저를 실제 띄워서 로그인
- [x] `/admin/artworks/new`:
  - [x] 다건 이미지 업로드 + 오디오 업로드 + 생성 성공
- [x] `/admin/artworks/:id`:
  - [x] 이미지 추가/삭제/정렬 후 저장 성공
- [x] `/admin/artworks`:
  - [x] 필터/목록/대표 이미지 노출 확인
  - [x] soft delete/restore 확인
- [x] `/admin/courses/:id`:
  - [x] 코스 아이템 목록 조회 및 작품 선택 추가 동작 확인

## Step 10. Git/PR 마무리 [x]
- [x] 변경사항 커밋 후 원격 push
- [x] PR 생성 및 템플릿 섹션 작성
  - `## 요약`
  - `## 변경내용`
  - `## 검증`
  - `## 스크린샷`
- [x] 기능별 스크린샷 첨부
  - [x] 작품 생성 화면(다건 이미지 입력)
  - [x] 작품 수정 화면(이미지 정렬/삭제)
  - [x] 작품 목록 화면(대표 이미지/필터)
  - [x] 코스 아이템 연계 화면
- [x] PR: `https://github.com/ehdrbdndns/steelart_dashboard/pull/4`

## 11) 완료 기준 (Definition of Done)

- [x] Artwork 생성/수정 API가 `artwork_images` 기반으로 동작
- [x] 백오피스 폼에서 다건 이미지 관리 가능
- [x] `photo_day_url`/`photo_night_url` 코드 참조 제거 완료
- [x] 코스 아이템 API/프론트 연계 정상
- [x] 시드/문서 동기화 완료
- [x] 타입체크/린트/빌드 통과
- [x] Playwright headed E2E 통과
- [x] PR 본문 + 기능별 스크린샷 업로드 완료

## 12) 범위 외

- 앱/웹 소비용 공개 API 스펙 개편
- 이미지 리사이징/CDN 무효화 파이프라인 도입
- 대규모 갤러리 UX 최적화(virtualized grid 등)
