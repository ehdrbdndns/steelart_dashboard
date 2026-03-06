# README 스크린샷 갱신 조사 보고서

작성일: 2026-03-06  
대상 저장소: `/Users/donggyunyang/code/steelart_dashboard`  
기준 브랜치: `main` (`origin/main` 최신 pull 반영)

## 1) 조사 목적

- `README.md`의 현재 구성과 스크린샷 참조 상태를 확인한다.
- 오래된 주요 화면 이미지를 최신 UI 기준으로 교체하기 위한 근거를 정리한다.
- `docs/pr-assets`에 이미 존재하는 최신 캡처본의 재사용 가능성을 판단한다.

## 2) 조사 범위

확인 파일:
- `README.md`
- `docs/readme/assets/*`
- `docs/pr-assets/*`
- `src/config/site.tsx` (현재 백오피스 메뉴 기준)

## 3) README 현행 구성 요약

문서 흐름:
1. 프로젝트 개요
2. 역할 분담
3. 개발 과정
4. AI 한계/결과
5. 주요 화면
6. 정리

현재 `# 주요 화면` 섹션은 목록 화면 4장만 포함:
- `docs/readme/assets/user-management.png`
- `docs/readme/assets/artwork-management.png`
- `docs/readme/assets/artist-management.png`
- `docs/readme/assets/banner-management.png`

## 4) 핵심 발견사항

1. 주요 화면 이미지가 오래됨
- `docs/readme/assets`의 목록 이미지 4장 생성 시점이 2026-02-22 기준으로 확인됨.
- 최근 `main` 반영 내용(한글화/화면 변경) 대비 README 반영이 늦어져 있음.

2. 현재 실제 메뉴 구조와 README 표현 간 간극 존재
- 실제 관리자 메뉴(`src/config/site.tsx`): 사용자/작가/작품/코스/홈 배너
- README 주요 화면: 사용자/작품/작가/배너만 존재, 코스 미노출

3. 상세 화면이 README에 없음
- 상세 라우트는 존재:
  - `/admin/users/[id]`
  - `/admin/artists/[id]`
  - `/admin/artworks/[id]`
- 하지만 README는 목록 화면만 보여줌.

4. 재사용 가능한 최신 캡처본이 이미 존재
- `docs/pr-assets`에 한글 UI 기준 최신 캡처가 다수 존재함.

## 5) 최신 캡처 후보 자산(재사용 가능)

### 5.1 목록 후보
- 사용자 목록: `docs/pr-assets/ko-users-list.png`
- 작품 목록: `docs/pr-assets/ko-artworks-list.png`
- 작가 목록: `docs/pr-assets/ko-artists-list.png`
- 홈 배너 목록: `docs/pr-assets/ko-home-banners-list.png`
- 코스 목록(선택): `docs/pr-assets/ko-courses-list.png`

### 5.2 상세 후보
- 사용자 상세: `docs/pr-assets/ko-user-detail.png`
- 작품 상세(수정): `docs/pr-assets/ko-artwork-edit.png`
- 작가 상세(수정): `docs/pr-assets/ko-artist-edit.png`
- 배너 상세 동작(모달): `docs/pr-assets/ko-home-banners-create-modal.png`

## 6) 교체 설계 시 고려사항

1. 파일명 전략
- 기존 목록 4장은 파일명 유지 후 덮어쓰기 권장(README 링크 최소 수정).
- 상세 4장은 신규 파일 추가 권장.

2. 배너는 전용 상세 라우트가 없음
- `/admin/home-banners` 내 모달/행 액션 상태를 상세로 정의해야 함.

3. 해상도/비율 일관성
- `docs/pr-assets/ko-*`는 높이가 제각각(세로로 긴 캡처 다수).
- README 가독성을 위해 동일 비율로 재캡처하거나 후처리 규칙이 필요함.

4. 코스 화면 반영 여부
- 실제 메뉴에는 코스가 존재하므로 README 반영 여부를 사전 결정해야 함.

## 7) 결론

README 스크린샷 갱신은 즉시 필요하다.

- 최소 범위: 기존 목록 4장 교체
- 권장 범위: 목록 4장 + 상세 4장 추가
- 선택 범위: 코스 목록/상세 추가

실행은 `docs/plan.md`에 정리한 절차(백업 -> 캡처/재사용 -> 검수 -> 반영 -> README 갱신 -> 검증)에 따라 진행하는 것이 적절하다.
