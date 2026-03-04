# Plan: Home Banner 독립 테이블 반영 (DB 선행 완료 가정)

작성일: 2026-03-04  
대상 저장소: `/Users/donggyunyang/code/steelart_dashboard`

## 0) 선행 가정 (중요)

아래 DB 변경은 **이미 사용자 측에서 수행 완료**된 것으로 가정한다.
- `home_banners.artwork_id` 컬럼 제거
- `home_banners.banner_image_url` 컬럼 추가
- `home_banners -> artworks` FK 제거(및 관련 unique/index 정리)

따라서 이 plan은 DB DDL 작업을 포함하지 않고, **코드/관리자 페이지/문서 동기화**에만 집중한다.

## 0.1) 작업 브랜치 (필수)

작업 시작 전에 아래 브랜치를 먼저 생성하고 해당 브랜치에서 진행한다.
- 브랜치명: `codex/feat/home-banner-image-decouple`
- 예시 명령: `git checkout -b codex/feat/home-banner-image-decouple`
- 상태: [x] 완료

## 0.2) 빌드 캐시 오류 선조치

현재 터미널에서 관측된 이슈:
- `Caching failed for pack: Error: ENOENT ... .next/server/vendor-chunks/clsx@2.1.1.js`

선조치 원칙:
- 기능 구현 전에 `.next` 캐시를 정리(또는 디렉토리 교체)하고 `pnpm build`로 정상 재생성 여부를 확인한다.
- 본 이슈는 빌드 산출물 캐시 불일치 성격이므로 코드 변경 없이 캐시 재생성으로 우선 해소한다.
- 상태: [x] 완료

## 1) 목표

Home Banner를 artworks 비의존 단일 도메인으로 전환하고, 관리자 `/admin/home-banners`를 이미지 업로드 기반 생성 흐름으로 바꾼다.

변경 후 목표 상태:
- Home Banner API는 `banner_image_url`을 기준으로 동작
- 관리자 Home Banner 생성 시 작품 선택 UI 제거
- 관리자 Home Banner 생성 시 배너 이미지 업로드 + 저장 가능
- 관리자에서 기존 배너 이미지를 전용 API로 교체 가능
- 기존 토글/순서변경/삭제 비즈니스 로직은 유지

## 2) 현재 코드베이스 확인 결과 (실제 파일 기준)

현재 코드(리포지토리 HEAD)는 아직 구 스키마를 참조한다.

- API
  - `src/app/api/admin/home-banners/route.ts`
    - GET: `home_banners` + `artworks` join
    - POST: `artwork_id` 기반 생성
  - `src/app/api/admin/home-banners/[id]/route.ts`
    - PATCH: `is_active` 토글
    - DELETE: hard delete + `display_order` 재시퀀싱
  - `src/app/api/admin/home-banners/reorder/route.ts`
    - 전체 배너 포함 검증 + reorder
- Validator
  - `src/lib/server/validators/admin.ts`
    - `homeBannerCreateSchema = { artwork_id, is_active }`
- Admin UI
  - `src/app/admin/home-banners/page.tsx`
    - 작품 목록 fetch(`/api/admin/artworks`) 후 선택 생성
- Upload Presign
  - `src/app/api/admin/uploads/presign/route.ts`
    - 허용 폴더: `artworks/*`, `artists/profile*` (home-banners 미허용)
- Seed
  - `scripts/seed-mock-data.mjs`
    - `seedHomeBanners(mockArtworkIds)` artwork 의존

즉, DB는 선행 변경 완료라고 가정하지만 코드가 아직 따라오지 못한 상태다.

## 3) 변경 설계 (코드 기준)

## 3.1 Home Banner API 계약 (최종)
- `GET /api/admin/home-banners`
  - 반환: `id, banner_image_url, display_order, is_active, created_at, updated_at`
- `POST /api/admin/home-banners`
  - 입력: `{ banner_image_url: string(url), is_active: boolean }`
  - `display_order`는 기존과 동일하게 `MAX+1`
- `PATCH /api/admin/home-banners/:id`
  - 기존처럼 `is_active` 토글 유지
- `PATCH /api/admin/home-banners/:id/image`
  - 입력: `{ banner_image_url: string(url) }`
  - 역할: 특정 배너의 이미지 경로만 교체
- `DELETE /api/admin/home-banners/:id`
  - 기존처럼 hard delete + 재시퀀싱 유지
- `PATCH /api/admin/home-banners/reorder`
  - 기존 검증/재시퀀싱 유지

## 3.2 관리자 UI 계약 (최종)
- 작품 선택 영역 제거
- 배너 이미지 업로드 필드 추가 (`FileUploadField` 재사용)
- 생성 payload를 `{ banner_image_url, is_active }`로 전환
- 목록의 artwork 컬럼을 banner image 컬럼으로 대체(썸네일 + URL)
- 목록에서 이미지 교체 액션을 제공하고 전용 PATCH API를 호출

## 4) 단계별 작업 계획

## Step 1. 선행 스키마 전제 검증 [x]

코드 반영 전, 실제 운영/개발 DB가 아래를 만족하는지 확인한다.
- `home_banners.banner_image_url` 존재
- `home_banners.artwork_id` 미존재

이 단계는 검증만 하며, DDL 실행은 본 plan 범위 밖.

## Step 2. 서버 validator 전환 [x]

파일:
- `src/lib/server/validators/admin.ts`

작업:
- `homeBannerCreateSchema`
  - 기존: `artwork_id`
  - 변경: `banner_image_url: z.string().url()`
- `homeBannerUpdateSchema`는 `is_active` 유지
- 전용 이미지 교체 schema 추가
  - 예: `homeBannerImageUpdateSchema = { banner_image_url: z.string().url() }`

## Step 3. Home Banner API 리팩터링 [x]

파일:
- `src/app/api/admin/home-banners/route.ts`
- `src/app/api/admin/home-banners/[id]/route.ts`
- `src/app/api/admin/home-banners/reorder/route.ts`

작업:
- `route.ts GET`
  - artworks join 제거
  - `home_banners` 단일 조회로 변경
- `route.ts POST`
  - insert 컬럼을 `banner_image_url`로 전환
- `[id]/route.ts`
  - PATCH/DELETE는 기존 로직 유지, 컬럼명 전환 영향만 반영
- `reorder/route.ts`
  - 기존 로직 유지 (컬럼 독립적)

## Step 4. 이미지 교체 전용 PATCH API 추가 [x]

파일:
- `src/app/api/admin/home-banners/[id]/image/route.ts` (신규)

작업:
- `PATCH` 메서드 구현
- path `id` + body `banner_image_url` 검증
- `banner_image_url`, `updated_at`만 업데이트
- 대상 row 미존재 시 `404 NOT_FOUND`
- 성공 시 업데이트된 배너 row 반환

## Step 5. 업로드 presign 경로 확장 [x]

파일:
- `src/app/api/admin/uploads/presign/route.ts`

작업:
- 허용 폴더에 `home-banners` 또는 `home-banners/*` 추가
- MIME 정책은 기존 `image/*` 규칙 재사용

## Step 6. 관리자 페이지 전환 [x]

파일:
- `src/app/admin/home-banners/page.tsx`

작업:
- 타입 변경
  - `Banner`에서 `artwork_id`, `title_ko` 제거
  - `banner_image_url` 추가
- 상태/조회 정리
  - `artworks`, `selectedArtworkId`, `fetchArtworks` 제거
- 생성 폼 변경
  - `FileUploadField` 추가 (`folder="home-banners"`, `accept="image/*"`)
  - `banner_image_url` 필수 검증
  - POST payload를 `{ banner_image_url, is_active }`로 전환
- 목록 표시 변경
  - artwork 컬럼 -> image 컬럼(미리보기/URL)
- 이미지 교체 동선 추가
  - 각 row에 이미지 업로드/입력 UI 노출
  - `PATCH /api/admin/home-banners/:id/image` 호출로 해당 row 이미지 교체
- 기존 액션 유지
  - 위/아래 reorder, 활성/비활성 토글, 삭제

## Step 7. Mock seed 전환 [x]

파일:
- `scripts/seed-mock-data.mjs`

작업:
- `seedHomeBanners(mockArtworkIds)` 의존 제거
- 홈 배너용 이미지 URL 생성 로직 사용
- insert를 `banner_image_url` 기반으로 변경

## Step 8. 문서 동기화 [x]

파일:
- `docs/db-schema.sql` (재export)
- `docs/db-contract.md`
- `docs/admin-backoffice.md`
- 필요 시 `docs/research.md` Home Banner 섹션

반영 내용:
- Home Banner가 artworks와 비연관 단일 테이블임을 명시
- Home Banner 생성 기준이 `banner_image_url`임을 명시

## Step 9. Git 반영 + PR 생성 [ ]

작업:
- 변경사항 커밋 후 원격 브랜치(`feat/home-banner-image-decouple`)에 push
- `.github/pull_request_template.md` 양식에 맞춰 PR 본문 작성
  - `## 요약`
  - `## 변경내용`
  - `## 검증`
  - `## 스크린샷`
- PR 생성 후 링크를 공유하고, 해당 PR 기준으로 리뷰/판단 가능 상태로 마무리

## 5) 배포/실행 순서 (DB 선행 완료 가정)

1. 브랜치 생성 + 캐시 선조치(0.1, 0.2)
2. 코드 변경 적용 (Step 2~7)
3. 로컬/스테이징 검증
4. 문서 동기화 (Step 8)
5. Git push + PR 생성 (Step 9)
6. 릴리즈

## 6) 검증 계획

## 6.1 API 검증
- `GET /api/admin/home-banners` 응답에 `banner_image_url` 존재
- `POST`에서 `banner_image_url` 누락/비정상 URL 시 400
- `POST` 성공 시 `display_order = max+1`
- `PATCH /api/admin/home-banners/:id/image`로 이미지 교체 가능
- `PATCH is_active`, `DELETE`, `reorder` 회귀 통과

## 6.2 업로드 검증
- `POST /api/admin/uploads/presign` with `folder=home-banners` 성공
- 업로드 완료 후 `banner_image_url` 미리보기 노출 확인

## 6.3 UI 검증
- `/admin/home-banners`에서 작품 선택 UI 미노출
- 이미지 업로드 + 생성 + 토글 + reorder + 삭제 동작 확인
- 기존 배너 이미지 교체 동작 확인(전용 PATCH API 경유)
- 생성 실패 메시지(빈 값/잘못된 URL) 확인

## 6.4 회귀 검증
- `pnpm lint`
- `pnpm build`
- artists/artworks/courses/users 페이지 기본 진입 및 리스트 조회
- 빌드 로그에 `Caching failed for pack` 재발 없음 확인

## 6.5 E2E 검증 방식 (Playwright Headed 필수)
- E2E 검증은 Playwright(요청 표현: Playwrite)로 수행한다.
- `headless` 모드는 사용하지 않고 실제 브라우저를 열어 검증한다.
- 최소 시나리오:
  - 로그인 -> `/admin/home-banners` 진입
  - 배너 생성(이미지 업로드 포함)
  - 배너 이미지 교체
  - 활성/비활성 토글
  - reorder
  - 삭제

## 7) 완료 기준 (Definition of Done)

- [x] 코드가 `banner_image_url` 기반 Home Banner API/UI로 동작
- [x] artworks 연동 없이 Home Banner 생성 가능
- [x] 이미지 교체 전용 PATCH API(`/api/admin/home-banners/:id/image`) 동작
- [x] presign API가 `home-banners/*` 허용
- [x] mock seed가 artworks 비의존으로 동작
- [x] 문서(`db-schema`, `db-contract`, `admin-backoffice`) 동기화
- [x] Playwright headed(e2e) 검증 완료
- [x] lint/build 통과
- [x] `Caching failed for pack` 오류 재발 없이 빌드 통과
- [ ] PR 템플릿 양식으로 PR 본문 작성 및 원격 PR 생성 완료

## 8) 범위 외

- Home Banner 공개용(앱/웹 소비) API 신설
- CDN 무효화/이미지 리사이징 파이프라인 도입
