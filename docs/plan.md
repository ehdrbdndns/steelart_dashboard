# README 주요/상세 화면 갱신 실행 계획

작성일: 2026-03-06  
대상 저장소: `/Users/donggyunyang/code/steelart_dashboard`  
기준 브랜치: `main` (origin/main 최신 pull 반영)

## 1) 목표

README `# 주요 화면` 섹션을 최신 UI 기준으로 갱신한다.

- 기존 목록 화면 4장 교체
- 상세 화면(배너는 상세 동작) 4장 추가
- 필요 시 코스 화면 포함 여부를 결정해 확장

## 2) 산출물 정의

## 2.1 목록(기존 파일 덮어쓰기)
- `docs/readme/assets/user-management.png`
- `docs/readme/assets/artwork-management.png`
- `docs/readme/assets/artist-management.png`
- `docs/readme/assets/banner-management.png`

## 2.2 상세(신규 파일)
- `docs/readme/assets/user-detail.png`
- `docs/readme/assets/artwork-detail.png`
- `docs/readme/assets/artist-detail.png`
- `docs/readme/assets/banner-detail.png`

## 2.3 코스(선택)
- `docs/readme/assets/course-management.png`
- `docs/readme/assets/course-detail.png`

## 3) 소스 이미지 전략

기본 전략: `docs/pr-assets/ko-*` 최신 캡처 재사용 우선.

매핑 기준:
- `ko-users-list.png` -> `user-management.png`
- `ko-user-detail.png` -> `user-detail.png`
- `ko-artworks-list.png` -> `artwork-management.png`
- `ko-artwork-edit.png` -> `artwork-detail.png`
- `ko-artists-list.png` -> `artist-management.png`
- `ko-artist-edit.png` -> `artist-detail.png`
- `ko-home-banners-list.png` -> `banner-management.png`
- `ko-home-banners-create-modal.png` -> `banner-detail.png`
- (선택) `ko-courses-list.png` -> `course-management.png`

재사용 이미지 품질이 부족하면 해당 항목만 재캡처한다.

## 4) 실행 절차

### Step 0. 사전 조건
- `main` 최신 pull 완료 확인
- 로컬 서버/데이터가 필요한 경우:

```bash
pnpm install
pnpm db:seed:mock
pnpm db:seed:users
pnpm dev
```

### Step 1. 백업

```bash
mkdir -p docs/readme/assets/archive/2026-03-06-readme-screen-refresh
cp README.md docs/readme/assets/archive/2026-03-06-readme-screen-refresh/README.md.bak
cp docs/readme/assets/user-management.png docs/readme/assets/archive/2026-03-06-readme-screen-refresh/
cp docs/readme/assets/artwork-management.png docs/readme/assets/archive/2026-03-06-readme-screen-refresh/
cp docs/readme/assets/artist-management.png docs/readme/assets/archive/2026-03-06-readme-screen-refresh/
cp docs/readme/assets/banner-management.png docs/readme/assets/archive/2026-03-06-readme-screen-refresh/
```

### Step 2. 임시 반영본 생성 (`_draft`)

```bash
mkdir -p docs/readme/assets/_draft
cp docs/pr-assets/ko-users-list.png docs/readme/assets/_draft/user-management.new.png
cp docs/pr-assets/ko-user-detail.png docs/readme/assets/_draft/user-detail.new.png
cp docs/pr-assets/ko-artworks-list.png docs/readme/assets/_draft/artwork-management.new.png
cp docs/pr-assets/ko-artwork-edit.png docs/readme/assets/_draft/artwork-detail.new.png
cp docs/pr-assets/ko-artists-list.png docs/readme/assets/_draft/artist-management.new.png
cp docs/pr-assets/ko-artist-edit.png docs/readme/assets/_draft/artist-detail.new.png
cp docs/pr-assets/ko-home-banners-list.png docs/readme/assets/_draft/banner-management.new.png
cp docs/pr-assets/ko-home-banners-create-modal.png docs/readme/assets/_draft/banner-detail.new.png
```

(선택) 코스:
```bash
cp docs/pr-assets/ko-courses-list.png docs/readme/assets/_draft/course-management.new.png
```

### Step 3. 임시본 검수

검수 기준:
- 파일 누락/손상 없음
- 텍스트 가독성 양호
- 목록/상세 페어 매칭 정확
- 한국어 UI 기준 최신 상태 반영

검수 명령:
```bash
for f in docs/readme/assets/_draft/*.png; do
  sips -g pixelWidth -g pixelHeight "$f"
done
```

필요 시 수행:
- 화면 비율이 과도하게 길면 해당 파일만 재캡처 또는 후처리

### Step 4. 정식 파일 반영

```bash
cp docs/readme/assets/_draft/user-management.new.png docs/readme/assets/user-management.png
cp docs/readme/assets/_draft/artwork-management.new.png docs/readme/assets/artwork-management.png
cp docs/readme/assets/_draft/artist-management.new.png docs/readme/assets/artist-management.png
cp docs/readme/assets/_draft/banner-management.new.png docs/readme/assets/banner-management.png

cp docs/readme/assets/_draft/user-detail.new.png docs/readme/assets/user-detail.png
cp docs/readme/assets/_draft/artwork-detail.new.png docs/readme/assets/artwork-detail.png
cp docs/readme/assets/_draft/artist-detail.new.png docs/readme/assets/artist-detail.png
cp docs/readme/assets/_draft/banner-detail.new.png docs/readme/assets/banner-detail.png
```

### Step 5. README 섹션 개편

`# 주요 화면` 섹션을 아래 순서로 구성:
1. `### 사용자 관리(목록)` + `user-management.png`
2. `### 사용자 상세` + `user-detail.png`
3. `### 작품 관리(목록)` + `artwork-management.png`
4. `### 작품 상세` + `artwork-detail.png`
5. `### 작가 관리(목록)` + `artist-management.png`
6. `### 작가 상세` + `artist-detail.png`
7. `### 배너/콘텐츠 관리(목록)` + `banner-management.png`
8. `### 배너 상세 동작` + `banner-detail.png`

(선택) 코스 반영 시:
- `### 코스 관리(목록)` + `course-management.png`
- `### 코스 상세` + `course-detail.png`

### Step 6. 링크/렌더 검증

```bash
rg -n "user-management.png|user-detail.png|artwork-management.png|artwork-detail.png|artist-management.png|artist-detail.png|banner-management.png|banner-detail.png" README.md
```

```bash
git status --short
```

## 5) 결정 포인트

1. 코스 화면을 README에 포함할지
- A안: 기존 4개 도메인만 유지
- B안: 코스 목록/상세까지 확장

2. 배너 상세 이미지 유형
- A안: 생성 모달(`ko-home-banners-create-modal.png`)
- B안: 이미지 교체/정렬 액션 화면 재캡처

3. 용어 통일
- `배너/콘텐츠 관리` 유지 여부
- `배너(Home Banners) 관리` 병기 여부

## 6) 리스크 및 대응

- 리스크: 이미지 비율 불일치로 README 가독성 저하
  - 대응: `_draft` 단계에서 선검수 후 필요한 파일만 재캡처

- 리스크: README 섹션이 길어짐
  - 대응: 상세 이미지는 도메인당 1장 원칙 유지

- 리스크: 캡처 시점 데이터 불일치
  - 대응: 시드 고정 + 동일 환경에서 일괄 생성

## 7) 롤백

README/기존 목록 복원:
```bash
cp docs/readme/assets/archive/2026-03-06-readme-screen-refresh/README.md.bak README.md
cp docs/readme/assets/archive/2026-03-06-readme-screen-refresh/user-management.png docs/readme/assets/user-management.png
cp docs/readme/assets/archive/2026-03-06-readme-screen-refresh/artwork-management.png docs/readme/assets/artwork-management.png
cp docs/readme/assets/archive/2026-03-06-readme-screen-refresh/artist-management.png docs/readme/assets/artist-management.png
cp docs/readme/assets/archive/2026-03-06-readme-screen-refresh/banner-management.png docs/readme/assets/banner-management.png
```

신규 상세 이미지 제거:
```bash
rm -f docs/readme/assets/user-detail.png
rm -f docs/readme/assets/artwork-detail.png
rm -f docs/readme/assets/artist-detail.png
rm -f docs/readme/assets/banner-detail.png
rm -f docs/readme/assets/course-management.png
rm -f docs/readme/assets/course-detail.png
```

## 8) 완료 기준 (DoD)

- 목록 4장 최신 UI로 교체 완료
- 상세 4장 신규 추가 완료
- README 주요 화면 섹션 목록/상세 구조 반영 완료
- 이미지 링크 깨짐 없음
- 롤백 경로 확보 완료
