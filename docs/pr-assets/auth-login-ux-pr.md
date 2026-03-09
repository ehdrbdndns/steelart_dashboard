## 요약
- 로그인 제출 후 인증 성공까지 유지되는 전체 화면 로딩 오버레이를 추가했습니다.
- 비로그인 상태에서 관리자 페이지 접근 시 로그인 안내 `alert`를 노출하고, 로그인 후 원래 요청한 경로로 복귀하도록 정리했습니다.
- `docs/pr-assets`의 기존 이미지 자산을 정리하고 이번 기능 검증용 스크린샷만 다시 저장했습니다.

## 변경내용
- 공용 `BlockingOverlay` 컴포넌트를 추가하고 관리자 API 오버레이가 이를 재사용하도록 정리했습니다.
- `src/app/admin/login/page.tsx`에 `isAuthenticating` 상태, 전면 로딩 오버레이, 비로그인 접근 `alert`, `next` 경로 복귀 처리를 추가했습니다.
- `src/middleware.ts`에서 비로그인 접근 시 `reason`/`next` 쿼리를 붙여 로그인 페이지로 리다이렉트하도록 변경했습니다.
- `src/lib/auth/redirect.ts`에 안전한 관리자 리다이렉트 경로 검증 유틸을 추가했습니다.
- 문서 갱신: `docs/plan.md`, `docs/research.md`

## 검증
- `pnpm exec tsc --noEmit`
- `pnpm lint`
- `pnpm build`
- Playwright headed 직접 검증
- 정상 로그인 시 로딩 오버레이 표시 후 `/admin/artists` 이동 확인
- 잘못된 로그인 시 오버레이 해제와 에러 메시지 표시 확인
- 로그아웃 상태에서 `/admin/users` 접근 시 `alert("로그인이 필요합니다. 로그인 후 다시 시도해 주세요.")` 확인
- `alert` 처리 후 `reason` 파라미터 제거와 `/admin/login?next=%2Fadmin%2Fusers` 상태 확인
- 로그인 후 `/admin/users`로 원래 경로 복귀 확인

## 스크린샷
- 로그인 로딩 오버레이  
  ![로그인 로딩 오버레이](https://github.com/ehdrbdndns/steelart_dashboard/blob/codex/login-auth-ux/docs/pr-assets/auth-login-loading-overlay.png?raw=1)

- 비로그인 접근 안내 후 로그인 페이지  
  Headed Playwright에서 `alert` 문구를 확인한 뒤 캡처한 상태입니다.  
  ![비로그인 접근 후 로그인 페이지](https://github.com/ehdrbdndns/steelart_dashboard/blob/codex/login-auth-ux/docs/pr-assets/auth-login-required-alert.png?raw=1)

- 로그인 후 원래 페이지 복귀  
  ![로그인 후 원래 페이지 복귀](https://github.com/ehdrbdndns/steelart_dashboard/blob/codex/login-auth-ux/docs/pr-assets/auth-login-return-to-target.png?raw=1)
