## 요약
- 운영 배포에서 관리자 로그인 성공 직후 첫 보호 페이지 이동이 다시 로그인으로 튕기던 레이스 컨디션을 수정했습니다.

## 변경내용
- `src/app/admin/login/page.tsx`에서 로그인 성공 후 이동 방식을 `router.push(...)`에서 `window.location.replace(...)`로 변경했습니다.
- 인증 성공 직후에는 로딩 오버레이를 유지한 채 전체 문서 이동을 시작하도록 정리했습니다.
- `next` 파라미터와 기본 fallback 경로(`/admin/users`) 흐름이 그대로 유지되는지 로컬 브라우저 기준으로 검증했습니다.
- 운영 배포(`https://steelartdashboard.vercel.app/admin/login`)에서 기존 문제를 재현해 원인이 App Router 클라이언트 이동 타이밍임을 확인했습니다.

## 검증
- `pnpm exec tsc --noEmit`
- `pnpm lint`
- `pnpm build`
- Playwright headed 로컬 검증
- 운영 배포에서 로그인 성공 직후 `GET /admin/users?_rsc=... -> 307 -> /admin/login?reason=auth-required&next=/admin/users` 재현 확인
- 같은 세션으로 `/api/auth/session` 정상 응답 및 `/admin/users` 직접 진입 성공 확인
- 브랜치 preview 배포는 Vercel SSO 보호(`401`)로 앱 페이지 자동 검증 불가

## 스크린샷
- 로그인 성공 후 `/admin/users`

![login success](https://raw.githubusercontent.com/ehdrbdndns/steelart_dashboard/codex/fix-login-redirect-race/docs/pr-assets/auth-login-redirect-race-local-success.png)

- 로그인 실패 화면

![login failure](https://raw.githubusercontent.com/ehdrbdndns/steelart_dashboard/codex/fix-login-redirect-race/docs/pr-assets/auth-login-redirect-race-local-failure.png)

- 보호 페이지 접근 후 로그인 시 원래 경로 복귀

![return target](https://raw.githubusercontent.com/ehdrbdndns/steelart_dashboard/codex/fix-login-redirect-race/docs/pr-assets/auth-login-redirect-race-local-return-target.png)
