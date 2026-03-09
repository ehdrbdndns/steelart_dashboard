# 로그인 성공 후 팝업 지속 노출 버그 조사

작성일: 2026-03-09  
대상 저장소: `/Users/donggyunyang/code/steelart/steelart_dashboard`

## 1) 조사 대상

- 증상: 처음 로그인에 성공한 뒤에도 중앙 팝업형 UI가 닫히지 않고 계속 떠 있는 것처럼 보임(추가로 로그인 완료 이후 다음 페이지로 넘어가지 않음, User Page로 이동하도록 수정)
- 관련 파일:
  - `src/app/admin/login/page.tsx`
  - `src/components/ui/blocking-overlay.tsx`
  - `src/components/admin/admin-api-blocking-overlay.tsx`
  - `src/middleware.ts`
  - `src/app/admin/layout.tsx`

## 2) 결론

원인은 브라우저 `window.alert`가 아니라 로그인 로딩용 `BlockingOverlay` 상태 관리다.

- 로그인 시작 시 `isAuthenticating`를 `true`로 올린다.
- 로그인 실패나 예외 때만 `isAuthenticating`를 `false`로 내린다.
- 로그인 성공 분기에서는 `isAuthenticating`를 내리지 않고 `router.push()`와 `router.refresh()`만 호출한다.

즉, 성공 후 오버레이 종료를 명시적으로 처리하지 않고 페이지 언마운트에만 기대고 있어서, 첫 로그인 전환 구간이 길어지면 오버레이가 계속 남아 보일 수 있다.

## 3) 왜 `alert` 자체의 문제는 아닌가

- `window.alert(...)`는 로그인 페이지 진입 시 `reason=auth-required`가 있을 때만 실행된다.
- 로그인 성공 분기에는 `window.alert(...)` 호출이 없다.
- 실제 브라우저 `alert`가 열려 있으면 사용자는 로그인 버튼 클릭 이후 상호작용을 진행할 수 없으므로, "로그인 성공 후에도 남아 있다"는 현상과 코드 흐름이 맞지 않는다.

따라서 사용자가 말한 "alert창"은 실제로는 중앙 로딩 오버레이를 의미하는 것으로 보는 게 타당하다.

## 4) 상세 원인

### 4.1 로그인 페이지 상태 흐름

현재 `src/app/admin/login/page.tsx`는 다음 흐름으로 동작한다.

1. 제출 시작:
   - `setIsAuthenticating(true)`
2. 실패:
   - `setIsAuthenticating(false)`
   - 에러 메시지 표시
3. 예외:
   - `setIsAuthenticating(false)`
   - 공통 실패 메시지 표시
4. 성공:
   - `router.push(destination)`
   - `router.refresh()`
   - `setIsAuthenticating(false)` 없음

### 4.2 오버레이 렌더 조건

- `BlockingOverlay`는 `open={isAuthenticating}`일 때만 렌더링된다.
- `open`이 `true`인 동안은 화면 전체를 덮고 body scroll도 잠근다.
- 따라서 성공 후에도 `isAuthenticating`가 유지되면 오버레이는 계속 남는다.

### 4.3 왜 첫 로그인에서 특히 잘 보이나

- 첫 로그인은 세션이 없는 상태에서 시작한다.
- 성공 직후 세션 반영, 미들웨어 통과, 대상 관리자 페이지 렌더가 한 번에 이어진다.
- 이 첫 전환 구간이 길어지면 로그인 페이지가 더 오래 유지되고, 그 동안 `isAuthenticating`가 계속 `true`이므로 오버레이가 붙잡혀 보이기 쉽다.

### 4.4 `router.refresh()`의 영향

- 성공 직후 `router.push()` 다음에 `router.refresh()`를 바로 호출하고 있다.
- 이 구조는 라우트 전환이 완전히 커밋되기 전에 현재 트리를 다시 갱신할 여지를 만든다.
- 따라서 오버레이가 눈에 띄게 오래 남는 현상을 더 키울 가능성이 있다.

## 5) 핵심 근거

- `src/app/admin/login/page.tsx`
  - 성공 시 `setIsAuthenticating(false)` 없음
  - 오버레이 노출이 `isAuthenticating`에 직접 연결됨
- `src/components/ui/blocking-overlay.tsx`
  - `open`이 `true`인 동안 전면 오버레이 유지
- `src/app/admin/layout.tsx`
  - 로그인 페이지도 `/admin` 레이아웃 하위에서 렌더링됨

## 6) 수정 방향 메모

안전한 수정 방향은 아래와 같다.

1. 로그인 성공 후 오버레이 종료 시점을 명시적으로 정의한다. (로그인이 성공하면 오버레이를 종료하고 user page로 이동한다.)
2. `router.refresh()`가 정말 필요한지 재검토한다.
3. 오버레이 종료를 페이지 언마운트에만 의존하지 않도록 상태 전환을 분리한다.
