# Plan: Places CRUD + 카카오 지도 기반 자동 위경도 입력

작성일: 2026-03-05  
대상 저장소: `/Users/donggyunyang/code/steelart_dashboard`  
작업 브랜치: `codex/feta/place-crud`

## 0) 계획 수립 근거 (실제 코드 확인)

요청대로 변경 계획 작성 전 실제 소스 파일을 읽고 현재 상태를 확인했다.

확인한 파일:

- Places/API/검증
  - `src/app/api/admin/places/route.ts`
  - `src/lib/server/validators/admin.ts`
  - `src/lib/server/sql.ts`
  - `src/lib/server/api-response.ts`
- CRUD 패턴 레퍼런스
  - `src/app/api/admin/artists/route.ts`
  - `src/app/api/admin/artists/[id]/route.ts`
  - `src/app/api/admin/artists/[id]/soft-delete/route.ts`
  - `src/app/api/admin/artists/[id]/restore/route.ts`
  - `src/app/api/admin/courses/route.ts`
  - `src/app/api/admin/courses/[id]/route.ts`
  - `src/app/admin/artists/page.tsx`
  - `src/app/admin/courses/page.tsx`
  - `src/components/admin/artists-form.tsx`
- Places 연계 사용처
  - `src/app/admin/artworks/page.tsx`
  - `src/components/admin/artworks-form.tsx`
  - `src/app/api/admin/artworks/route.ts`
- 네비게이션/클라이언트/환경변수 패턴
  - `src/config/site.tsx`
  - `src/components/nav/admin-top-nav.tsx`
  - `src/lib/client/admin-api.ts`
  - `src/lib/server/env.ts`
  - `.env.example`
  - `src/app/api/admin/uploads/presign/route.ts`

확인 결과 핵심:

1. `places`는 현재 `GET /api/admin/places`만 존재한다.
2. Admin에 places 전용 목록/생성/수정 페이지가 없다.
3. 지도/카카오/지오코딩 관련 코드가 현재 저장소에 없다.
4. `places.lat/lng`는 DB에서 NOT NULL이므로 생성/수정 UX에서 반드시 다뤄야 한다.

## 1) 요구사항 정리

이번 구현의 핵심 요구:

1. Admin에서 Place CRUD 가능
2. 주소 입력 시 위도/경도가 자동 채워짐
3. 자동 채워진 위도/경도는 사용자가 수동으로 수정 가능
4. 위경도 자동 조회는 카카오 지도 기반으로 구현
5. 마지막 단계는 반드시 PR 작성(스크린샷 포함)

## 2) 설계 방향

### 2.1 카카오 기반 위경도 자동 입력 방식

선택:
- 클라이언트에서 Kakao Maps JS SDK(`services` 라이브러리 포함)를 로드하고
- `addressSearch`로 주소 -> 좌표 변환
- 결과 1순위를 `lat/lng` 필드에 자동 반영

이유:

1. “카카오 지도 사용” 요구에 직접 부합
2. 관리자가 입력 즉시 결과 확인 가능 (UX 즉시성)
3. 별도 서버 geocode proxy 없이도 빠르게 구현 가능

### 2.2 자동 입력 + 수동 수정 충돌 정책

정책:

1. 주소 입력이 변경되면 디바운스 후 자동 지오코딩 실행
2. 자동 결과가 있으면 `lat/lng`를 업데이트
3. 사용자는 `lat/lng` 입력 필드를 언제든 수동 수정 가능
4. 저장 시점 최종 값은 입력창 값(수동 수정 포함)을 그대로 사용

보완 UX:

1. `좌표 다시 찾기` 버튼 제공
2. `자동 입력됨` / `수동 수정됨` 상태 텍스트 제공
3. 자동 조회 실패 시 에러 표시하되 저장 자체는 막지 않음(수동 입력 가능)

### 2.3 기존 사용처 호환성

현재 artworks가 `/api/admin/places?deleted=exclude`를 옵션 목록으로 사용하므로, places API 확장 시 기존 응답 소비를 깨지 않도록 설계한다.

## 3) 대상 산출물

1. Places CRUD API
2. Places Admin 페이지(목록/생성/수정)
3. PlacesForm의 주소-좌표 자동 입력 UX (Kakao Maps)
4. 네비게이션 연결
5. 환경변수/운영문서 업데이트
6. PR 작성

## 4) 상세 구현 단계

## Step 0. 선행 준비 (필수) [x]

### Step 0-1. `main` 최신 내용 동기화 [x]

구현 작업 전에 현재 브랜치를 `main` 최신 상태와 먼저 동기화한다.

권장 절차:

1. `git fetch origin`
2. 현재 브랜치에서 `origin/main` 병합 또는 리베이스
3. 충돌 해결 후 `pnpm lint`/`pnpm build`로 베이스 안정성 확인

완료 기준:
- 현재 브랜치가 `main` 최신 변경을 포함한 상태에서 구현 시작

실행 결과:
- `git fetch origin` 후 `origin/main` 동기화 완료
- 현재 상태: `HEAD...origin/main = 0 / 0` (동일)

### Step 0-2. 카카오 키 선설정 [x]

실제 구현 전에 카카오 키를 먼저 세팅한다.

작업:

1. 로컬 `.env`에 `NEXT_PUBLIC_KAKAO_MAP_APP_KEY` 추가
2. 카카오 콘솔에서 개발 도메인(`localhost`) 허용 설정 확인
3. SDK 로딩 사전 점검(키 누락/권한 오류 메시지 확인)

완료 기준:
- 키 누락 없이 카카오 SDK 로드 가능한 환경이 준비된 상태

실행 결과:
- 로컬 `.env`에 `NEXT_PUBLIC_KAKAO_MAP_APP_KEY` 엔트리 추가 완료
- 현재 값은 실제 키로 설정된 상태 확인

## Step 1. Validator 확장 [x]

대상:
- `src/lib/server/validators/admin.ts`

추가:

1. `placesQuerySchema`
  - `query`, `zoneId`, `deleted`, `page`, `size`
2. `placeCreatePayloadSchema`
3. `placeUpdatePayloadSchema`
4. 필드 검증
  - `name_ko`, `name_en`: trim + min(1)
  - `address`: optional/nullable
  - `lat`: number, -90~90
  - `lng`: number, -180~180
  - `zone_id`: optional/nullable positive int

완료 기준:
- place 관련 API에서 파라미터/바디를 공통 스키마로 검증

실행 결과:
- `src/lib/server/validators/admin.ts` 반영 완료
  - `placesQuerySchema`
  - `placeCreatePayloadSchema`
  - `placeUpdatePayloadSchema`

## Step 2. Places 목록/생성 API 확장 [x]

대상:
- `src/app/api/admin/places/route.ts`

작업:

1. GET 확장
  - 기존 필터(query/zoneId/deleted) 유지
  - page/size 있으면 pagination meta 반환
  - page/size 없으면 기존과 동일한 전체 목록 반환(artworks 호환)
  - `zones` LEFT JOIN으로 `zone_name_ko` 포함
  - `address`, `lat`, `lng`, `created_at`, `updated_at` 포함
2. POST 추가
  - create payload insert
  - 생성 row 재조회 반환

완료 기준:
- `/api/admin/places`에서 목록 + 생성 동작

실행 결과:
- `src/app/api/admin/places/route.ts` 반영 완료
  - GET: 기존 호환(비페이지) + 페이지네이션 모드(meta) 동시 지원
  - GET: `zones` LEFT JOIN, `address/lat/lng/created_at/updated_at` 반환 확장
  - POST: place 생성 후 row 재조회 반환 추가

## Step 3. Places 단건/수정 API 추가 [x]

신규:
- `src/app/api/admin/places/[id]/route.ts`

작업:

1. GET by id
2. PUT by id
3. 없으면 `404 NOT_FOUND`

완료 기준:
- 수정 페이지에서 조회/저장 가능

실행 결과:
- `src/app/api/admin/places/[id]/route.ts` 추가 완료
  - GET `/api/admin/places/:id`
  - PUT `/api/admin/places/:id`
  - 404 `NOT_FOUND` 처리

## Step 4. Places soft-delete/restore API 추가 [x]

신규:
- `src/app/api/admin/places/[id]/soft-delete/route.ts`
- `src/app/api/admin/places/[id]/restore/route.ts`

soft-delete 규칙:

1. active artwork 참조 검사
  - `SELECT COUNT(*) ...`
2. count > 0이면 `409 PLACE_IN_USE`
3. 아니면 `deleted_at = NOW()`

restore 규칙:

1. `deleted_at = NULL`
2. `affectedRows = 0`이면 404

완료 기준:
- 삭제/복구 정책이 artworks 연계와 충돌 없이 동작

실행 결과:
- `src/app/api/admin/places/[id]/soft-delete/route.ts` 추가 완료
- `src/app/api/admin/places/[id]/restore/route.ts` 추가 완료
- `soft-delete`에서 active artwork 참조 검사 + `409 PLACE_IN_USE` 반영 완료

## Step 5. PlacesForm 구현 (카카오 지도 자동 위경도 포함) [x]

신규:
- `src/components/admin/places-form.tsx`

핵심 UX:

1. 필드
  - `name_ko`, `name_en`, `zone_id`, `address`, `lat`, `lng`
2. 주소 입력 시 자동 좌표 찾기
  - 디바운스(예: 500~700ms)
  - `kakao.maps.services.Geocoder().addressSearch(...)`
  - 성공 시 `setValue("lat")`, `setValue("lng")`
3. 수동 수정
  - `lat/lng` Input은 항상 editable
  - 자동 반영 후에도 사용자가 숫자값 직접 변경 가능
4. 상태 표시
  - 로딩/실패/성공/수동수정 상태 메시지
5. 보조 액션
  - `좌표 다시 찾기` 버튼(수동 트리거)

Kakao 스크립트 로딩:

1. `next/script` 또는 동적 로더 사용
2. SDK URL에 `libraries=services` 포함
3. `autoload=false`일 경우 `kakao.maps.load` 처리
4. SDK 준비 전에는 자동 geocode 비활성 + 안내 문구

완료 기준:
- 주소 입력으로 좌표 자동 채움 + 수동 수정 + 저장 가능

실행 결과:
- `src/components/admin/places-form.tsx` 추가 완료
  - 카카오 SDK 로딩 + 주소 입력 디바운스 자동 지오코딩
  - `lat/lng` 자동 채움
  - `lat/lng` 수동 수정 가능
  - `좌표 다시 찾기` 수동 트리거 제공
- `src/types/kakao-maps.d.ts` 추가로 SDK 타입 선언 반영

## Step 6. Places 페이지 구성 [x]

신규:
- `src/app/admin/places/page.tsx`
- `src/app/admin/places/new/page.tsx`
- `src/app/admin/places/[id]/page.tsx`

구성:

1. 목록 페이지
  - 필터: query/zone/deleted/page/size
  - 컬럼: id, name_ko, name_en, zone, address, lat, lng, deleted, actions
  - 액션: 수정, 삭제, 복구
2. 신규 페이지
  - `PlacesForm mode="create"`
3. 수정 페이지
  - 단건 조회 후 `PlacesForm mode="edit"`

완료 기준:
- Place 관리의 CRUD UI 플로우 완성

실행 결과:
- `src/app/admin/places/page.tsx` 추가 완료
- `src/app/admin/places/new/page.tsx` 추가 완료
- `src/app/admin/places/[id]/page.tsx` 추가 완료

## Step 7. 네비게이션 반영 [x]

대상:
- `src/config/site.tsx`
- `src/components/nav/admin-top-nav.tsx`

작업:

1. 사이드바 `Places` 항목 추가
2. 상단 타이틀 매핑 `/admin/places` 추가

완료 기준:
- 메뉴에서 접근 가능

실행 결과:
- `src/config/site.tsx`에 장소 메뉴 추가 완료
- `src/components/nav/admin-top-nav.tsx`에 `/admin/places` 타이틀 매핑 추가 완료

## Step 8. 문서 동기화 [x]

대상:
- `docs/research.md`
- `docs/admin-backoffice.md`
- `docs/db-contract.md`
- `.env.example` (카카오 키 항목 반영)

반영:

1. Places CRUD 구현 상태
2. `PLACE_IN_USE` 삭제 정책
3. 카카오 기반 주소->좌표 자동입력 UX
4. 환경변수 요구사항

실행 결과:
- `.env.example`에 `NEXT_PUBLIC_KAKAO_MAP_APP_KEY` 추가 완료
- `docs/db-contract.md` places soft-delete 정책/`PLACE_IN_USE` 규칙 반영 완료
- `docs/admin-backoffice.md` places CRUD/카카오 geocode 정책 반영 완료
- `docs/research.md` 구현 상태 반영 완료

## Step 9. 검증 계획 [x]

정적 검증:

1. `pnpm exec tsc --noEmit`
2. `pnpm lint`
3. `pnpm build`

수동 검증:

1. Places 생성
  - 주소 입력 시 lat/lng 자동 채움 확인
  - 자동값 수동 수정 후 저장 확인
2. Places 수정
  - 주소 변경 시 lat/lng 재자동 채움 확인
  - 수동 수정값 저장 확인
3. geocode 실패 케이스
  - 주소 미매칭/SDK 미로딩 시 에러 표기 + 수동 저장 가능 확인
4. 삭제/복구
  - 미참조 place 삭제/복구 성공
  - 참조 place 삭제 시 `409 PLACE_IN_USE`
5. 회귀
  - artworks 목록/폼 장소 옵션 로딩 정상

실행 결과:
- `pnpm exec tsc --noEmit` 통과
- `pnpm lint` 통과
- `pnpm build` 통과

## Step 10. Git/PR (항상 마지막) [x]

마지막 단계는 반드시 PR 작성으로 종료한다.

1. `git diff` / `git status` 점검
2. 커밋
3. 푸시
4. PR 생성/업데이트
  - `## 요약`
  - `## 변경 내용`
  - `## 검증`
  - `## 스크린샷` (자동입력, 수동수정, 삭제차단 포함)

실행 결과:
- 브랜치 푸시 완료: `origin/codex/feta/place-crud`
- PR 생성 완료: `https://github.com/ehdrbdndns/steelart_dashboard/pull/6`

## 5) 완료 기준 (DoD)

1. 현재 브랜치가 `main` 최신 변경을 포함한 상태에서 구현 시작됨
2. `NEXT_PUBLIC_KAKAO_MAP_APP_KEY` 선설정 및 SDK 로딩 가능 상태 확인됨
3. Places CRUD API/페이지 동작
4. 주소 입력 시 카카오 기반 자동 lat/lng 입력 동작
5. lat/lng 수동 수정 가능 및 저장 반영
6. `PLACE_IN_USE` 차단 정책 동작
7. artworks places 소비 흐름 무회귀
8. 타입/린트/빌드 통과
9. PR 작성 완료 (마지막 단계 준수)
