# 로그인 인증 UX 개선 실행 계획

작성일: 2026-03-09  
대상 저장소: `/Users/donggyunyang/code/steelart/steelart_dashboard`

## 1) 목표

로그인 UX를 아래 3가지 방향으로 개선한다.

- 로그인 제출 후 인증이 성공해 관리자 화면으로 전환될 때까지 사용자가 기다리고 있음을 명확히 보여주는 로딩 화면을 제공한다.
- 로그인하지 않은 상태에서 `/admin/*` 페이지로 이동하려고 하면 로그인 페이지로 보내되, 왜 이동되었는지 `alert`로 명확히 안내한다.
- 구현 완료 후 Playwright `--headed` 기반 직접 검증과 PR 작성까지 한 번에 마무리한다.

## 2) 현재 상태 요약

확인 기준 파일:
- `src/app/admin/login/page.tsx`
- `src/middleware.ts`
- `src/components/admin/admin-api-blocking-overlay.tsx`
- `src/app/providers.tsx`
- `src/lib/client/admin-api.ts`
- `.github/pull_request_template.md`

현재 동작:
- 로그인 페이지는 `react-hook-form`의 `isSubmitting`만 사용하고 있어 버튼 텍스트만 `로그인 중...`으로 바뀐다.
- 인증 성공 후 `router.push()`가 호출되지만, 별도의 전체 화면 로딩 오버레이는 없다.
- 비로그인 상태에서 `/admin/*` 접근 시 `middleware.ts`가 `/admin/login`으로 리다이렉트한다.
- 이 리다이렉트는 서버에서 처리되므로, 사용자에게 "로그인이 필요하다"는 이유를 브라우저에서 직접 설명하지 않는다.
- 관리자 API 요청 중에는 `AdminApiBlockingOverlay`가 이미 존재한다.
- PR 템플릿은 `요약 / 변경내용 / 검증 / 스크린샷` 4개 섹션으로 고정되어 있다.

## 3) 목표 UX 정의

### 3.1 로그인 로딩 UX

- 사용자가 로그인 버튼을 누르면 즉시 입력과 버튼을 잠근다.
- 인증 요청이 진행되는 동안 전체 화면 로딩 오버레이를 보여준다.
- 인증 성공 후에는 오버레이를 유지한 채 목적지 페이지로 이동한다.
- 인증 실패 시에만 오버레이를 닫고, 기존 에러 메시지를 보여준다.

권장 문구:
- 로딩 제목: `로그인 처리 중입니다...`
- 보조 문구: `관리자 권한을 확인하고 있습니다.`

### 3.2 비로그인 접근 경고 UX

- 비로그인 사용자가 `/admin/users`, `/admin/artists` 같은 관리자 페이지로 직접 진입하거나 이동하면 로그인 페이지로 리다이렉트한다.
- 로그인 페이지 진입 직후 1회만 `alert("로그인이 필요합니다. 로그인 후 다시 시도해 주세요.")`를 띄운다.
- 경고를 띄운 뒤에는 URL에서 경고 트리거 파라미터를 제거해 새로고침이나 개발 모드 리마운트로 인한 중복 `alert`를 막는다.
- 가능하면 원래 가려던 경로를 보존해 로그인 성공 후 해당 페이지로 복귀시킨다.

## 4) 구현 범위

이번 작업에 포함:
- 로그인 페이지 전용 또는 공용 전체 화면 로딩 오버레이
- 미들웨어의 비로그인 리다이렉트 사유 전달
- 로그인 페이지의 1회성 `alert` 처리
- 로그인 성공 후 원래 목적지 복귀
- Playwright `--headed` 기반 직접 검증
- PR 템플릿 기반 본문 작성과 기능별 스크린샷 첨부

이번 작업에서 제외:
- `/api/admin/*`의 `401` 응답을 받은 뒤 클라이언트에서 자동 `alert` + 강제 이동 처리
- 토스트 시스템 도입
- 다중 권한/세션 만료 정책 개편
- 자동화된 `@playwright/test` 스펙 파일 추가

## 5) 구현 설계

### 5.1 로딩 오버레이 재사용 구조 정리

기존 `src/components/admin/admin-api-blocking-overlay.tsx`는 관리자 API 요청 전용으로 만들어져 있다.  
로그인 화면에도 비슷한 UI가 필요하므로 아래 둘 중 하나로 정리한다.

권장안:
- 공용 프리미티브를 새로 만든다.
- 예시 파일: `src/components/ui/blocking-overlay.tsx`
- 역할:
  - `visible`
  - `title`
  - `description`
  - 필요 시 `zIndex` 정도만 props로 받음

적용 방식:
- `AdminApiBlockingOverlay`는 내부 구현을 공용 `BlockingOverlay` 호출로 단순화한다.
- 로그인 페이지도 같은 `BlockingOverlay`를 사용한다.

이 접근을 권장하는 이유:
- 로그인 로딩과 관리자 API 로딩의 시각적 언어를 통일할 수 있다.
- 오버레이 마크업을 중복 작성하지 않아도 된다.

### 5.2 로그인 페이지 상태 모델 확장

대상 파일:
- `src/app/admin/login/page.tsx`

추가 상태:
- `message`: 기존 에러 메시지 유지
- `isAuthenticating`: 로그인 제출 직후부터 성공 리다이렉트 완료 전까지 유지할 로딩 상태

권장 흐름:
1. 제출 시작 시 `setMessage("")`
2. `setIsAuthenticating(true)`
3. `signIn("credentials", { redirect: false, callbackUrl })` 호출
4. 실패 시:
   - `setIsAuthenticating(false)`
   - `setMessage(INVALID_LOGIN_MESSAGE)`
5. 성공 시:
   - `setIsAuthenticating(true)` 유지
   - `router.push(...)`
   - 페이지 언마운트로 오버레이 종료

주의점:
- `react-hook-form`의 `isSubmitting`은 네트워크 호출 중에만 유효하므로, 성공 후 라우팅이 끝날 때까지를 보장하지 못한다.
- 따라서 버튼 비활성화 조건은 `isSubmitting || isAuthenticating`로 보는 편이 안전하다.

### 5.3 원래 목적지 복귀를 위한 쿼리 설계

대상 파일:
- `src/middleware.ts`
- `src/app/admin/login/page.tsx`

리다이렉트 파라미터 제안:
- `reason=auth-required`
- `next=/admin/users` 같은 상대 경로

미들웨어 변경 방향:
- 비로그인 상태에서 관리자 페이지 접근 시:
  - 현재 pathname + search를 합친 값을 `next`로 만든다.
  - `/admin/login?reason=auth-required&next=...` 로 리다이렉트한다.

예시:
- 접근 URL: `/admin/users?page=2`
- 리다이렉트 URL: `/admin/login?reason=auth-required&next=%2Fadmin%2Fusers%3Fpage%3D2`

로그인 페이지 변경 방향:
- `useSearchParams()`로 `next`를 읽는다.
- `next`가 없으면 기존 기본값 `/admin/artists`를 사용한다.
- 로그인 성공 시 `result.url ?? next ?? "/admin/artists"`로 이동한다.

보안 조건:
- `next`는 반드시 상대 경로(`/admin`으로 시작하는 값)만 허용한다.
- 외부 URL이나 프로토콜이 포함된 값은 무시하고 기본값으로 대체한다.

## 6) 비로그인 경고 표시 방식

대상 파일:
- `src/app/admin/login/page.tsx`

구현 포인트:
- 로그인 페이지에서 `reason=auth-required`를 감지하면 `useEffect`에서 `alert`를 띄운다.
- 단, React 개발 모드에서는 마운트가 두 번 발생할 수 있으므로 중복 호출을 막아야 한다.

권장 순서:
1. `reason`과 `next`를 읽는다.
2. `reason === "auth-required"`이면 먼저 현재 URL을 정리한다.
3. `window.history.replaceState()`로 `reason` 없는 `/admin/login?next=...` 또는 `/admin/login`으로 바꾼다.
4. 그 다음 `window.alert("로그인이 필요합니다. 로그인 후 다시 시도해 주세요.")` 실행

이 순서를 권장하는 이유:
- URL을 먼저 정리하면 React Strict Mode 재마운트에서도 같은 `alert`가 반복되지 않는다.
- 브라우저 뒤로가기 시에도 경고 재노출 가능성을 줄일 수 있다.

## 7) 파일별 작업 계획

### 7.1 `src/components/ui/blocking-overlay.tsx` 신규

추가 내용:
- 전체 화면 fixed 오버레이
- 스피너
- 제목/보조 문구
- body scroll lock 처리

### 7.2 `src/components/admin/admin-api-blocking-overlay.tsx` 수정

변경 내용:
- 기존 마크업 제거
- 공용 `BlockingOverlay`를 사용하도록 변경
- 기존 `OVERLAY_DELAY_MS`와 pending request 구독 로직은 유지

### 7.3 `src/app/admin/login/page.tsx` 수정

변경 내용:
- `useSearchParams` 추가
- `isAuthenticating` 상태 추가
- `reason`, `next` 처리 로직 추가
- 로그인 성공 전까지 보이는 오버레이 추가
- 버튼/입력 비활성화 강화
- 기존 고정 callback URL을 동적 callback URL로 교체

### 7.4 `src/middleware.ts` 수정

변경 내용:
- 비로그인 페이지 접근 시 `reason`, `next`를 붙여 로그인 페이지로 리다이렉트
- 가능하면 로그인 페이지 방문 시 토큰이 이미 있는 경우 `next`가 유효하면 해당 페이지로, 아니면 기본 `/admin/artists`로 보낸다.

## 8) 세부 구현 순서

사전 단계:
- [완료] 구현 시작 전에 `git switch -c codex/login-auth-ux`로 새 작업 브랜치를 생성했다.

1. [완료] 공용 `BlockingOverlay`를 만들었다.
2. [완료] `AdminApiBlockingOverlay`를 공용 오버레이 기반으로 정리했다.
3. [완료] 로그인 페이지에 `isAuthenticating` 상태와 전면 오버레이를 붙였다.
4. [완료] 로그인 페이지에 `reason`/`next` 파싱과 1회성 `alert` 처리를 넣었다.
5. [완료] 미들웨어에서 비로그인 리다이렉트 URL에 `reason`/`next`를 추가했다.
6. [완료] 로그인 성공 후 원래 경로 복귀가 동작하는지 확인했다.
7. [완료] 실패 케이스에서 오버레이가 해제되고 에러 메시지가 유지되는지 확인했다.
8. [완료] 정적 검증(`pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`)을 실행했다.
9. [완료] Playwright `--headed`로 직접 시나리오를 검증했다.
10. [완료] PR에 넣을 기능별 스크린샷을 `docs/pr-assets/`에 수집했다.
11. [완료] PR 템플릿 형식으로 본문을 작성했다.
12. [완료] 브랜치를 push하고 PR을 생성했다. PR: `https://github.com/ehdrbdndns/steelart_dashboard/pull/11`

## 9) 검증 시나리오

### 9.1 검증 환경

전제 확인:
- `npx` 사용 가능 확인 완료
- `gh` CLI 사용 가능 및 GitHub 인증 활성 상태 확인 완료

기본 준비:
```bash
pnpm dev
```

Playwright CLI 준비:
```bash
export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
export PWCLI="$CODEX_HOME/skills/playwright/scripts/playwright_cli.sh"
```

검증 원칙:
- Playwright는 반드시 `--headed`로 실행한다.
- 직접 눈으로 확인하는 시나리오를 포함한다.
- 임시 산출물은 `output/playwright/`에 저장한다.
- PR에 넣을 최종 스크린샷만 `docs/pr-assets/`에 저장한다.

### 9.2 로그인 로딩

- 올바른 계정으로 로그인하면 오버레이가 바로 나타난다.
- 로그인 성공 후 관리자 첫 화면이 렌더링될 때까지 오버레이가 유지된다.
- 잘못된 계정으로 로그인하면 오버레이가 사라지고 에러 메시지가 표시된다.
- 로딩 중에는 입력 필드와 버튼이 다시 눌리지 않는다.

### 9.3 비로그인 접근 경고

- 로그아웃 상태에서 `/admin/users` 직접 접속 시 로그인 페이지로 이동하고 `alert`가 1회 표시된다.
- 로그아웃 상태에서 `/admin/artists?page=2` 접속 시 `next`에 쿼리까지 유지된다.
- 로그인 성공 후 원래 요청했던 페이지로 돌아간다.
- 사용자가 그냥 `/admin/login`으로 접근한 경우에는 `alert`가 뜨지 않는다.
- 로그인 페이지 새로고침 시 같은 경고가 반복되지 않는다.

### 9.4 회귀 확인

- 로그인된 상태에서 `/admin/login` 접근 시 기존처럼 관리자 화면으로 이동한다.
- 관리자 API 로딩 오버레이가 기존과 동일하게 동작한다.
- 로그아웃 후 다시 접근해도 리다이렉트 루프가 생기지 않는다.

### 9.5 Playwright headed 직접 검증 절차

대표 흐름:
```bash
"$PWCLI" open http://localhost:3000/admin/login --headed
"$PWCLI" snapshot
```

시나리오 A. 로그인 로딩 오버레이:
- 로그인 폼에 정상 계정을 입력한다.
- 제출 직후 전체 화면 로딩 오버레이가 보이는지 직접 확인한다.
- 로그인 성공 후 `/admin/artists` 또는 `next` 대상 페이지로 이동하는지 확인한다.
- 오버레이가 사라지고 최종 페이지가 정상 렌더링되는지 확인한다.
- 필요한 경우 `output/playwright/auth-login-loading-overlay.png`로 캡처한다.

시나리오 B. 잘못된 로그인:
- 잘못된 비밀번호로 제출한다.
- 오버레이가 닫히고 `"이메일 또는 비밀번호가 올바르지 않습니다."` 메시지가 보이는지 확인한다.

시나리오 C. 비로그인 접근 경고:
- 로그아웃 상태에서 `http://localhost:3000/admin/users`로 직접 이동한다.
- 로그인 페이지로 리다이렉트되는지 확인한다.
- 브라우저 `alert` 텍스트가 `로그인이 필요합니다. 로그인 후 다시 시도해 주세요.`인지 확인한다.
- `alert`를 닫은 뒤 URL에 `reason`이 제거되었는지 확인한다.

시나리오 D. 원래 경로 복귀:
- 시나리오 C 직후 로그인한다.
- 로그인 성공 후 `/admin/users`로 복귀하는지 확인한다.
- 쿼리가 있는 경로도 동일하게 복귀하는지 추가 확인한다.

### 9.6 스크린샷 수집 원칙

권장 최종 산출물:
- `docs/pr-assets/auth-login-loading-overlay.png`
- `docs/pr-assets/auth-login-required-alert.png`
- `docs/pr-assets/auth-login-return-to-target.png`

캡처 방식:
- 오버레이와 복귀 결과 화면은 Playwright 캡처를 우선 사용한다.
- 네이티브 `window.alert`는 Playwright `page.screenshot`에 안정적으로 포함되지 않을 수 있으므로, 헤디드 브라우저가 열린 상태에서 OS 레벨 스크린샷으로 보강한다.
- PR에는 기능별로 최소 1장씩 넣는다.

## 10) PR 작성 및 생성

### 10.1 PR 본문 작성 원칙

`.github/pull_request_template.md` 구조를 그대로 따른다.

섹션 구성:
- `## 요약`
- `## 변경내용`
- `## 검증`
- `## 스크린샷`

작성 초안은 예를 들어 `docs/pr-assets/auth-login-ux-pr.md` 같은 파일로 먼저 정리한 뒤 `gh pr create --body-file`에 사용한다.

### 10.2 PR 본문에 들어갈 내용

`## 요약` 초안 방향:
- 로그인 성공 전까지 전체 화면 로딩 오버레이를 추가했다.
- 비로그인 상태의 관리자 페이지 접근 시 로그인 안내 `alert`와 원래 경로 복귀를 추가했다.

`## 변경내용` 초안 방향:
- 공용 blocking overlay 컴포넌트 추가
- 로그인 페이지의 `isAuthenticating`, `reason`, `next` 처리 추가
- 미들웨어의 비로그인 리다이렉트 파라미터 처리 추가
- 관리자 API 오버레이 공용화 정리

`## 검증` 초안 방향:
- `pnpm exec tsc --noEmit`
- `pnpm lint`
- `pnpm build`
- Playwright headed 직접 검증:
  - 로그인 로딩 오버레이 표시
  - 비로그인 접근 시 `alert` 노출
  - 로그인 후 원래 경로 복귀
  - 기존 관리자 API 오버레이 회귀 없음

`## 스크린샷` 초안 방향:
- 로그인 로딩 오버레이: `docs/pr-assets/auth-login-loading-overlay.png`
- 비로그인 접근 alert: `docs/pr-assets/auth-login-required-alert.png`
- 로그인 후 원래 페이지 복귀: `docs/pr-assets/auth-login-return-to-target.png`

### 10.3 PR 생성 절차

1. 변경 내용을 커밋한다.
2. 현재 브랜치를 원격에 push한다.
3. PR 본문 파일을 기준으로 PR을 생성한다.

예시 명령:
```bash
git push -u origin <current-branch>
gh pr create --base main --title "로그인 인증 UX 개선" --body-file docs/pr-assets/auth-login-ux-pr.md
```

## 11) 리스크와 대응

- 리스크: `alert`가 개발 모드에서 두 번 뜰 수 있음  
  대응: `window.history.replaceState()`로 쿼리를 먼저 정리한 뒤 `alert` 실행

- 리스크: `next` 파라미터를 잘못 처리하면 오픈 리다이렉트가 생길 수 있음  
  대응: `/admin`으로 시작하는 상대 경로만 허용

- 리스크: 로그인 성공 후 라우팅이 길어질 때 오버레이가 너무 오래 남아 보일 수 있음  
  대응: 문구를 "권한 확인 중"으로 명확히 하고, 성공 시 별도 해제하지 않고 페이지 전환에 맡김

- 리스크: 네이티브 `alert`가 Playwright 스크린샷에 보이지 않을 수 있음  
  대응: 헤디드 브라우저 검증은 Playwright로 수행하고, PR용 이미지는 OS 레벨 스크린샷으로 보강

- 리스크: PR 본문에 상대 경로 이미지만 넣으면 GitHub 렌더링 방식에 따라 표시가 약할 수 있음  
  대응: 필요 시 raw GitHub URL 또는 업로드된 이미지 URL 기준으로 본문을 작성

## 12) 완료 기준 (DoD)

- 로그인 제출 시 전체 화면 로딩 오버레이가 보인다.
- 인증 실패 시 오버레이가 정상 해제되고 에러 메시지가 유지된다.
- 비로그인 상태의 관리자 페이지 접근 시 로그인 페이지에서 안내 `alert`가 1회 표시된다.
- 로그인 후 원래 접근하려던 관리자 페이지로 복귀한다.
- 기존 관리자 API 요청 오버레이 동작에 회귀가 없다.
- Playwright `--headed` 직접 검증 결과가 `검증` 섹션에 반영된다.
- PR 템플릿 형식의 본문이 작성되고 기능별 스크린샷이 첨부된 상태로 PR 생성까지 완료한다.
