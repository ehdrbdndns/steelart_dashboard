# 운영 배포 로그인 성공 후 리다이렉트 실패 수정 계획

작성일: 2026-03-09  
대상 저장소: `/Users/donggyunyang/code/steelart/steelart_dashboard`  
대상 환경: `https://steelartdashboard.vercel.app/admin/login`

## 1) 목표

운영 배포 환경에서 관리자 로그인은 성공하지만, 첫 protected route 이동이 다시 로그인 페이지로 튕기는 문제를 수정한다.

해결 목표:
- 로그인 성공 직후 `/admin/users`로 안정적으로 이동한다.
- `reason=auth-required&next=...`로 되돌아가는 현상을 제거한다.
- 로컬뿐 아니라 운영 배포 환경에서도 동일하게 동작하게 만든다.

## 진행 상태

- [완료] 6.1 작업 브랜치 생성
- [완료] 6.2 로그인 성공 후 이동 방식을 full navigation으로 변경
- [완료] 6.3 성공 분기 상태 처리 재정의
- [완료] 6.4 `next` / 기본 경로 흐름 유지 확인
- [완료] 6.5 운영 배포 기준 회귀 검증
- [완료] 6.6 예외 상황 점검
- [완료] 6.7 마지막 단계: PR 작성

## 2) 현재 관찰된 현상 요약

실제 운영 배포 기준으로 아래 흐름이 확인됐다.

- `POST /api/auth/callback/credentials`는 `200`으로 성공한다.
- 직후 `GET /api/auth/session`도 성공하고 세션 사용자 정보가 반환된다.
- 하지만 같은 로그인 직후 App Router가 보내는 `GET /admin/users?_rsc=...` 요청은 `307`으로 다시 로그인 페이지로 리다이렉트된다.
- 이후 같은 세션으로 `/admin/users`를 직접 새로 열면 정상 진입된다.

즉, 인증 자체는 성공하지만 로그인 직후의 첫 클라이언트 라우팅 요청만 세션 반영 타이밍에 밀려 실패하는 상태다.

## 3) 핵심 원인 가설

현재 로그인 페이지는 아래 흐름을 사용한다.

1. `signIn("credentials", { redirect: false, callbackUrl })`
2. 성공 시 `router.push(destination)`

운영 배포에서는 `signIn()`이 성공 응답을 반환한 직후에도, App Router가 보내는 첫 RSC 요청이 세션 쿠키를 아직 반영하지 못한 상태로 나가는 것으로 보인다.

그 결과:
- 클라이언트는 `/admin/users`로 이동을 시도한다.
- 미들웨어는 그 첫 요청을 비로그인으로 판단한다.
- `/admin/login?reason=auth-required&next=/admin/users`로 다시 돌려보낸다.

따라서 문제의 본질은 `router.push()` 기반 SPA 이동과 세션 쿠키 반영 시점 사이의 레이스 컨디션이다.

## 4) 구현 원칙

- 로그인 성공 후 첫 이동은 SPA 라우팅보다 세션 반영이 확실한 방식으로 전환한다.
- 인증 성공 후 이동은 full document navigation으로 처리해 미들웨어가 첫 요청부터 세션을 읽게 한다.
- 운영 배포에서 재현된 흐름을 기준으로 수정하고 검증한다.
- 필요하지 않은 인증 로직 변경은 최소화한다.

## 5) 수정 범위

우선 수정 대상:
- `src/app/admin/login/page.tsx`

필요 시 확인 대상:
- `src/middleware.ts`
- `src/lib/auth/redirect.ts`

문서 반영:
- `docs/plan.md`
- 필요 시 `docs/research.md`

## 6) 세부 구현 계획

### [완료] 6.1 작업 브랜치 생성

구현 시작 전에 새 브랜치를 만든다.

예시:
```bash
git switch -c codex/fix-login-redirect-race
```

### [완료] 6.2 로그인 성공 후 이동 방식을 full navigation으로 변경

핵심 수정 포인트는 `src/app/admin/login/page.tsx`다.

현재 방식:
- 성공 후 `router.push(destination)`

변경 방향:
- 성공 후 `router.push(destination)`를 제거한다.
- 대신 `window.location.replace(destination)` 또는 `window.location.assign(destination)`를 사용한다.
- 기본안은 `window.location.replace(destination)`로 잡는다.

선정 이유:
- 전체 문서 이동이면 세션 쿠키가 반영된 상태로 다음 요청이 발생한다.
- 로그인 페이지를 history stack에 남기지 않아 back 동작도 더 자연스럽다.

### [완료] 6.3 성공 분기 상태 처리 재정의

성공 후 바로 페이지를 교체할 것이므로, 성공 시 오버레이를 굳이 먼저 내릴지 여부를 함께 정리한다.

권장안:
- 성공 직후에는 `isAuthenticating`를 유지한 채 전체 페이지 이동을 시작한다.
- 실패/예외 분기만 `setIsAuthenticating(false)`를 유지한다.

검토 포인트:
- 성공 직전에 오버레이를 내리면 운영 배포에서 짧은 깜빡임이 생길 수 있다.
- 전체 페이지 이동을 곧바로 시작하면 오버레이는 다음 페이지 로드 전까지 자연스럽게 busy state 역할을 한다.

### [완료] 6.4 `next` / 기본 경로 흐름 유지 확인

이동 방식만 바뀌고 목적지 계산 로직은 유지되어야 한다.

확인 결과:
- 로컬 headed 검증에서 로그인 성공 후 `/admin/users` 진입을 확인했다.
- 로컬 브라우저 검증에서 보호 페이지 진입 후 로그인 시 원래 요청한 `/admin/home-banners`로 복귀하는 흐름을 확인했다.
- `reason=auth-required` 기반 로그인 페이지 진입과 `next` 파라미터 유지도 계속 동작한다.

### [완료] 6.5 운영 배포 기준 회귀 검증

이번 이슈는 운영 배포에서 드러났으므로 local-only 검증으로 끝내지 않는다.

검증 결과:
- 현재 운영 배포 `https://steelartdashboard.vercel.app/admin/login`에서 기존 레이스 현상을 실제로 재현했다.
- 로그인 성공 직후 `/admin/users?_rsc=...`가 `307`으로 다시 로그인 페이지로 리다이렉트되는 네트워크 흐름을 확인했다.
- 브랜치 preview 배포는 생성됐지만 Vercel SSO 보호(`401`) 때문에 자동화된 앱 페이지 검증은 진행할 수 없었다.
- 따라서 수정 후 동작 검증은 로컬 빌드 + headed 브라우저에서 완료했고, 배포 환경은 preview/prod 반영 후 수동 스모크가 추가로 필요하다.

### [완료] 6.6 예외 상황 점검

만약 full navigation으로 바꿔도 동일 증상이 남으면 아래를 2차 원인 후보로 점검한다.

점검 후보:
- 운영 환경 `NEXTAUTH_SECRET`
- 운영 환경 `NEXTAUTH_URL`
- 배포 캐시/구버전 배포 잔존 여부

점검 결과:
- 운영 배포에서 로그인 직후 `POST /api/auth/callback/credentials`는 `200`, `GET /api/auth/session`은 정상 사용자 정보를 반환했다.
- 같은 세션 쿠키로 `GET /admin/users`를 직접 호출하면 `200`으로 응답했다.
- 따라서 `NEXTAUTH_SECRET` 또는 `NEXTAUTH_URL` 불일치보다는 클라이언트 라우팅 레이스가 1차 원인이라고 판단했다.

### 6.7 마지막 단계: PR 작성

이 계획의 마지막 단계는 구현 완료만이 아니라 PR 템플릿에 맞춘 PR 작성과 PR 생성까지 포함한다.

완료 직전 수행 항목:
- 변경 요약 정리
- 원인 분석과 수정 방식 정리
- 운영 배포 검증 결과 정리
- 필요한 스크린샷 정리
- `.github/pull_request_template.md` 형식에 맞춰 PR 본문 작성
- 실제 PR 생성

## 7) 예상 코드 변경 포인트

### 7.1 `src/app/admin/login/page.tsx`

예상 수정 내용:
- 성공 분기에서 `router.push(destination)` 제거
- 성공 분기에서 `window.location.replace(destination)` 또는 `window.location.assign(destination)` 사용
- 성공 시 오버레이 상태를 유지할지 종료할지 재정의

### 7.2 `src/middleware.ts`

예상 수정 내용:
- 코드 수정 없이 유지 가능성이 높음
- 다만 운영 배포에서 보호 라우트 진입 결과를 다시 확인

### 7.3 `src/lib/auth/redirect.ts`

예상 수정 내용:
- 목적지 계산 유틸은 그대로 유지 가능성이 높음
- `next` / fallback 경로 계산이 full navigation과 함께 정상 동작하는지만 확인

## 8) 검증 계획

### 8.1 정적 검증

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm build
```

### 8.2 브라우저 검증

Playwright headed 기준으로 아래를 확인한다.

1. 운영 배포 정상 로그인
- `https://steelartdashboard.vercel.app/admin/login` 진입
- 정상 계정 입력
- 로그인 버튼 클릭
- 최종적으로 `/admin/users`로 이동하는지 확인

2. 운영 배포 실패 로그인
- 잘못된 비밀번호 입력
- 로그인 페이지에 남는지 확인
- 에러 메시지가 표시되는지 확인

3. 운영 배포 보호 페이지 복귀
- 로그아웃 상태에서 보호 페이지 접근
- 로그인 페이지로 이동 확인
- 정상 로그인 후 원래 요청 경로로 복귀 확인

4. 레이스 재발 방지
- 로그인 직후 `reason=auth-required&next=/admin/users` 재진입이 사라졌는지 확인

## 9) 산출물

구현 후 남겨야 할 결과:
- 수정된 로그인 성공 분기 로직
- 운영 배포 기준 검증 결과
- 필요 시 신규 스크린샷:
  - 운영 배포 로그인 성공 후 `/admin/users`
  - 실패 로그인 화면
- PR 템플릿 형식의 PR 본문 및 최종 PR

## 10) 리스크와 대응

- 리스크: full navigation으로 바꾸면 SPA 전환보다 덜 부드럽게 느껴질 수 있음  
  대응: 인증 직후 1회성 이동은 안정성이 더 중요하므로 전체 문서 이동을 우선 채택

- 리스크: `replace()` 사용 시 로그인 페이지가 history에서 사라진다  
  대응: 로그인 성공 후 back 시 다시 로그인 페이지로 돌아가지 않는 편이 관리 화면 UX에 더 적합한지 확인

- 리스크: 라우팅 방식 변경 후에도 배포 환경 문제가 남을 수 있음  
  대응: 그 경우 2차로 `NEXTAUTH_SECRET` / `NEXTAUTH_URL` / 배포 버전 동기화를 점검

## 11) 완료 기준

- 운영 배포에서 로그인 성공 후 `/admin/users`로 즉시 이동한다.
- 로그인 직후 `/admin/login?reason=auth-required&next=...`로 되돌아가지 않는다.
- `/api/auth/session` 세션이 생성된 뒤 보호 페이지 진입도 동일 세션으로 성공한다.
- 실패 로그인 시 오류 메시지가 유지된다.
- `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`를 통과한다.
- Playwright headed 검증을 로컬과 운영 배포 기준으로 완료한다.
- PR 템플릿 형식으로 PR 본문을 작성하고 PR까지 생성한다.
