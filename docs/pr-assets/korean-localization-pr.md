## 요약
- 관리자 UI의 사용자 노출 영어 표기를 한국어로 전환했다.
- 표시 문자열 한국어화, 내부 로직 무변경 원칙으로 진행했다.

## 변경내용
- 글로벌 네비/탑바 타이틀 한국어화
- 로그인/테마 토글 텍스트 한국어화
- Users/Artists/Courses/Home Banners/Artworks 화면의 라벨, 필터, 컬럼명 한국어화
- enum 저장값은 유지하고 UI 표시만 매핑(`COMPANY` -> `단체` 등)
- 문서 갱신: `docs/plan.md`, `docs/research.md`

## 검증
- `pnpm exec tsc --noEmit` 통과
- `pnpm lint` 통과
- `pnpm build` 통과
- Playwright headed E2E:
  - 로그인 라벨 확인
  - 메뉴/탑바 한국어 표기 확인
  - Users/Artists/Courses/Home Banners/Artworks 주요 화면 확인
  - 저장/삭제/복구(해당 화면) 동작 확인

## 스크린샷
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
