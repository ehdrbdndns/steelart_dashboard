## 요약
- 로그인 성공 후 로딩 오버레이가 남아 보이던 문제를 수정했습니다.
- 로그인 성공 시 기본 이동 경로를 `/admin/users`로 통일했습니다.
- 비로그인 접근 후 `alert`와 `next` 복귀 흐름, 로그인된 상태의 `/admin/login` 리다이렉트를 함께 정리했습니다.

## 변경내용
- `src/app/admin/login/page.tsx`
  - 로그인 성공 분기에서 `isAuthenticating`를 명시적으로 종료하도록 수정했습니다.
  - 성공 후 불필요한 `router.refresh()` 호출을 제거했습니다.
- `src/lib/auth/redirect.ts`
  - 기본 관리자 리다이렉트 경로를 `/admin/users`로 변경했습니다.
- `src/middleware.ts`
  - `withAuth` 기반 처리 대신 `getToken()`으로 직접 토큰을 확인하도록 변경했습니다.
  - 로그인된 상태에서 `/admin/login` 접근 시 `/admin/users` 또는 안전한 `next` 경로로 리다이렉트되도록 맞췄습니다.

## 검증
- `pnpm exec tsc --noEmit`
- `pnpm lint`
- `pnpm build`
- Playwright headed
  - `/admin/login` 정상 로그인 후 `/admin/users` 이동 확인
  - 비로그인 상태에서 `/admin/home-banners` 접근 시 안내 `alert` 발생 확인
  - 안내 흐름에서 로그인 후 원래 요청한 `/admin/home-banners`로 복귀 확인
  - 실패 로그인 시 오류 메시지 노출 및 로딩 오버레이 종료 확인
  - 로그인된 상태에서 `/admin/login` 접근 시 `/admin/users` 리다이렉트 확인

## 스크린샷
- 로그인 처리 오버레이

  ![로그인 처리 오버레이](https://raw.githubusercontent.com/ehdrbdndns/steelart_dashboard/codex/fix-login-overlay-stuck/docs/pr-assets/auth-login-loading-overlay.png)

- 정상 로그인 후 `/admin/users`

  ![정상 로그인 후 사용자 페이지](https://raw.githubusercontent.com/ehdrbdndns/steelart_dashboard/codex/fix-login-overlay-stuck/docs/pr-assets/auth-login-success-users.png)

- 비로그인 접근 후 로그인 페이지 안내 상태

  ![비로그인 접근 후 로그인 페이지](https://raw.githubusercontent.com/ehdrbdndns/steelart_dashboard/codex/fix-login-overlay-stuck/docs/pr-assets/auth-login-required-alert.png)

- 로그인 후 원래 요청 경로 복귀

  ![원래 요청 경로 복귀](https://raw.githubusercontent.com/ehdrbdndns/steelart_dashboard/codex/fix-login-overlay-stuck/docs/pr-assets/auth-login-return-to-target.png)

- 실패 로그인

  ![실패 로그인](https://raw.githubusercontent.com/ehdrbdndns/steelart_dashboard/codex/fix-login-overlay-stuck/docs/pr-assets/auth-login-failure.png)
