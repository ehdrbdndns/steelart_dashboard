# 로그인/인증 구현 조사 보고서

작성일: 2026-03-09  
대상 저장소: `/Users/donggyunyang/code/steelart_dashboard`

## 1) 조사 목적

- 현재 로그인 기능과 인증/인가(접근 제어) 동작이 코드에서 어떻게 연결되는지 실제 구현 기준으로 정리한다.
- 프론트엔드 화면, NextAuth 설정, 미들웨어, `/api/admin/*` 보호 범위를 하나의 흐름으로 문서화한다.
- 운영 시 주의할 구조적 특성과 잠재 리스크를 사실과 추론으로 구분해 기록한다.

## 2) 조사 범위

확인 파일:
- `src/app/admin/login/page.tsx`
- `src/lib/auth/config.ts`
- `src/app/api/auth/[...nextauth]/route.ts`
- `src/middleware.ts`
- `src/app/providers.tsx`
- `src/components/nav/admin-side-nav.tsx`
- `src/lib/client/admin-api.ts`
- `src/lib/server/env.ts`
- `.env.example`
- 샘플 admin API 라우트(`src/app/api/admin/*`)

## 3) 구조 요약 (한눈에)

1. 인증 방식: NextAuth `CredentialsProvider` + 단일 ENV 계정(`ADMIN_EMAIL`, `ADMIN_PASSWORD`)
2. 세션 방식: NextAuth JWT 세션(`session.strategy = "jwt"`)
3. 보호 경계: `middleware.ts`에서 `/admin/:path*`, `/api/admin/:path*` 전체를 토큰 유무로 보호
4. 인가 모델: `role = "admin"` 값을 JWT/Session에 넣지만 실제 권한 분기(역할별 정책)는 없음
5. 서버 API 개별 검증: 각 라우트 핸들러 내부에서 `getServerSession`/role 체크는 하지 않음(미들웨어에 의존)

## 4) 로그인 구현 상세

### 4.1 로그인 페이지와 제출 로직

- 로그인 화면은 `src/app/admin/login/page.tsx`에 구현되어 있음.
- 입력 검증은 `zod + react-hook-form` 사용:
  - 이메일 형식 검증
  - 비밀번호 비어있음 검증
- 제출 시 `signIn("credentials", { redirect: false, callbackUrl: "/admin/artists" })` 호출.
- 실패(`result.error` 존재) 시 사용자에게 고정 메시지 표시:
  - `"이메일 또는 비밀번호가 올바르지 않습니다."`
- 성공 시 `router.push(result.url ?? "/admin/artists")` 후 `router.refresh()`.

근거:
- `src/app/admin/login/page.tsx:11-14, 38-53`

### 4.2 NextAuth 라우트 연결

- NextAuth 엔드포인트는 App Router 방식으로 등록:
  - `GET/POST /api/auth/[...nextauth]`
- `authOptions`는 `src/lib/auth/config.ts`에서 주입됨.

근거:
- `src/app/api/auth/[...nextauth]/route.ts:1-6`

### 4.3 Credentials 인증 로직

- `CredentialsProvider.authorize`에서 다음을 수행:
  1. email/password 누락 체크
  2. `getCoreEnv()`로 환경변수 로드/검증
  3. `credentials.email === env.ADMIN_EMAIL`
  4. `credentials.password === env.ADMIN_PASSWORD`
- 불일치 시 오류 throw.
- 일치 시 고정 사용자 객체 반환:
  - `id: "env-admin"`
  - `name: "SteelArt Admin"`
  - `role: "admin"`

근거:
- `src/lib/auth/config.ts:18-37`
- `src/lib/server/env.ts:3-8, 40-53`

## 5) 세션/토큰 모델

### 5.1 JWT 세션 전략

- `session.strategy = "jwt"`로 설정되어 DB 세션 저장소 없이 토큰 기반 세션 사용.

근거:
- `src/lib/auth/config.ts:7-10`

### 5.2 role 클레임 주입

- `jwt` callback: 로그인 시 `token.role` 설정.
- `session` callback: `session.user.role`에 토큰 role 복사.
- 타입 확장으로 `User`, `Session.user`, `JWT`에 `role?: string` 선언.

근거:
- `src/lib/auth/config.ts:43-55`
- `src/types/next-auth.d.ts:3-19`

### 5.3 클라이언트 세션 컨텍스트

- 루트 `Providers`에서 `SessionProvider`로 전체 앱을 감쌈.
- 따라서 클라이언트 컴포넌트에서 `next-auth/react` API 사용 가능.

근거:
- `src/app/providers.tsx:3-22`
- `src/app/layout.tsx`에서 `<Providers>{children}</Providers>` 사용

## 6) 인증 보호(Access Control) 상세

### 6.1 미들웨어가 단일 진입 게이트

- 매처:
  - `/admin/:path*`
  - `/api/admin/:path*`
- 판단 기준:
  - 로그인 페이지(`/admin/login`) + 토큰 있음 => `/admin/artists`로 리다이렉트
  - 관리자 페이지/API + 토큰 없음 => 차단
    - 페이지: `/admin/login` 리다이렉트
    - API: `401` JSON 반환 (`code: "UNAUTHORIZED"`, `message: "인증이 필요합니다."`)

근거:
- `src/middleware.ts:9-31, 47-49`

### 6.2 authorized 콜백 동작 방식

- `withAuth` 옵션에서 `authorized: () => true`를 사용.
- 즉 1차 통과 후, 실제 차단은 커스텀 미들웨어 본문(`token` 검사)에서 직접 처리.

근거:
- `src/middleware.ts:35-38`

### 6.3 API 라우트 내부 인증 체크 부재

- 조사한 `/api/admin/*` 라우트들은 비즈니스 로직/검증만 수행하고 인증 코드는 없음.
- 보호는 미들웨어 전역 매처에 전적으로 의존.

근거:
- `src/app/api/admin/artists/route.ts` (인증 코드 없음)
- `src/app/api/admin/users/route.ts` (인증 코드 없음)

## 7) 로그아웃 및 인증 실패 UX

### 7.1 로그아웃

- 사이드 네비게이션에서 `signOut({ callbackUrl: "/admin/login" })` 호출.
- 사용자 확인 대화상자(confirm) 후 로그아웃 실행.

근거:
- `src/components/nav/admin-side-nav.tsx:42-51`

### 7.2 인증 실패 API 호출 시 프론트 동작

- `requestJson`은 비정상 응답 시 `payload.error.message`를 `Error`로 throw.
- 미들웨어가 401에서 `"인증이 필요합니다."`를 반환하므로, 클라이언트에서는 해당 메시지로 예외를 받음.
- 공통 API 유틸에는 `401` 자동 리다이렉트 처리 없음.

근거:
- `src/lib/client/admin-api.ts:65-72`
- `src/middleware.ts:19-27`

## 8) 환경변수 의존성

필수(코어 인증 관련):
- `NEXTAUTH_SECRET` (필수)
- `ADMIN_EMAIL` (이메일 형식 필수)
- `ADMIN_PASSWORD` (문자열 1자 이상 필수)
- `NEXTAUTH_URL` (스키마상 optional, `.env.example`에는 정의)

근거:
- `src/lib/server/env.ts:3-8`
- `.env.example:1-5`

## 9) 현재 설계의 특성 및 리스크

### 9.1 사실 기반 확인

1. 단일 관리자 계정 구조
- DB 사용자 테이블 기반 인증이 아니라 ENV 고정 계정 1개를 사용.

2. 평문 비교
- 비밀번호 해시 검증(`bcrypt.compare`)이 아니라 문자열 동등 비교.
- `.env.example`도 `replace_with_plain_password`로 안내.

3. 역할 정보는 저장하지만 권한 분기 없음
- `role`은 토큰/세션에 저장되지만, 현재 코드에서 role 기반 접근 제어는 없음.

### 9.2 추론(운영 관점)

1. 확장성 한계
- 다중 운영자, 권한 레벨(읽기 전용/편집/슈퍼어드민) 요구가 생기면 현재 구조로는 대응이 어렵다.

2. 인증 강도 한계
- 로그인 시도 횟수 제한, 계정 잠금, MFA 같은 추가 방어 계층이 현재 코드에 없다.

3. 미들웨어 의존도
- `/api/admin/*` 내부에서 재검증하지 않으므로, 라우트 매처 누락/변경 시 보호 경계가 약해질 수 있다.

## 10) 실제 요청 흐름 (요약 시퀀스)

1. 사용자가 `/admin/login` 진입
2. 로그인 폼 제출 -> `signIn("credentials")`
3. NextAuth authorize에서 ENV 계정 비교
4. 성공 시 JWT 발급(`role=admin` 포함)
5. 이후 `/admin/*`, `/api/admin/*` 요청 시 미들웨어가 토큰 존재 확인
6. 토큰 없으면:
   - 페이지 요청: 로그인 페이지로 리다이렉트
   - API 요청: 401 JSON 반환

## 11) 결론

현재 로그인/인증은 "NextAuth Credentials + ENV 단일 관리자 + 미들웨어 전역 보호"라는 단순하고 명확한 구조다.  
MVP/내부 운영 용도로는 빠르게 동작하지만, 운영자 다계정/세분화된 권한/강화된 보안 요구가 생기면 인증 저장소(DB), 해시 검증, role 기반 인가 정책, 401 공통 처리 전략을 포함한 구조 개편이 필요하다.
