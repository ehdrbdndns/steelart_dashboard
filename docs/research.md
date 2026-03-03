# SteelArt Dashboard 심층 분석 보고서

작성일: 2026-03-03  
분석 대상: `/Users/donggyunyang/code/steelart_dashboard`

## 1) 분석 목적과 범위

요청사항에 따라 저장소 전체를 깊게 읽고, 실제 동작 방식/세부 구현/운영 리스크까지 정리했다.

포함한 범위:
- 런타임/빌드/환경 설정
- App Router 페이지 및 클라이언트 동작
- `api/admin/*` 전 라우트의 쿼리/검증/에러 처리
- DB 계약 문서 및 SQL 스냅샷
- 시드/백필/스키마 export 스크립트
- 스타일/테마/남아있는 템플릿 코드
- 현재 빌드 가능성 검증

검증 실행:
- `pnpm lint` 통과
- `pnpm build` 통과

---

## 2) 전체 요약 (핵심 결론)

이 프로젝트는 **Next.js 15 App Router 기반의 관리자 백오피스 단일 애플리케이션**이다.

핵심 특징:
- 인증: `NextAuth Credentials` + `.env` 단일 관리자 계정
- 권한 보호: `middleware.ts`에서 `/admin/*`, `/api/admin/*` 보호
- 데이터 액세스: ORM 없이 `mysql2` raw SQL + 바인딩 파라미터
- 파일 업로드: 서버에서 S3 Presign URL 발급 후 브라우저가 직접 `PUT`
- 주요 도메인: `artists`, `artworks`, `courses`, `course_items`, `home_banners`, `users`
- 삭제 정책: 아티스트/작품/코스는 soft delete, 홈배너는 hard delete
- 순서 무결성: `course_items.seq`, `home_banners.display_order`는 트랜잭션으로 재정렬

현재 상태:
- 코드베이스는 관리자 기능 기준으로 동작 완성도가 높다.
- 다만, 과거 대시보드 템플릿(차트) 코드가 라우팅에서 사실상 미사용 상태로 남아 있다.
- 문서 스키마(`docs/db-schema.sql`)와 실제 코드에서 조회하는 일부 테이블 간 범위 차이가 있다.

---

## 3) 기술 스택 및 런타임 구성

### 프레임워크/라이브러리
- Next.js `15.0.6` (App Router)
- React `19 RC`
- TypeScript strict mode
- Tailwind CSS + shadcn/ui + Radix UI
- NextAuth `4.x` (Credentials)
- mysql2 (promise)
- zod
- react-hook-form
- jotai (주로 차트 예시 코드에서 사용)
- AWS SDK v3 S3 + presigner
- dnd-kit (course item drag reorder)

### 실행 스크립트 (`package.json`)
- `pnpm dev` / `pnpm build` / `pnpm start` / `pnpm lint`
- `pnpm db:schema:export`
- `pnpm db:seed:mock`
- `pnpm db:seed:users`
- `pnpm db:backfill:artist-profile`

### 환경 변수 (키)
- 인증: `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`
- DB: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- Mock/seed: `MOCK_MEDIA_BASE_URL`, `ALLOW_MOCK_SEED`
- S3: `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`

`src/lib/server/env.ts`에서 zod로 환경을 검증하고 캐시한다.

---

## 4) 디렉토리 구조와 코드 양

분석 시점 기준:
- `src` 내 코드 파일 수(ts/tsx/css): 106개
- 총 라인 수: 약 7,230 LOC

주요 디렉토리:
- `src/app`: 페이지 및 API 라우트
- `src/components/admin`: 관리자 폼/에디터/UI
- `src/lib/server`: DB, env, 응답, 트랜잭션, S3
- `src/lib/client`: API 호출 래퍼/요청 추적
- `src/data`, `src/components/chart-blocks`: 템플릿 차트 코드
- `scripts`: DB 스키마 export/시드/백필
- `docs`: 운영 계약 및 스키마 문서

특이점:
- `src/app/(dashboard)` 및 `src/app/ticket` 디렉토리는 현재 파일이 없다.
- 루트(`/`)는 `/admin/login`으로 즉시 redirect되어 차트 템플릿 UI는 라우트에서 사용되지 않는다.

---

## 5) 요청 처리 흐름 (End-to-End)

1. 브라우저가 `/admin/*` 접근
2. `src/middleware.ts`가 인증 토큰 여부 확인
3. 미인증이면 `/admin/login` 리다이렉트 (API는 JSON 401)
4. 로그인 성공 시 NextAuth JWT 세션 생성
5. 관리자 페이지는 클라이언트에서 `requestJson`/`requestJsonWithMeta`로 `/api/admin/*` 호출
6. API route는 zod 검증 후 mysql2 raw SQL 실행
7. 성공 응답은 `{ data, meta? }`, 실패는 `{ error: { code, message, details? } }`
8. 프론트는 에러 메시지 텍스트로 그대로 표시

부가 동작:
- `/api/admin/*` 호출 시 전역 pending 카운트 증가/감소
- 300ms 넘는 요청에는 `AdminApiBlockingOverlay`가 body scroll을 잠그며 표시됨

---

## 6) 인증/인가 상세

### NextAuth 구성
파일: `src/lib/auth/config.ts`
- Credentials Provider 사용
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`와 **평문 비교**
- 성공 시 `role: "admin"`를 token/session에 주입

### Middleware 보호 규칙
파일: `src/middleware.ts`
- 매처: `/admin/:path*`, `/api/admin/:path*`
- `/admin/login` + 토큰 존재 시 `/admin/artists`로 이동
- 보호 경로 + 토큰 없음:
  - 페이지: `/admin/login`으로 redirect
  - API: `401 UNAUTHORIZED` JSON

보안 관찰:
- 토큰 존재 여부 중심이며 role 기반 분기 없음
- 단일 관리자 계정 모델에는 충분하나 멀티역할 확장 시 미들웨어 강화 필요

---

## 7) 관리자 페이지 동작 상세

## 7.1 로그인
파일: `src/app/admin/login/page.tsx`
- `react-hook-form` + zod 이메일/비밀번호 검증
- `signIn("credentials", redirect:false)`
- 성공 시 `/admin/artists` 이동

## 7.2 Users
파일: `src/app/admin/users/page.tsx`, `src/app/admin/users/[id]/page.tsx`
- 목록: 닉네임/거주지/연령/언어 필터 + 페이지네이션
- 요약 카드: 총 가입자/오늘/7일/30일
- 상세: 사용자 기본정보 + 생성 코스 + 좋아요 코스/작품 + 체크인 + 선택 코스
- users 영역은 읽기 전용 (관리자에서 수정/삭제 API 없음)

## 7.3 Artists
파일: `src/app/admin/artists/*.tsx`, `src/components/admin/artists-form.tsx`
- 목록/검색/타입필터/삭제상태필터/페이지네이션
- 생성/수정 폼
- `profile_image_url` 업로드 컴포넌트 연동
- create 시 프로필 이미지 필수, edit 시 선택
- soft delete/restore 버튼 제공

## 7.4 Artworks
파일: `src/app/admin/artworks/*.tsx`, `src/components/admin/artworks-form.tsx`
- 목록 필터: query/category/artist/zone/place/deleted
- 생성/수정 폼 + 이미지2 + 오디오2 업로드
- create 시 4개 미디어 URL 필수, edit 시 미입력 필드는 기존값 유지
- soft delete/restore 지원

## 7.5 Courses + Course Items
파일: `src/app/admin/courses/*.tsx`, `src/components/admin/course-items-editor.tsx`
- 코스 기본 CRUD + soft delete/restore
- 상세 페이지에서 Course Items 편집
- Drag & Drop reorder (dnd-kit)
- 아이템 추가 시 `seq` 지정 가능 (미입력 시 마지막)
- 아이템 삭제 시 체크인 존재하면 409 차단

## 7.6 Home Banners
파일: `src/app/admin/home-banners/page.tsx`
- 배너 추가(작품 선택), 활성/비활성, 순서 변경, 삭제
- 삭제는 hard delete (복구 불가)
- 위/아래 버튼으로 순서 변경 후 서버에 전체 순서 PATCH

---

## 8) API 레이어 상세

모든 관리자 API는 `export const dynamic = "force-dynamic"`로 선언되어 캐시를 회피한다.

### 공통 응답/에러
파일: `src/lib/server/api-response.ts`
- 성공: `ok(data, meta?)`
- 실패: `fail(status, code, message, details?)`
- 공통 핸들러:
  - `ZodError` → 400 `VALIDATION_ERROR`
  - `ER_DUP_ENTRY` → 409 `CONFLICT`
  - `ER_NO_REFERENCED_ROW_2` → 400 `REFERENCE_ERROR`
  - 기타 → 500

### 엔드포인트 목록 (메서드)
- `/api/admin/artists` `GET, POST`
- `/api/admin/artists/[id]` `GET, PUT`
- `/api/admin/artists/[id]/soft-delete` `POST`
- `/api/admin/artists/[id]/restore` `POST`
- `/api/admin/artworks` `GET, POST`
- `/api/admin/artworks/[id]` `GET, PUT`
- `/api/admin/artworks/[id]/soft-delete` `POST`
- `/api/admin/artworks/[id]/restore` `POST`
- `/api/admin/courses` `GET, POST`
- `/api/admin/courses/[id]` `GET, PUT`
- `/api/admin/courses/[id]/soft-delete` `POST`
- `/api/admin/courses/[id]/restore` `POST`
- `/api/admin/courses/[id]/items` `GET, POST`
- `/api/admin/courses/[id]/items/reorder` `PATCH`
- `/api/admin/courses/[id]/items/[itemId]` `DELETE`
- `/api/admin/home-banners` `GET, POST`
- `/api/admin/home-banners/[id]` `PATCH, DELETE`
- `/api/admin/home-banners/reorder` `PATCH`
- `/api/admin/users` `GET`
- `/api/admin/users/[id]` `GET`
- `/api/admin/users/summary` `GET`
- `/api/admin/places` `GET`
- `/api/admin/zones` `GET`
- `/api/admin/uploads/presign` `POST`

### 도메인별 구현 포인트

#### Artists
- 목록 검색/필터/페이지네이션
- create/update 시 `profile_image_url` 처리
- 삭제는 `deleted_at` set, 복구는 `deleted_at = NULL`

#### Artworks
- artists/places/zones 조인된 목록 조회
- create는 미디어 4필드 필수
- update는 미디어 누락 시 기존 DB 값 유지

#### Courses
- 목록 조회 + `is_official` 필터
- create/update/soft-delete/restore

#### Course Items
- add/reorder/delete에 모두 트랜잭션 적용
- reorder 제약:
  - 전체 아이템 포함 필수
  - `seq`는 1..N 연속값
  - ID/seq 중복 금지
- delete 제약:
  - `course_checkins` 존재 시 409 `CHECKIN_EXISTS`
- 재정렬 알고리즘:
  - 먼저 `seq + 1000`으로 충돌 회피 후 목표 seq 재배치

#### Home Banners
- create 시 `MAX(display_order)+1`
- reorder도 전체 배너 포함 + 연속 display_order 검증
- delete 후 남은 배너를 1..N으로 재시퀀싱

#### Users
- 목록 필터 + 페이지네이션
- summary 집계 쿼리 별도
- 상세에서 다양한 활동 테이블 조인 조회

#### Presign Upload
- AWS env 미구성 시 `503 FEATURE_NOT_CONFIGURED`
- MIME 허용: `image/*`, `audio/*`
- 폴더 허용:
  - `artworks/*`
  - `artists/profile` 또는 `artists/profile/*`

---

## 9) 서버 유틸/인프라 레이어

### DB
파일: `src/lib/server/db.ts`
- mysql connection pool 전역 캐시(`global.__steelartPool`)
- 기본 pool 설정: `connectionLimit: 10`

### Transaction
파일: `src/lib/server/tx.ts`
- `withTransaction(callback)` 패턴
- begin/commit/rollback/release 일관 처리

### SQL helper
파일: `src/lib/server/sql.ts`
- soft delete 필터 clause 빌드
- 문자열 trim/empty 정리

### Validation
파일: `src/lib/server/validators/admin.ts`
- 아티스트/작품/코스/배너/업로드 payload 및 query schema 중앙화
- enum 도메인 강제

### S3 helper
파일: `src/lib/server/s3.ts`
- 파일명/폴더 sanitize
- key: `${folder}/${uuid()}-${safeFileName}`
- presign 만료: 5분

---

## 10) DB 문서 및 스키마 관찰

기준 문서:
- `docs/db-schema.sql`
- `docs/db-contract.md`
- `docs/admin-backoffice.md`

명시된 핵심 테이블:
- `artists`, `artworks`, `courses`, `course_items`, `course_checkins`, `home_banners`, `places`, `zones`

코드에서 추가로 사용하는 테이블:
- `users`
- `course_likes`
- `artwork_likes`
- `user_selected_courses`

관찰 포인트:
- `db-schema.sql`은 백오피스 핵심 테이블 중심 스냅샷이며, 사용자 활동 관련 테이블은 포함되지 않음
- 코드 기준으로는 users 상세 조회에 위 4개 테이블이 필수

---

## 11) 프론트 공통 레이어

### API 클라이언트
파일: `src/lib/client/admin-api.ts`
- fetch 공통화
- 성공/실패 응답 형식 강제 파싱
- `/api/admin/*` 요청 자동 pending 추적

### 요청 차단 오버레이
파일: `src/components/admin/admin-api-blocking-overlay.tsx`
- pending 요청이 300ms 이상이면 풀스크린 로딩
- visible 중에는 `body.style.overflow = hidden`

### 업로드 컴포넌트
파일: `src/components/admin/file-upload-field.tsx`
- Presign 요청 → S3 PUT → URL 폼값 반영
- image/audio 프리뷰 + 에러 표시

---

## 12) 스크립트 동작 분석

## 12.1 스키마 export
파일: `scripts/export-db-schema.mjs`
- DB 접속 후 지정 테이블 `SHOW CREATE TABLE`
- `docs/db-schema.sql` 갱신

## 12.2 mock seed
파일: `scripts/seed-mock-data.mjs`
- production 차단
- `ALLOW_MOCK_SEED=true` 필수
- zones/places/artists/artworks/courses/course_items/home_banners 생성
- banner/order, course_item seq 재정렬까지 수행

## 12.3 realistic user seed
파일: `scripts/seed-users-realistic.mjs`
- 사용자 샘플 데이터/활동 데이터 삽입
- `user_selected_courses`, likes, checkins 생성
- 사용자별 created course 연결

## 12.4 artist profile backfill
파일: `scripts/backfill-artist-profile-image.mjs`
- 빈 `profile_image_url`를 기본 URL로 일괄 채움
- production 차단 + `ALLOW_MOCK_SEED=true` 필요

---

## 13) 스타일/테마/디자인 시스템

- Tailwind CSS 변수 기반 색상 토큰 사용
- dark mode 지원 (`next-themes`)
- Google Font: `Gabarito`
- shadcn/ui 컴포넌트 일부 사용 (`button`, `dropdown-menu`, `popover`, `calendar`)

관찰 포인트:
- `components.json`의 `tailwind.css`가 `src/app/globals.css`를 가리키는데, 실제 CSS 엔트리는 `src/style/globals.css`다. (템플릿 생성 시점 잔재 가능성)

---

## 14) 남아있는 템플릿/미사용 코드

현재 라우팅 기준 미사용 가능성이 높은 영역:
- `src/components/chart-blocks/*`
- `src/data/*` (metrics/ticket 샘플 데이터)
- `src/lib/atoms.ts` (차트 date-range atom)

근거:
- 루트 페이지가 `/admin/login`으로 즉시 redirect
- 차트 블록 import를 실제 페이지에서 참조하지 않음

의미:
- 기능상 문제는 없으나 유지보수 관점에서 제거/분리 후보

---

## 15) 코드 품질/빌드 상태

실행 결과:
- `pnpm lint`: 경고/에러 없음
- `pnpm build`: 성공

빌드 결과 주요 포인트:
- 관리자 페이지 대부분 정적 생성 + 클라이언트 fetch 조합
- API routes는 동적 서버 처리
- 미들웨어 번들 포함

---

## 16) 리스크 및 개선 제안

1. 인증 자격 증명 저장 방식
- 현재 `ADMIN_PASSWORD` 평문 비교
- 개선: 해시 비교 또는 최소한 비밀관리 체계(Secret Manager) 강제

2. 권한 모델 확장성
- 현재는 token 유무 중심
- 개선: middleware/API에서 role 기반 세분화 가능 구조 마련

3. DB 문서 범위 불일치
- 코드 의존 테이블(users 활동 테이블들)이 `docs/db-schema.sql` 범위 밖
- 개선: 관리자 기능 기준 전체 의존 테이블을 계약 문서에 명시

4. 미사용 템플릿 코드
- chart-blocks/data/atoms가 운영 기능과 분리
- 개선: 제거 또는 `/legacy`로 이동해 코드 의도 명확화

5. API/폼 중복 패턴
- 목록 조회/에러 처리/필터 처리 패턴이 페이지마다 반복
- 개선: 공통 훅 또는 table/list abstraction 도입 검토

---

## 17) 최종 판단

이 저장소는 "SteelArt 운영 백오피스" 목적에 맞게 다음이 명확히 구현되어 있다.
- 인증 보호 경로
- 아티스트/작품/코스/배너 관리
- 코스 아이템 순서 무결성
- S3 Presign 업로드 연계
- 사용자 현황 및 활동 상세 조회

즉, **MVP 운영 백오피스로 실동작 가능한 상태**이며, 주된 후속 과제는 보안 고도화(인증/비밀), 문서-스키마 정합성, 미사용 코드 정리다.

