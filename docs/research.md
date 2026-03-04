# SteelArt Dashboard 심층 분석 보고서

작성일: 2026-03-04  
분석 대상: `/Users/donggyunyang/code/steelart_dashboard`

## 1) 분석 목적과 범위

요청사항에 따라 저장소를 전체 재점검하고, 기존 `docs/research.md`와 현재 코드 간 불일치를 수정했다.

이번 분석에서 실제로 확인한 범위:
- 런타임/빌드/환경 변수/미들웨어/인증
- `src/app/admin/*` 전체 페이지 동작
- `src/app/api/admin/*` 전체 라우트(SQL/검증/에러 처리)
- `src/components/admin/*` 폼/에디터/업로드/요청 오버레이
- `docs/db-schema.sql`, `docs/db-contract.md`, `docs/admin-backoffice.md` 정합성
- `scripts/*`(schema export/seed/backfill)
- Home Banner 연관 코드 전수 확인(UI/API/DB/시드/네비게이션)

검증 실행:
- `pnpm lint` 통과
- `pnpm build` 통과

---

## 2) 전체 요약 (핵심 결론)

이 프로젝트는 **Next.js 15 App Router 기반 관리자 백오피스**다.

핵심 특성:
- 인증: NextAuth Credentials + ENV 단일 관리자 계정
- 보호: `middleware.ts`가 `/admin/*`, `/api/admin/*`를 토큰 기반 보호
- 데이터 접근: ORM 없이 `mysql2` raw SQL + 파라미터 바인딩
- 업로드: 서버 Presign 발급 후 브라우저가 S3에 직접 `PUT`
- 주요 도메인: `users`, `artists`, `artworks`, `courses`, `course_items`, `home_banners`
- 삭제 정책: artist/artwork/course는 soft delete, home_banners는 hard delete
- 순서 무결성: `course_items.seq`, `home_banners.display_order`를 트랜잭션 내 재시퀀싱

현재 상태 요약:
- 운영 백오피스로 동작 완성도 높음
- 과거 차트 템플릿 코드는 라우팅 상 미사용 상태로 잔존
- 기존 research 문서의 구버전 서술 일부를 현재 코드 기준으로 정정해 반영함

---

## 3) 기술 스택/런타임/코드 규모

### 프레임워크 및 라이브러리
- Next.js `15.0.6` (App Router)
- React `19 RC`
- TypeScript `strict`
- Tailwind CSS + shadcn/ui + Radix UI
- NextAuth `4.x` (Credentials)
- mysql2
- zod + react-hook-form
- AWS SDK v3 S3 + presigner
- dnd-kit (Course Items drag reorder)
- jotai/visactor(레거시 차트 코드 영역)

### 실행 스크립트 (`package.json`)
- `pnpm dev`, `pnpm build`, `pnpm start`, `pnpm lint`
- `pnpm db:schema:export`
- `pnpm db:seed:mock`
- `pnpm db:seed:users`
- `pnpm db:backfill:artist-profile`

### 환경 변수
- 인증: `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`
- DB: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- Seed/Mock: `MOCK_MEDIA_BASE_URL`, `ALLOW_MOCK_SEED`
- S3: `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`

### 코드량(재계산)
- `src` 내 `ts/tsx/css` 파일 수: 106
- 총 라인 수: 7,182 LOC

---

## 4) 요청 처리 흐름 (End-to-End)

1. 브라우저가 `/admin/*` 접근
2. `middleware.ts`가 토큰 유무 확인
3. 미인증:
- 페이지: `/admin/login` 리다이렉트
- API: `401 { error: { code:"UNAUTHORIZED" ... } }`
4. 로그인 성공 시 NextAuth JWT 세션 발급
5. 클라이언트가 `requestJson`/`requestJsonWithMeta`로 `/api/admin/*` 호출
6. API Route가 zod 검증 + SQL 실행
7. 응답 규약:
- 성공: `{ data, meta? }`
- 실패: `{ error: { code, message, details? } }`
8. 클라이언트는 실패 시 `error.message`를 그대로 표시

보조 동작:
- `/api/admin/*` 호출은 전역 pending 카운트 추적
- 300ms 초과 시 `AdminApiBlockingOverlay` 표시 및 body scroll 잠금

---

## 5) 인증/인가 상세

### NextAuth 설정 (`src/lib/auth/config.ts`)
- Credentials Provider
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`와 평문 비교
- 성공 시 `role: "admin"`를 token/session에 저장

### Middleware (`src/middleware.ts`)
- matcher: `/admin/:path*`, `/api/admin/:path*`
- 로그인 페이지(`/admin/login`)에서 토큰 존재 시 `/admin/artists` 이동
- 보호 경로에서 토큰 미존재 시 차단
- `authorized: () => true`로 두고 내부 로직에서 직접 분기

보안 관찰:
- role 기반 미들웨어 분기는 없음(토큰 유무 중심)
- 단일 관리자 모델에는 충분하지만 다중 권한 확장성은 낮음

---

## 6) 관리자 페이지 동작 요약

### 6.1 Users
- 목록: 닉네임/거주지/연령/언어 + 페이지네이션
- 요약 카드: 총 가입/오늘/7일/30일
- 상세: 기본정보, 생성 코스, 좋아요 코스/작품, 체크인

### 6.2 Artists
- 목록: query/type/deleted 필터 + 페이지네이션
- 생성/수정 폼 + `profile_image_url` 업로드
- 생성 시 프로필 이미지 필수, 수정 시 생략 가능(기존값 유지)
- soft delete/restore 지원

### 6.3 Artworks
- 목록: query/category/artist/zone/place/deleted 필터
- 생성/수정 폼 + 이미지2 + 오디오2 업로드
- 생성 시 4개 미디어 URL 필수
- 수정 시 미입력 미디어는 기존 DB 값 유지
- soft delete/restore 지원

### 6.4 Courses + Course Items
- 코스 CRUD + soft delete/restore
- 상세 페이지에서 Course Items 관리
- DnD reorder + 아이템 추가/삭제
- reorder/delete는 트랜잭션으로 `seq` 1..N 재정렬
- 체크인 존재 아이템 삭제 시 409 `CHECKIN_EXISTS`

### 6.5 Home Banners
- 홈 배너 추가(이미지 업로드/URL), 이미지 교체, 활성/비활성, 순서 변경, 삭제
- 삭제는 hard delete(복구 불가)
- 순서 변경 시 전체 배너 순서(payload 전체)를 서버에 전송

※ Home Banner는 아래 7장에서 별도로 심층 분석.

---

## 7) Home Banner 심층 분석 (핵심)

## 7.1 관련 파일 맵

- UI
- `src/app/admin/home-banners/page.tsx`
- 네비게이션
- `src/config/site.tsx`
- `src/components/nav/admin-top-nav.tsx`
- API
- `src/app/api/admin/home-banners/route.ts`
- `src/app/api/admin/home-banners/[id]/route.ts`
- `src/app/api/admin/home-banners/[id]/image/route.ts`
- `src/app/api/admin/home-banners/reorder/route.ts`
- 검증 스키마
- `src/lib/server/validators/admin.ts`
- DB 계약
- `docs/db-schema.sql` (`home_banners`)
- 시드
- `scripts/seed-mock-data.mjs` (`seedHomeBanners`)

## 7.2 데이터 모델/제약

`home_banners` 테이블 핵심:
- 컬럼: `id`, `banner_image_url`, `display_order`, `is_active`, `created_at`, `updated_at`
- 제약:
- `UNIQUE(display_order)` → 순번 중복 금지

의미:
- 배너는 독립 테이블로 artworks와 비연관
- 순서 중복은 DB 레벨에서도 차단

## 7.3 Admin UI 동작 상세 (`/admin/home-banners`)

초기 로딩:
- 배너 목록 호출: `GET /api/admin/home-banners`

UI 상태:
- `createBannerImageUrl`: 생성 대상 배너 이미지 URL
- `imageDrafts`: 배너별 이미지 교체 draft
- `isActive`: 생성 시 활성 여부(기본 `true`)
- `items`: 서버 배너 목록(`is_active`는 number로 처리)

사용자 액션:
1. 배너 추가
- 이미지 URL이 비어 있으면 클라이언트 에러
- 확인창 후 `POST /api/admin/home-banners` 요청
- 성공 시 목록 재조회

2. 활성/비활성 토글
- 확인창 후 `PATCH /api/admin/home-banners/:id` with `{ is_active }`
- 성공 시 목록 재조회

3. 순서 변경(위/아래)
- 클릭 시 클라이언트에서 배열 재배치
- `PATCH /api/admin/home-banners/reorder`에 **전체 항목 id+display_order(1..N)** 전달
- 실패 시 에러 표시 후 목록 재조회

4. 이미지 교체
- 배너별 입력/업로드 UI에서 이미지 URL 변경
- `PATCH /api/admin/home-banners/:id/image` 요청
- 성공 시 목록 재조회

5. 삭제
- 확인창 후 `DELETE /api/admin/home-banners/:id`
- 성공 시 목록 재조회

UI 제약/관찰:
- DnD 없이 위/아래 버튼 방식
- 배너 row마다 이미지 교체 UI가 렌더링되어 목록이 길어질수록 화면 밀도가 높아짐

## 7.4 API 상세

### A. `GET /api/admin/home-banners`

SQL:
- `home_banners` 단일 조회
- `ORDER BY display_order ASC`

반환 필드:
- 배너 기본 필드(`banner_image_url` 포함)

특성:
- `is_active` 필터 없음(활성/비활성 모두 반환)

### B. `POST /api/admin/home-banners`

입력 검증:
- `homeBannerCreateSchema`
- `{ banner_image_url: string(url), is_active: boolean }`

트랜잭션 처리:
1. `SELECT COALESCE(MAX(display_order), 0) + 1 ... FOR UPDATE`
2. 해당 순서로 insert
3. 생성 row 조회 후 반환

실패 케이스:
- URL 형식 오류: `400 VALIDATION_ERROR`

### C. `PATCH /api/admin/home-banners/:id`

입력 검증:
- path: `idParamSchema`
- body: `homeBannerUpdateSchema` (`{ is_active: boolean }`)

처리:
- `is_active`, `updated_at` 업데이트
- row 재조회
- row 없으면 404

### D. `PATCH /api/admin/home-banners/:id/image`

입력 검증:
- path: `idParamSchema`
- body: `homeBannerImageUpdateSchema` (`{ banner_image_url: string(url) }`)

처리:
- `banner_image_url`, `updated_at` 업데이트
- row 재조회
- row 없으면 404

### E. `DELETE /api/admin/home-banners/:id`

트랜잭션 처리:
1. 대상 row hard delete
2. 남은 배너 `display_order ASC FOR UPDATE` 조회
3. `display_order += 1000` 일괄 이동
4. 1..N으로 순차 재배치(`updated_at` 갱신)

특성:
- 삭제 후 순번 구멍이 남지 않도록 즉시 재시퀀싱
- 복구 API 없음

### F. `PATCH /api/admin/home-banners/reorder`

입력 검증:
- `homeBannerReorderSchema` (`items` 최소 1개)
- 중복 `id` 금지
- 중복 `display_order` 금지
- `display_order`는 1..N 연속값 강제

트랜잭션 처리:
1. DB 현재 배너 `id` 전체를 `FOR UPDATE`로 잠금 조회
2. 요청 payload가 "전체 배너"를 정확히 포함하는지 검사(개수/ID set 비교)
3. `display_order += 1000` 일괄 이동
4. payload 순서대로 목표 `display_order` 적용

보호 효과:
- 부분 reorder/누락 reorder를 차단해 무결성 유지
- stale payload를 서버가 거부할 수 있어 동시 수정 충돌 완화

## 7.5 정렬 무결성 알고리즘의 공통 패턴

Home Banner에서 순서 변경 관련 모든 경로는 다음 패턴을 공유한다.
- 현재 순번을 먼저 `+1000`으로 옮겨 unique 충돌 회피
- 이후 최종 순번(1..N)을 다시 부여

이 방식은 `UNIQUE(display_order)` 제약이 있는 환경에서 안전한 재정렬 패턴이다.

## 7.6 Home Banner와 다른 도메인의 연계

`uploads/presign` 연계:
- 홈 배너 이미지 업로드는 `folder=home-banners`를 허용하도록 확장됨
- MIME은 기존 정책대로 `image/*` 허용

네비게이션 연계:
- 사이드바 항목: `Home Banners`
- 상단 타이틀 path 매핑: `/admin/home-banners` -> `Home Banners`

시드 연계:
- `seed-mock-data.mjs`는 artwork 비의존으로 home banner 이미지 URL을 생성해 배너를 채움

## 7.7 Home Banner 운영 리스크/개선 포인트

1. `banner_image_url` nullable row 처리
- DB가 nullable이면 과거 데이터에서 null 가능성이 있어 UI fallback 처리 필요

2. 이미지 품질/규격 통제
- URL 기반 저장이므로 해상도/비율/용량 정책이 별도 강제되지 않음

3. row 단위 업로드 UI 밀도
- 목록이 길어질수록 이미지 교체 UI가 반복 렌더링되어 사용성 저하 가능

---

## 8) API 공통 레이어

공통 응답(`src/lib/server/api-response.ts`):
- 성공: `ok(data, meta?)`
- 실패: `fail(status, code, message, details?)`

공통 에러 매핑:
- ZodError -> `400 VALIDATION_ERROR`
- `ER_DUP_ENTRY` -> `409 CONFLICT`
- `ER_NO_REFERENCED_ROW_2` -> `400 REFERENCE_ERROR`
- 그 외 -> `500 INTERNAL_SERVER_ERROR`

모든 관리자 API route는 `dynamic = "force-dynamic"` 선언으로 캐시 회피.

---

## 9) DB 문서/코드 정합성

기준 문서:
- `docs/db-schema.sql`
- `docs/db-contract.md`
- `docs/admin-backoffice.md`

핵심 관찰:
1. `home_banners` 계약(하드 삭제 + 재시퀀싱)은 코드와 일치
2. 사용자 상세 API/UI 및 시드 스크립트의 활동 데이터 처리 흐름은 현재 코드와 일치
3. `docs/db-schema.sql`은 백오피스 핵심 8개 테이블 중심 스냅샷이라 `users`/likes 계열 테이블은 포함되지 않음
4. 하지만 코드상 users 도메인은 `users`, `course_likes`, `artwork_likes`, `course_checkins`, `courses`, `course_items`, `artworks`를 조회

---

## 10) 스크립트 분석

### `scripts/export-db-schema.mjs`
- 지정 8개 테이블 `SHOW CREATE TABLE`
- `docs/db-schema.sql` 갱신

### `scripts/seed-mock-data.mjs`
- non-production + `ALLOW_MOCK_SEED=true` 가드
- zones/places/artists/artworks/courses/course_items/home_banners 생성
- 배너 `display_order`와 코스 아이템 `seq` 재정렬 포함

### `scripts/seed-users-realistic.mjs`
- non-production + `ALLOW_MOCK_SEED=true` 가드
- 사용자 샘플 생성/업데이트
- 사용자 생성 코스 연결
- `course_likes`, `artwork_likes`, `course_checkins` 생성

### `scripts/backfill-artist-profile-image.mjs`
- non-production + `ALLOW_MOCK_SEED=true` 가드
- 빈 `artists.profile_image_url`을 기본 URL로 백필

---

## 11) 프론트 공통 인프라

### Admin API Client (`src/lib/client/admin-api.ts`)
- 공통 `fetch` 래퍼
- 응답 형태 강제 파싱
- `/api/admin/*` 자동 pending 추적

### 요청 차단 오버레이 (`AdminApiBlockingOverlay`)
- pending > 0 상태가 300ms 넘으면 표시
- 표시 중 body overflow 잠금

### 파일 업로드 (`FileUploadField`)
- `POST /api/admin/uploads/presign`
- presigned URL로 브라우저 직접 `PUT`
- 성공 시 `fileUrl`을 폼에 반영
- 이미지/오디오 미리보기 제공

---

## 12) 남아있는 템플릿/미사용 코드

현재 라우팅 기준 미사용 가능성이 높은 영역:
- `src/components/chart-blocks/*`
- `src/data/*`
- `src/lib/atoms.ts`

근거:
- 루트(`/`)는 `/admin/login`으로 redirect
- admin 페이지에서 차트 블록을 import하지 않음

---

## 13) 품질 상태 (재검증)

실행 결과:
- `pnpm lint`: 통과
- `pnpm build`: 통과

빌드 산출 관찰:
- `/admin/home-banners` 포함 admin 페이지는 정적 프리렌더 + 클라이언트 fetch 조합
- `/api/admin/*`는 동적 서버 처리
- middleware 번들 활성

---

## 14) 주요 리스크 및 개선 제안

1. 인증 비밀 관리
- 현재 관리자 비밀번호 평문 비교
- 개선: 해시 비교 또는 Secret Manager 기반 운용

2. Home Banner UX
- row 단위 이미지 교체 UI 밀도 개선(목록 길이 대응)
- 배너 생성/교체 UX 단순화(모달/드로어 분리) 검토

3. Home Banner 정책 명확화
- `banner_image_url` nullable 데이터 정리 및 not-null 강제 시점 정의
- 이미지 비율/해상도/용량 정책(업로드 전 검증) 정의

4. 문서 스키마 범위 명시 강화
- `docs/db-schema.sql`이 일부 테이블만 다룬다는 점을 상단에 더 명확히 고지

5. 레거시 차트 코드 정리
- 운영 백오피스와 무관한 템플릿 코드 분리/삭제

---

## 15) 최종 판단

이 저장소는 **SteelArt 운영 백오피스 MVP로 실동작 가능한 상태**다.

특히 Home Banner는:
- 추가/토글/재정렬/삭제 기능이 모두 구현되어 있고,
- DB 제약 + 트랜잭션 + 재시퀀싱으로 순서 무결성을 강하게 유지하며,
- 하드 삭제 정책과 운영 UI가 일관되게 맞춰져 있다.

이번 문서 수정에서 기존 `research.md`의 불일치(일부 구버전 상태값)를 최신 코드 기준으로 정정했고, Home Banner 연관 구현을 UI/API/DB/스크립트/운영 리스크까지 확장해 반영했다.
