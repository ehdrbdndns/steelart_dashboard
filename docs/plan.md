# Plan: 관리자 UI 영문 표기 한국어 전환 (표시 전용)

작성일: 2026-03-05  
대상 저장소: `/Users/donggyunyang/code/steelart_dashboard`

## 0) 계획 수립 근거

본 계획은 구현 전에 실제 코드 파일을 확인하고 작성했다.

## 0.1 주석 반영 사항

- 이번 작업은 **UI 표시 문자열 한국어화만 수행**한다.
- 내부 로직/API/DB/검증 스키마/저장 enum 값은 변경하지 않는다.
- 구현 시 diff 점검에서 `src/app/api/*`, `src/lib/server/*` 변경이 생기면 범위 이탈로 간주한다.
- 작업 브랜치는 `feat/` 접두사 브랜치에서 진행한다.

확인한 주요 파일:
- `src/config/site.tsx`
- `src/components/nav/admin-side-nav.tsx`
- `src/components/nav/admin-top-nav.tsx`
- `src/components/theme-toggle.tsx`
- `src/app/admin/login/page.tsx`
- `src/app/admin/users/page.tsx`
- `src/app/admin/users/[id]/page.tsx`
- `src/app/admin/artists/page.tsx`
- `src/components/admin/artists-form.tsx`
- `src/app/admin/courses/page.tsx`
- `src/components/admin/courses-form.tsx`
- `src/components/admin/course-items-editor.tsx`
- `src/app/admin/home-banners/page.tsx`
- `src/app/admin/artworks/page.tsx`
- `src/components/admin/artworks-form.tsx`
- `docs/research.md` (영문 표기 전수 조사 섹션)

## 1) 목표

관리자 화면에서 사용자에게 노출되는 영어/개발자 표기를 한국어로 전환한다.

핵심 목표:
- 메뉴/페이지 타이틀/컬럼/필터/버튼/상세 라벨을 한국어로 통일
- enum 저장값은 유지하고 화면에서만 한국어로 표시
- 기존 CRUD/API 동작은 100% 동일 유지

## 2) 절대 제약 (변경 금지)

이번 작업에서는 아래 항목을 절대 변경하지 않는다.

1. API/DB/스키마 계약
- API 경로, 요청/응답 key, 쿼리 파라미터 key
- DB 컬럼명/테이블명/SQL 구조
- Zod schema key와 서버 검증 로직

2. 저장값/내부 enum 값
- `COMPANY`, `INDIVIDUAL`
- `STEEL_ART`, `PUBLIC_ART`
- `POHANG`, `NON_POHANG`
- `TEEN`, `20S`, `30S`, `40S`, `50S`, `60S`, `70_PLUS`
- `ko`, `en`

3. 비즈니스 로직
- 생성/수정/삭제/복구 동작
- 정렬/페이지네이션/필터링 조건
- 권한/인증 흐름

## 2.1 범위 이탈 방지 체크

- 허용 변경 경로(원칙):
  - `src/app/admin/*`
  - `src/components/admin/*`
  - `src/components/nav/*`
  - `src/components/theme-toggle.tsx`
  - `src/config/site.tsx`
  - 문서(`docs/*`)
- 비허용 변경 경로(원칙):
  - `src/app/api/*`
  - `src/lib/server/*`
  - `scripts/*`

## 3) 전환 방식

기본 원칙:
- 화면 텍스트만 교체한다.
- 내부 값은 유지하고, UI 렌더링 시 매핑해 보여준다.

매핑 방식:
- 단순 고정 텍스트: 직접 한국어 문자열로 교체
- enum/코드값 출력: display helper 함수 또는 상수 매핑으로 한국어 노출

## 3.1 영문 표기별 한국어 치환안 (구현 기준)

아래는 실제 적용할 `영문 -> 한국어` 매핑이다.  
주의: 좌측은 "표시 문자열" 기준이며, 내부 저장값/요청값은 그대로 유지한다.

### A. 글로벌/네비게이션

- `SteelArt Admin` -> `SteelArt 관리자`
- `Admin` -> `관리자`
- `Users` -> `사용자`
- `Artists` -> `작가`
- `Artworks` -> `작품`
- `Courses` -> `코스`
- `Home Banners` -> `홈 배너`

### B. 로그인/테마

- `SteelArt Admin Login` -> `SteelArt 관리자 로그인`
- `Email` -> `이메일`
- `Password` -> `비밀번호`
- `Toggle theme` -> `테마 변경`
- `Light` -> `라이트`
- `Dark` -> `다크`
- `System` -> `시스템`
- `auto` -> `자동`

### C. Users 목록/상세

- `Users` -> `사용자`
- `User #` -> `사용자 #`
- `nickname` -> `닉네임`
- `residency` -> `거주지`
- `age_group` -> `연령대`
- `language` -> `언어`
- `noti` -> `알림 수신`
- `joined_at` -> `가입 일시`
- `actions` -> `관리`
- `notifications_enabled` -> `알림 수신 여부`
- `likes` -> `좋아요 수`
- `liked_at` -> `좋아요 시각`
- `category` -> `작품 유형`
- `stamped_at` -> `스탬프 시각`
- `Y` -> `예`
- `N` -> `아니오`

### D. Users enum 표시값

- `POHANG` -> `포항`
- `NON_POHANG` -> `포항 외`
- `TEEN` -> `10대`
- `20S` -> `20대`
- `30S` -> `30대`
- `40S` -> `40대`
- `50S` -> `50대`
- `60S` -> `60대`
- `70_PLUS` -> `70대 이상`
- `ko` -> `한국어`
- `en` -> `영어`

### E. Artists 목록/폼

- `Artists` -> `작가`
- `type 전체` -> `구분 전체`
- `profile` -> `프로필 이미지`
- `name_ko` -> `이름(한국어)`
- `name_en` -> `이름(영어)`
- `type` -> `구분`
- `deleted` -> `삭제 여부`
- `actions` -> `관리`
- `COMPANY`(표시) -> `단체`
- `INDIVIDUAL`(표시) -> `개인`
- alt `profile` -> alt `프로필 이미지`
- `Y` -> `예`
- `N` -> `아니오`

### F. Courses 목록/폼

- `Courses` -> `코스`
- `is_official 전체` -> `문화재단 인증 여부 전체`
- `title_ko` -> `코스명(한국어)`
- `title_en` -> `코스명(영어)`
- `description_ko` -> `설명(한국어)`
- `description_en` -> `설명(영어)`
- `is_official` -> `문화재단 인증 여부`
- `deleted` -> `삭제 여부`
- `actions` -> `관리`
- `Y` -> `예`
- `N` -> `아니오`

### G. Course Items 에디터

- `Course Items` -> `코스 구성 작품`
- `Drag & drop` -> `드래그 앤 드롭`
- `course_item_id` -> `코스 아이템 ID`
- `seq` -> `순번`
- placeholder `삽입 seq(선택)` -> `삽입 순번(선택)`

### H. Home Banners

- `Home Banners` -> `홈 배너`
- `is_active` -> `노출 활성화`
- alt `banner-{id}` -> alt `배너-{id}`

### I. Artwork 잔여 표기 (점검성)

- `title_en`(표시 노출 시) -> `작품명(영어)`
- `category`(표시 노출 시) -> `작품 유형`
- `STEEL_ART`(표시) -> `스틸아트`
- `PUBLIC_ART`(표시) -> `공공미술`

## 4) 상세 작업 단계

## Step 1. 글로벌 네비게이션/브랜드 한국어화 [x]

대상:
- `src/config/site.tsx`
- `src/components/nav/admin-side-nav.tsx`
- `src/components/nav/admin-top-nav.tsx`

작업:
- 메뉴명 `Users/Artists/Artworks/Courses/Home Banners` -> 한국어
- `Admin`, `SteelArt Admin` 노출 문구 한국어화
- TopNav 경로별 타이틀 반환값 한국어화

검증 포인트:
- 좌측 메뉴/상단 타이틀이 페이지 이동 시 일관된 한국어로 노출

## Step 2. 로그인/테마 텍스트 한국어화 [x]

대상:
- `src/app/admin/login/page.tsx`
- `src/components/theme-toggle.tsx`

작업:
- 로그인 헤더/필드 라벨 `Email`, `Password` 한국어화
- `Light/Dark/System/auto`, `Toggle theme` 한국어화

주의:
- `src/lib/auth/config.ts`의 provider 내부 문자열은 사용 경로 확인 후 필요 최소 범위만 조정
- 인증 로직 자체는 변경 금지

## Step 3. Users 화면 한국어화 [x]

대상:
- `src/app/admin/users/page.tsx`
- `src/app/admin/users/[id]/page.tsx`

작업:
- 페이지 타이틀/테이블 헤더/필터 라벨 한국어화
- `residency`, `age_group`, `language`, `noti`, `joined_at`, `actions` 교체
- 상세 페이지 키(`nickname`, `notifications_enabled`, `liked_at`, `stamped_at` 등) 교체
- `Y/N` 표기를 문맥에 맞는 한국어로 통일
- `category` 출력값은 한국어 매핑(`스틸아트/공공미술`)

주의:
- 필터 전송값(`POHANG`, `TEEN`, `ko` 등)은 유지

## Step 4. Artists 화면 한국어화 [x]

대상:
- `src/app/admin/artists/page.tsx`
- `src/components/admin/artists-form.tsx`

작업:
- 페이지 타이틀/헤더(`profile`, `name_ko`, `name_en`, `type`, `actions`) 한국어화
- 필터 `type 전체` 및 값 표시 한국어화
- enum 출력 매핑:
  - `COMPANY` -> `단체`
  - `INDIVIDUAL` -> `개인`

주의:
- select value는 기존 enum 원문 유지

## Step 5. Courses 화면 한국어화 [x]

대상:
- `src/app/admin/courses/page.tsx`
- `src/components/admin/courses-form.tsx`
- `src/components/admin/course-items-editor.tsx`

작업:
- 목록 타이틀/컬럼/필터(`is_official`, `actions`) 한국어화
- 폼 라벨(`title_ko`, `description_en`, `is_official`) 사용자 친화 한국어화
- 코스 아이템 에디터 텍스트 교체:
  - `Course Items`, `Drag & drop`, `course_item_id`, `seq`

주의:
- `seq` 계산/전송/정렬 로직 불변

## Step 6. Home Banners/기타 잔여 표기 한국어화 [x]

대상:
- `src/app/admin/home-banners/page.tsx`
- 필요 시 `src/components/admin/file-upload-field.tsx`의 노출 문구 점검

작업:
- 페이지 타이틀 `Home Banners` 한국어화
- `is_active` 라벨 한국어화
- alt/accessibility 텍스트 영문 잔여분 정리

## Step 7. Artwork 잔여 영문 표기 점검 [x]

대상:
- `src/app/admin/artworks/page.tsx`
- `src/components/admin/artworks-form.tsx`
- `src/app/admin/artworks/[id]/page.tsx`

작업:
- 이미 한국어화된 영역 유지 확인
- 남은 코드값 직접 노출 여부만 점검/보정

## Step 8. 회귀 검증 [x]

## 8.1 정적 검증
- [x] `pnpm exec tsc --noEmit`
- [x] `pnpm lint`
- [x] `pnpm build`

## 8.2 수동/E2E 검증 (Playwright headed)
- [x] 로그인 페이지 한국어 라벨 확인
- [x] 메뉴/탑바 전체 한국어 표기 확인
- [x] Users/Artists/Courses/Home Banners/Artworks 주요 화면 확인
- [x] 각 화면에서 조회/저장/삭제/복구 등 기존 동작 정상 확인

## Step 9. 문서/PR 반영 [x]

- [x] `docs/research.md`와 구현 결과 일치 여부 점검
- [x] PR 본문에 “표시 문자열 한국어화, 내부 로직 무변경” 명시
- [x] 변경 화면 스크린샷 갱신

## 5) 완료 기준 (DoD)

- [x] 사용자 노출 영문 표기가 한국어로 일관되게 전환됨
- [x] 저장값/API/DB/검증/비즈니스 로직 변경 없음
- [x] enum 값은 내부적으로 유지, UI 표시만 한국어 매핑
- [x] `tsc/lint/build` 통과
- [x] Playwright headed 검증 통과
- [x] 문서/PR 반영 완료(스크린샷 포함)

## 6) 구현 완료 메모

- 본 문서의 Step 1~9를 순차 수행했고, 완료 시점마다 체크박스를 갱신했다.
- 정적 검증(`tsc/lint/build`)과 Playwright headed E2E 검증을 모두 통과했다.
