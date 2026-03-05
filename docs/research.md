# 영문 표기 전수 조사 보고서

작성일: 2026-03-05  
분석 대상: `/Users/donggyunyang/code/steelart_dashboard`

## 1) 목적

관리자 백오피스에서 사용자에게 노출되는 영어 표기를 한국어로 전환하기 위해,
현재 코드베이스의 영문 표기를 전수 조사하고 변경 기준을 정리한다.

## 2) 조사 범위

대상:
- `src/app/admin/*`
- `src/components/admin/*`
- `src/components/nav/*`
- `src/components/theme-toggle.tsx`
- `src/config/site.tsx`
- `src/lib/auth/config.ts` (로그인 관련 노출 문자열)

비대상(번역 비권장):
- API 경로, DB 컬럼명, SQL alias
- Zod schema key, TypeScript 타입/필드명
- enum 저장값 원문(예: `COMPANY`, `STEEL_ART`)

## 3) 영문 표기 현황

### 3.1 글로벌 네비게이션/브랜드

- `src/config/site.tsx`
  - `SteelArt Admin`
  - `Users`, `Artists`, `Artworks`, `Courses`, `Home Banners`
- `src/components/nav/admin-side-nav.tsx`
  - `SteelArt Admin`
- `src/components/nav/admin-top-nav.tsx`
  - `Artists`, `Artworks`, `Courses`, `Home Banners`, `Admin`

### 3.2 로그인

- `src/app/admin/login/page.tsx`
  - `SteelArt Admin Login`
  - `Email`, `Password`
- `src/lib/auth/config.ts`
  - `Admin Credentials`, `Email`, `Password`, `SteelArt Admin`

### 3.3 Users 화면

- `src/app/admin/users/page.tsx`
  - 페이지 타이틀: `Users`
  - 필터/옵션: `residency`, `age_group`, `language`, `POHANG`, `NON_POHANG`, `TEEN`, `20S`...
  - 컬럼: `nickname`, `residency`, `age_group`, `language`, `noti`, `joined_at`, `actions`
  - 값: `Y/N`
- `src/app/admin/users/[id]/page.tsx`
  - `Users`, `User #id`
  - 키/로그: `nickname`, `residency`, `age_group`, `language`, `notifications_enabled`, `joined_at`, `likes`, `liked_at`, `category`, `stamped_at`
  - 값: `Y/N`, `STEEL_ART/PUBLIC_ART`

### 3.4 Artists 화면

- `src/app/admin/artists/page.tsx`
  - 페이지 타이틀: `Artists`
  - 필터: `type 전체`, `COMPANY`, `INDIVIDUAL`
  - 컬럼: `profile`, `name_ko`, `name_en`, `type`, `deleted`, `actions`
  - 값: `Y/N`
- `src/components/admin/artists-form.tsx`
  - 선택값: `COMPANY`, `INDIVIDUAL`

### 3.5 Courses 화면

- `src/app/admin/courses/page.tsx`
  - 페이지 타이틀: `Courses`
  - 필터: `is_official 전체`
  - 컬럼: `title_ko`, `is_official`, `deleted`, `actions`
  - 값: `Y/N`
- `src/components/admin/courses-form.tsx`
  - 라벨: `title_ko`, `title_en`, `description_ko`, `description_en`, `is_official`
- `src/components/admin/course-items-editor.tsx`
  - `Course Items`, `Drag & drop`, `course_item_id`, `seq`

### 3.6 Home Banners 화면

- `src/app/admin/home-banners/page.tsx`
  - 페이지 타이틀: `Home Banners`
  - 체크박스 라벨: `is_active`
  - 이미지 alt: `banner-{id}`

### 3.7 테마 토글

- `src/components/theme-toggle.tsx`
  - `Light`, `Dark`, `System`, `auto`
  - `Toggle theme` (접근성 텍스트)

### 3.8 Artwork 화면

- 최근 작업으로 목록/수정 폼의 핵심 라벨은 상당수 한국어화됨.
- 잔여 점검 대상은 enum/코드값이 그대로 노출되는 경로 여부.

## 4) 한국어 전환 기준

### 4.1 원칙

1. 저장/계약 값은 유지한다.
2. 화면 렌더링 시점에 한국어 라벨로 변환한다.
3. 초기 운영 단계에서는 필요시 괄호 병기 허용 (`단체(COMPANY)`).

### 4.2 표준 매핑안

- 메뉴/페이지
  - `Users` -> `사용자`
  - `Artists` -> `작가`
  - `Artworks` -> `작품`
  - `Courses` -> `코스`
  - `Home Banners` -> `홈 배너`
  - `Admin` -> `관리자`
- 공통 필드
  - `Email` -> `이메일`
  - `Password` -> `비밀번호`
  - `actions` -> `관리`
  - `profile` -> `프로필 이미지`
  - `joined_at` -> `가입 일시`
- `is_official` -> `문화재단 인증 여부`
  - `is_active` -> `노출 활성화`
  - `Y/N` -> 문맥별 `예/아니오` 또는 `활성/비활성`
- 사용자 도메인
  - `residency` -> `거주지`
  - `age_group` -> `연령대`
  - `language` -> `언어`
  - `noti` -> `알림 수신`
  - `nickname` -> `닉네임`
- enum 표시
  - `COMPANY` -> `단체`, `INDIVIDUAL` -> `개인`
  - `POHANG` -> `포항`, `NON_POHANG` -> `포항 외`
  - `TEEN/20S/30S/40S/50S/60S/70_PLUS` -> `10대/20대/30대/40대/50대/60대/70대 이상`
  - `ko/en` -> `한국어/영어`
  - `STEEL_ART/PUBLIC_ART` -> `스틸아트/공공미술`
- 기타
  - `Light/Dark/System/auto` -> `라이트/다크/시스템/자동`
  - `Course Items` -> `코스 구성 작품`
  - `Drag & drop` -> `드래그 앤 드롭`
  - `seq` -> `순번`
  - `course_item_id` -> `코스 아이템 ID`

## 5) 우선순위

1순위:
- 글로벌 네비/탑바/페이지 타이틀
- 로그인 (`Email`, `Password`)
- Users/Artists/Courses 목록 컬럼/필터

2순위:
- Users 상세의 영문 키/활동 로그 문구
- Course Items 에디터 (`Course Items`, `Drag & drop`, `seq`)

3순위:
- 테마 토글(`Light/Dark/System/auto`)
- alt/accessibility 영문 텍스트(`profile`, `banner-{id}`)

## 6) 주의사항

- enum 원문값 자체를 변경하면 API/DB 호환성 문제가 발생할 수 있다.
- 반드시 UI 표시 문자열만 한국어화하고, 저장값/계약값은 유지한다.

## 7) 구현 반영 결과 (2026-03-05)

본 문서 기준 전환 범위를 실제 코드에 반영했다.

- 글로벌/네비게이션: `Users/Artists/Artworks/Courses/Home Banners/Admin` 표시를 한국어로 통일
- 로그인/테마: `Email/Password`, `Light/Dark/System/auto`, 접근성 라벨 한국어화
- Users: 목록/상세 라벨 및 enum 출력값 한국어화, `Y/N` -> `예/아니오`
- Artists: 목록/폼 라벨 한국어화, `COMPANY/INDIVIDUAL` 화면 표시를 `단체/개인`으로 매핑
- Courses: 목록/폼/코스 아이템 에디터 라벨 한국어화
- Home Banners: 페이지/상태/모달/접근성 텍스트 한국어화
- Artwork: 잔여 점검 포함, 화면 표시 enum을 한국어로 유지

검증 결과:
- 정적 검증: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build` 통과
- Playwright headed E2E: 로그인, 메뉴/탑바, Users/Artists/Courses/Home Banners/Artworks 조회 및 저장/삭제/복구 동작 확인

스크린샷(갱신):
- `docs/pr-assets/ko-login-page.png`
- `docs/pr-assets/ko-users-list.png`
- `docs/pr-assets/ko-user-detail.png`
- `docs/pr-assets/ko-artists-list.png`
- `docs/pr-assets/ko-artist-edit.png`
- `docs/pr-assets/ko-courses-list.png`
- `docs/pr-assets/ko-artworks-list.png`
- `docs/pr-assets/ko-artwork-edit.png`
- `docs/pr-assets/ko-home-banners-list.png`
- `docs/pr-assets/ko-home-banners-create-modal.png`
