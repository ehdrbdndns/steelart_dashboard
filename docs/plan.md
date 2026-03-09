# 로그인 성공 후 오버레이 지속 노출 버그 수정 계획

작성일: 2026-03-09  
대상 저장소: `/Users/donggyunyang/code/steelart/steelart_dashboard`

## 1) 목표

업데이트된 `docs/research.md` 내용을 반영해 아래 문제를 해결한다.

- 로그인 성공 후 중앙 로딩 오버레이가 닫히지 않고 남아 보이는 문제를 수정한다.
- 로그인 성공 후 다음 페이지로 자연스럽게 전환되도록 흐름을 정리한다.
- 로그인 성공 시 기본 이동 경로를 User Page(` /admin/users `) 기준으로 맞춘다.

## 진행 상태

- [완료] 5.1 작업 브랜치 생성
- [완료] 5.2 기본 로그인 성공 경로 변경
- [완료] 5.3 로그인 성공 시 오버레이 종료 전략 수정
- [완료] 5.4 `router.refresh()` 필요성 제거 검토
- [완료] 5.5 비로그인 접근 안내 로직 회귀 확인
- [진행 중] 5.6 마지막 단계: PR 작성

## 2) 핵심 원인 요약

`docs/research.md` 기준 핵심 원인은 다음과 같다.

- 로그인 시작 시 `isAuthenticating`는 `true`가 된다.
- 실패/예외 분기에서만 `isAuthenticating`를 `false`로 되돌린다.
- 성공 분기에서는 `router.push()`와 `router.refresh()`만 호출하고, 성공 시점의 상태 종료를 명시적으로 처리하지 않는다.
- 따라서 로그인 성공 후 페이지 전환이 지연되면 로그인 화면이 `isAuthenticating = true` 상태로 남아 오버레이가 계속 보일 수 있다.

## 3) 구현 원칙

- 오버레이 종료를 "페이지 언마운트 기대"에만 의존하지 않는다.
- 로그인 성공 시점과 페이지 이동 시점을 분리해서 다룬다.
- 기본 성공 경로는 `/admin/users`로 통일한다.
- `router.refresh()`는 필요성부터 재검토하고, 불필요하면 제거한다.

## 4) 수정 범위

수정 대상:
- `src/app/admin/login/page.tsx`
- `src/lib/auth/redirect.ts`
- `src/middleware.ts`

검토 대상:
- `src/components/ui/blocking-overlay.tsx`
- `src/app/admin/layout.tsx`

문서 반영:
- `docs/research.md`
- `docs/plan.md`

## 5) 세부 구현 계획

### [완료] 5.1 작업 브랜치 생성

구현 시작 전에 새 브랜치를 만든다.

예시:
```bash
git switch -c codex/fix-login-overlay-stuck
```

### [완료] 5.2 기본 로그인 성공 경로 변경

현재 기본 성공 경로는 `/admin/artists` 기준으로 잡혀 있다.  
이를 User Page 기준인 `/admin/users`로 변경한다.

변경 포인트:
- `src/lib/auth/redirect.ts`
  - `DEFAULT_ADMIN_REDIRECT`를 `/admin/users`로 변경
- `src/middleware.ts`
  - 로그인 페이지 접근 시 토큰이 이미 있으면 기본 이동 경로도 `/admin/users` 기준으로 동작하는지 확인
- `src/app/admin/login/page.tsx`
  - `next`가 없을 때도 `/admin/users`로 이동하도록 맞춤

### [완료] 5.3 로그인 성공 시 오버레이 종료 전략 수정

핵심 수정 포인트는 `src/app/admin/login/page.tsx`다.

현재 문제:
- 성공 시 `isAuthenticating`가 유지된다.

수정 방향:
- `signIn()` 성공 후 목적지 계산을 마치면 `setIsAuthenticating(false)`를 먼저 호출한다.
- 그 다음 `router.push(destination)`를 호출한다.
- 성공 시에도 오버레이가 잠깐 남아야 하는 요구가 없다면, 페이지 전환 전에 명시적으로 종료하는 쪽으로 단순화한다.

권장 흐름:
1. 제출 시작
   - `setMessage("")`
   - `setIsAuthenticating(true)`
2. `signIn(..., { redirect: false })`
3. 실패 시
   - `setIsAuthenticating(false)`
   - 에러 메시지 표시
4. 성공 시
   - 목적지 계산
   - `setIsAuthenticating(false)`
   - `router.push(destination)`

### [완료] 5.4 `router.refresh()` 필요성 제거 검토

현재 구조에서는 `router.refresh()`가 오히려 전환 타이밍을 불안정하게 만들 수 있다.

검토 기준:
- `router.push(destination)`만으로 세션 반영 후 대상 페이지 진입이 정상 동작하는지
- 미들웨어와 대상 페이지 데이터 로딩이 `refresh()` 없이도 충분히 새 상태를 반영하는지

권장안:
- `src/app/admin/login/page.tsx`에서 성공 분기의 `router.refresh()`를 제거한다.

제거 이유:
- 성공 직후 라우팅만으로 충분하면 추가 새로고침은 불필요하다.
- 현재 버그 원인을 키우는 보조 요인으로 작동할 수 있다.

### [완료] 5.5 비로그인 접근 안내 로직 회귀 확인

이번 수정은 오버레이 상태 관리가 중심이지만, 기존 `reason` / `next` 기반 로그인 안내 흐름이 깨지지 않아야 한다.

확인 포인트:
- `/admin/users` 미로그인 접근 시 `alert`가 1회 뜨는지
- `next` 파라미터가 유지되는지
- 로그인 성공 후 `/admin/users` 또는 원래 요청한 페이지로 이동하는지

### 5.6 마지막 단계: PR 작성

이 계획의 마지막 단계는 구현만 끝내는 것이 아니라 PR 템플릿에 맞춘 PR 작성까지 포함한다.

완료 직전 수행 항목:
- 변경 요약 정리
- 검증 결과 정리
- 필요한 스크린샷 정리
- `.github/pull_request_template.md` 형식에 맞춰 PR 본문 작성
- 실제 PR 생성 또는 PR 생성 직전 본문 완성

## 6) 예상 코드 변경 포인트

### 6.1 `src/app/admin/login/page.tsx`

예상 수정 내용:
- 성공 분기에서 `setIsAuthenticating(false)` 추가
- `router.refresh()` 제거 또는 조건부 처리
- 기본 이동 경로가 `/admin/users`를 사용하도록 정리
- 필요 시 성공 분기의 흐름을 더 명확하게 읽히도록 정리

### 6.2 `src/lib/auth/redirect.ts`

예상 수정 내용:
- `DEFAULT_ADMIN_REDIRECT = "/admin/users"`로 변경

### 6.3 `src/middleware.ts`

예상 수정 내용:
- 로그인 페이지 진입 시 토큰 보유 사용자의 기본 이동 경로가 `/admin/users` 기준으로 일관되게 동작하는지 점검
- 필요하면 관련 상수 사용만 유지하고 로직은 그대로 둠

## 7) 검증 계획

### 7.1 정적 검증

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm build
```

### 7.2 수동/브라우저 검증

Playwright headed 기준으로 아래를 확인한다.

1. 정상 로그인
- `/admin/login` 진입
- 정상 계정 입력
- 로그인 버튼 클릭
- 오버레이가 뜨더라도 성공 후 즉시 사라지거나 화면 전환과 함께 자연스럽게 종료되는지 확인
- 최종적으로 `/admin/users`로 이동하는지 확인

2. 비로그인 접근 후 로그인
- 로그아웃 상태에서 `/admin/users` 접근
- 안내 `alert` 확인
- 로그인 페이지로 이동 확인
- 정상 로그인 후 `/admin/users`로 복귀 확인

3. 실패 로그인
- 잘못된 비밀번호 입력
- 오버레이가 닫히는지 확인
- 에러 메시지가 표시되는지 확인
- 페이지 이동이 일어나지 않는지 확인

4. 기존 보호 흐름 회귀
- 로그인된 상태에서 `/admin/login` 접근
- 자동으로 `/admin/users`로 리다이렉트되는지 확인

## 8) 산출물

구현 후 남겨야 할 결과:
- 수정된 로그인 로직
- 검증 결과 요약
- 필요 시 신규 스크린샷:
  - 로그인 성공 후 `/admin/users` 도착 화면
  - 실패 로그인 화면
- PR 템플릿 형식에 맞춘 PR 본문 초안 또는 최종 PR

## 9) 리스크와 대응

- 리스크: 성공 직후 오버레이를 너무 빨리 끄면 전환 중 깜빡임이 보일 수 있음  
  대응: 우선 명시적 종료 방식으로 단순화하고, 필요하면 이후 최소 지연 기반 UX를 별도 검토

- 리스크: `router.refresh()` 제거 후 일부 화면이 최신 세션 상태를 바로 반영하지 못할 수 있음  
  대응: 성공 직후 대상 페이지 접근과 미들웨어 통과를 실제로 검증

- 리스크: 기본 이동 경로를 `/admin/users`로 바꾸면서 기존 기대 경로가 달라질 수 있음  
  대응: `next`가 있을 때는 우선 적용하고, `next`가 없을 때만 `/admin/users`를 기본값으로 사용

## 10) 완료 기준

- 로그인 성공 후 오버레이가 계속 남아 있지 않는다.
- 로그인 성공 후 기본 이동 경로가 `/admin/users`로 동작한다.
- `next`가 있는 경우에는 원래 요청한 페이지로 정상 복귀한다.
- 로그인 실패 시 오버레이가 닫히고 오류 메시지가 보인다.
- `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`를 통과한다.
- Playwright headed 검증에서 정상 로그인/실패 로그인/비로그인 접근 흐름이 모두 통과한다.
- PR 템플릿에 적힌 형식대로 PR 본문을 작성하고 PR까지 생성한다.
