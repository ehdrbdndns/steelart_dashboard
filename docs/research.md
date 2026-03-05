# SteelArt `places` CRUD 조사 보고서

작성일: 2026-03-05  
대상 저장소: `/Users/donggyunyang/code/steelart_dashboard`  
목적: Admin에 `places` CRUD 페이지/API를 추가하기 위한 선행 조사

## 1) 조사 범위

아래 파일을 실제로 확인했다.

- API/서버
  - `src/app/api/admin/places/route.ts`
  - `src/app/api/admin/artworks/route.ts`
  - `src/app/api/admin/artworks/[id]/route.ts`
  - `src/app/api/admin/zones/route.ts`
  - `src/lib/server/validators/admin.ts`
  - `src/lib/server/api-response.ts`
  - `src/lib/server/sql.ts`
- Admin UI/네비게이션
  - `src/app/admin/artworks/page.tsx`
  - `src/components/admin/artworks-form.tsx`
  - `src/config/site.tsx`
  - `src/components/nav/admin-top-nav.tsx`
- DB/문서/스크립트
  - `docs/db-schema.sql`
  - `docs/db-contract.md`
  - `docs/admin-backoffice.md`
  - `scripts/seed-mock-data.mjs`
  - `scripts/export-db-schema.mjs`

## 2) 현재 구현 상태

`places`는 관리자 CRUD와 카카오 기반 좌표 자동입력이 반영된 상태다.

- 구현됨
  - `GET /api/admin/places` (query/zoneId/deleted + page/size)
  - `POST /api/admin/places`
  - `GET /api/admin/places/:id`
  - `PUT /api/admin/places/:id`
  - `POST /api/admin/places/:id/soft-delete`
  - `POST /api/admin/places/:id/restore`
  - `/admin/places`, `/admin/places/new`, `/admin/places/[id]`
  - 사이드바/탑바 네비게이션(Places/장소)
  - PlacesForm 주소 입력 시 카카오 SDK 기반 `lat/lng` 자동 입력
  - 자동 입력 후 `lat/lng` 수동 수정 가능

## 3) DB 모델 및 제약

`docs/db-schema.sql` 기준 `places` 테이블:

- 주요 컬럼
  - `id` PK
  - `name_ko`, `name_en` (NOT NULL)
  - `address` (NULL 허용)
  - `lat`, `lng` (NOT NULL)
  - `zone_id` (NULL 허용)
  - `deleted_at`, `created_at`, `updated_at`
- 인덱스
  - `idx_places_zone_id (zone_id)`
  - `idx_places_lat_lng (lat, lng)`
  - `idx_places_deleted_at (deleted_at)`
- FK
  - `places.zone_id -> zones.id ON DELETE SET NULL`
  - `artworks.place_id -> places.id` (ON DELETE 옵션 없음)

해석:

- zone 삭제 시 place는 남고 `zone_id`만 `NULL` 처리된다.
- place를 hard delete하면 artworks FK 제약으로 실패할 수 있다.
- place 이름 유니크 제약은 없다.

## 4) 현재 API 계약 (`GET /api/admin/places`)

파일: `src/app/api/admin/places/route.ts`

- 입력
  - `query`: `name_ko/name_en` LIKE 검색
  - `zoneId`: 권역 필터
  - `deleted`: `all | only | exclude` (default `exclude`)
- 출력
  - 비페이지 모드: `{ data: PlaceRow[] }`
  - 페이지 모드: `{ data: PlaceRow[], meta }`
  - `PlaceRow`에는 `zone_name_ko`, `address`, `lat`, `lng`, `created_at`, `updated_at` 포함
  - 정렬: `ORDER BY name_ko ASC`
- 특성
  - 기존 artworks 옵션 소비를 위해 비페이지 모드 호환 유지
  - 관리자 목록 화면은 page/size 기반 페이지네이션 사용

## 5) 연계 영향 (artworks)

`places`는 artworks 작성/검색에 직접 연결된다.

- `src/app/admin/artworks/page.tsx`
  - `/api/admin/places?deleted=exclude`로 장소 필터 옵션 로딩
  - `placeId`를 artworks 목록 필터로 전달
- `src/components/admin/artworks-form.tsx`
  - `/api/admin/places?deleted=exclude`로 선택 옵션 로딩
  - `place_id`는 필수 입력
- `src/app/api/admin/artworks/route.ts`
  - 목록 SQL이 `INNER JOIN places`

핵심 영향:

- place를 soft-delete하면 artworks 폼 옵션에서 사라진다.
- 이미 해당 place를 참조하는 artwork 수정 UX가 깨질 수 있다.

## 6) 실DB 스냅샷 (2026-03-05)

로컬 `.env` 연결 DB 직접 조회 결과:

- places: 총 20, active 20, deleted 0
- artworks: 총 124, active 124
- artworks가 참조 중인 place_id: 20개(distinct)
- zone_id가 NULL인 place: 0
- zone별 place 분포: 7 / 7 / 6

의미:

- 현재 데이터셋에서는 모든 place가 작품에 연결되어 있다.
- 삭제 정책을 잘못 정의하면 운영 영향이 즉시 발생한다.

## 7) 구현 권장안

### 7.1 삭제 정책

권장: soft delete + 참조중 삭제 차단

- `POST /api/admin/places/:id/soft-delete` 실행 시:
  - `SELECT COUNT(*) FROM artworks WHERE place_id = ? AND deleted_at IS NULL`
  - count > 0이면 `409 PLACE_IN_USE` 반환
- 복구는 `deleted_at = NULL`

### 7.2 API 엔드포인트

1. `GET /api/admin/places` (목록)
2. `POST /api/admin/places` (생성)
3. `GET /api/admin/places/:id` (단건)
4. `PUT /api/admin/places/:id` (수정)
5. `POST /api/admin/places/:id/soft-delete`
6. `POST /api/admin/places/:id/restore`

### 7.3 검증 스키마 추가 포인트

`src/lib/server/validators/admin.ts`:

- `placesQuerySchema`
  - `query`, `zoneId`, `deleted`, `page`, `size`
- `placeCreatePayloadSchema`, `placeUpdatePayloadSchema`
  - `name_ko`, `name_en`: 필수 문자열
  - `address`: optional/nullable
  - `lat`: number(-90~90)
  - `lng`: number(-180~180)
  - `zone_id`: optional/nullable positive int

### 7.4 Admin UI 구조

- `/admin/places` 목록 페이지
- `/admin/places/new` 생성 페이지
- `/admin/places/[id]` 수정 페이지
- `src/components/admin/places-form.tsx` 공통 폼
- 네비게이션 연동
  - `src/config/site.tsx` 사이드바 메뉴 추가
  - `src/components/nav/admin-top-nav.tsx` 타이틀 매핑 추가

## 8) 구현 체크리스트

1. [x] validator 스키마 추가
2. [x] places API CRUD/soft-delete/restore 구현
3. [x] 참조중 삭제 차단(409 `PLACE_IN_USE`) 구현
4. [x] Admin places 목록/생성/수정 페이지 구현
5. [x] 네비게이션 반영
6. [x] 문서 반영 (`docs/db-contract.md`, `docs/admin-backoffice.md`)
7. [x] 검증 (`pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`)

## 9) 주소로 위도/경도 찾는 방법 전수 조사

질문: 관리자가 `address`를 입력할 때 `lat/lng`를 어떻게 찾을 수 있는가?

실무에서 쓸 수 있는 방법은 아래 6가지 계열로 정리된다.

1. 수동 확인 방식 (지도에서 직접 확인 후 입력)
2. 단건 Geocoding API 호출 방식
3. 다건 Batch Geocoding 방식
4. 주소 DB/공공 데이터 매칭 방식
5. 오픈소스 자체 호스팅 Geocoder 방식
6. 하이브리드 방식 (자동 + 수동 보정 + 검증)

### 9.1 수동 확인 방식

개념:
- 관리자가 지도 서비스에서 주소를 검색하고 좌표를 직접 복사해 입력한다.

장점:
- 구현 난이도 최소
- API 비용/쿼터 이슈 없음
- 애매한 주소를 사람이 문맥으로 판단 가능

단점:
- 작업 시간 많이 소요
- 입력자마다 품질 편차 발생
- 대량 등록에 취약

적합 시나리오:
- 초반 데이터 수가 작고(수십~수백), 정확성 우선일 때
- API 연동 전 임시 운영 단계

### 9.2 단건 Geocoding API 방식 (주소 -> 좌표 자동 변환)

개념:
- 주소 문자열을 API에 보내 후보 좌표를 받아서 `lat/lng`를 자동 입력한다.

국내 주소 중심 후보:

1. Kakao Local API
- `주소 검색`: 지번 + 도로명 동시 지원
- `좌표계 변환`: WTM <-> WGS84 등 변환 API 제공
- 참고: [Kakao Local API 문서](https://developers.kakao.com/docs/latest/en/local/dev-guide#address-coord), [Kakao 좌표 변환](https://developers.kakao.com/docs/latest/en/local/dev-guide#trans-coord)

2. NAVER Maps Geocoding
- Geocoding API로 주소 -> 좌표 변환
- JS geocoder 모듈 사용 시 `query`(주소), `coordinate`(중심점), `count`/`page` 옵션으로 후보 제어 가능
- 참고: [NAVER Geocoding API 소개](https://guide.ncloud-docs.com/docs/maps-geocoding-api), [NAVER Maps JS geocoder](https://navermaps.github.io/maps.js.en/docs/tutorial-3-geocoder-geocoding.example.html)

3. VWorld Geocoder API (국토부/공공계열)
- `type=ROAD|PARCEL`, `text` 주소, `crs` 좌표계 파라미터 지원
- 일일 트래픽 정책(문서 기준)과 저장 제한 정책이 있음
- 참고: [VWorld Geocoder 가이드](https://www.vworld.kr/dev/v4dv_geocoderguide2_s001.do), [VWorld Guide - geocoder](https://www.vworld.kr/dev/v4guide/geocoder_s001.do)

4. Juso(도로명주소) 오픈 API
- 주소검색 API/좌표제공 API/주소변환 API를 제공
- 공공 주소 체계 기반으로 정규화에 강점
- 참고: [Juso API 소개](https://business.juso.go.kr/addrlink/openApi/searchApi.do), [Juso 메인/서비스 설명](https://www.juso.go.kr/)

글로벌/범용 후보:

5. Google Geocoding API
- key + billing 필수
- `address` 또는 `components` 기반 geocoding 지원
- 참고: [Google Geocoding API](https://developers.google.com/maps/documentation/geocoding/start), [Google API key & billing](https://developers.google.com/maps/documentation/geocoding/get-api-key)

6. Mapbox Search Geocoding
- Forward/Reverse/Batch 지원
- temporary/permanent 저장 모드 구분
- 문서상 batch 요청당 최대 1000 쿼리
- 참고: [Mapbox Geocoding API](https://docs.mapbox.com/api/search/geocoding/), [Mapbox API 문서](https://docs.mapbox.com/api/)

7. OpenCage
- 단건 geocoding + 스프레드시트 대량 geocoding 제공
- 참고: [OpenCage geocoding API](https://opencagedata.com/api), [OpenCage docs](https://opencagedata.com/docs)

8. Geocode Earth
- geocode/reverse/autocomplete + CSV batch geocoding 지원
- 참고: [Geocode Earth docs](https://geocode.earth/docs/), [Batch Geocoding](https://geocode.earth/docs/guides/batch_geocoding/)

9. OpenStreetMap Nominatim (Public API)
- 공용 인스턴스 사용 가능하지만 사용 정책이 엄격함(초당 1요청 등)
- 참고: [Nominatim Search API](https://nominatim.org/release-docs/develop/api/Search/), [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/)

### 9.3 Batch Geocoding 방식 (대량 주소 처리)

개념:
- CSV/배열 단위로 수백~수만 주소를 일괄 변환

방법:
1. provider의 batch endpoint 사용 (Mapbox, Geocode Earth 등)
2. provider의 스프레드시트 업로드 도구 사용(OpenCage)
3. 내부 ETL 스크립트(`node`/`python`)로 단건 API를 rate-limit 하며 반복 호출

장점:
- 초기 데이터 마이그레이션에 유리
- 수작업 비용 절감

주의:
- 쿼터/요금 급증
- 결과 품질이 낮은 건에 대한 후처리(수동 검수) 필요

### 9.4 주소 DB/공공 데이터 매칭 방식

개념:
- API 호출 대신 공공 주소 DB를 로컬로 적재해 매칭

대표 예:
- Juso에서 좌표 포함 DB(위치정보요약DB 등) 다운로드 후 내부 매칭

장점:
- 런타임 API 의존도 감소
- 대량 처리 비용 절감 가능

단점:
- DB 최신화 작업이 필요
- 주소 정규화가 까다롭고 miss 매칭 처리 필요

참고:
- [Juso API/DB 서비스 안내](https://business.juso.go.kr/addrlink/openApi/searchApi.do)

### 9.5 자체 호스팅 Geocoder 방식

개념:
- 외부 SaaS 대신 geocoder 서버를 직접 운영

대표 예:
- Nominatim 자체 설치/운영

장점:
- 요청량/요금/정책 통제 가능
- 내부망/보안 정책에 유리

단점:
- 구축/운영/업데이트 비용 큼
- 데이터/인덱싱 관리 필요

참고:
- [Nominatim Installation Guide](https://nominatim.org/release-docs/latest/admin/Installation/)

### 9.6 하이브리드 방식 (권장)

가장 현실적인 운영 패턴:

1. 주소 입력
2. API 자동 geocode로 후보 1~5개 제시
3. 관리자가 후보 선택 또는 수동 보정
4. 저장 전 reverse-geocode 또는 지도 미리보기로 검증
5. `source`, `matched_address`, `geocoded_at` 메타 저장

장점:
- 자동화 효율 + 사람 검수 정확도 균형

## 10) 공급자별 운영 체크포인트

### 10.1 약관/저장정책

- VWorld 문서에는 DB 저장 금지 조건이 명시되어 있어 저장 정책을 반드시 사전 검토해야 한다.
- Mapbox는 temporary/permanent 저장 모드 구분이 있고, 사용 케이스에 맞는 모드 선택이 필요하다.
- Nominatim 공용 인스턴스는 강한 사용 제한이 있어 백오피스 대량 처리에 부적합할 수 있다.

### 10.2 비용/쿼터

- Google은 billing 연결이 필수다.
- NAVER/Kakao/VWorld도 계정 단위 호출 제한 및 상품 정책이 있으므로 운영 전 콘솔 기준으로 재확인해야 한다.

### 10.3 정확도 관리

- 한국 주소는 도로명/지번 혼용이 많아 정규화가 중요하다.
- 좌표가 반환되어도 실제 POI/도로 중심점 오차가 있을 수 있으므로 지도 미리보기 확인 UX가 필요하다.

## 11) SteelArt 코드베이스에 적용하는 구현안

현재 구조(`Next.js API + Admin Form`)를 기준으로 아래 구현이 적합하다.

### 11.1 서버

신규 API 제안:
- `POST /api/admin/places/geocode`

입력:
- `{ address: string, provider?: "kakao" | "naver" | "vworld" }`

출력:
- 후보 배열
  - `formatted_address`
  - `lat`, `lng`
  - `raw` (디버깅용 최소 필드)

구현 포인트:
- 외부 API 키는 서버에서만 보관
- provider별 adapter 함수 분리
- timeout/retry/rate-limit 내장

### 11.2 클라이언트 (`PlacesForm`)

UX 제안:
1. `address` 입력
2. `주소로 좌표 찾기` 버튼
3. 후보 리스트 표시 + 선택
4. 선택 시 `lat/lng` 자동 입력
5. 필요 시 수동 수정 가능

검증:
- 저장 시 `lat/lng` 범위 검증
- address와 좌표가 모두 있으면 미리보기 링크(지도) 제공

### 11.3 운영 정책

권장 기본 정책:
1. 1차 provider: 국내 주소 커버리지가 높은 API 선택 (Kakao 또는 Naver)
2. fallback: 다른 provider 또는 수동 입력
3. 대량 업로드 시 batch 스크립트 별도 제공
4. `source`, `geocoded_at`, `provider_response_id`(가능 시) 저장

## 12) 방법별 비교 요약

1. 수동 입력
- 정확도: 높음(검수 전제)
- 속도: 느림
- 비용: 낮음
- 운영 난이도: 낮음

2. 단건 API
- 정확도: 중~높음(주소 품질 의존)
- 속도: 빠름
- 비용: 호출량 비례
- 운영 난이도: 중간

3. Batch API
- 정확도: 중간(후검수 필요)
- 속도: 매우 빠름
- 비용: 높아질 수 있음
- 운영 난이도: 중~높음

4. 공공 DB 매칭
- 정확도: 데이터 품질 의존
- 속도: 빠름(사전 구축 후)
- 비용: 런타임 낮음
- 운영 난이도: 높음

5. 자체 호스팅
- 정확도: 엔진/데이터 의존
- 속도: 인프라 의존
- 비용: 초기/운영 비용 큼
- 운영 난이도: 매우 높음

## 13) 이번 조사 결론

`places` 관리 기능에 가장 현실적인 방향은:

1. 기본은 단건 Geocoding API + 후보 선택 UI
2. 수동 보정 입력을 항상 허용
3. 참조 데이터가 많은 도메인 특성상(artworks 연결) 저장 전 검증 UX를 넣어 품질 확보
4. 추후 대량 등록이 필요해지면 batch 파이프라인을 별도로 추가

## 14) 외부 참고 자료

1. Kakao Local API: https://developers.kakao.com/docs/latest/en/local/dev-guide#address-coord
2. Kakao Coordinate Transform: https://developers.kakao.com/docs/latest/en/local/dev-guide#trans-coord
3. NAVER Geocoding API: https://guide.ncloud-docs.com/docs/maps-geocoding-api
4. NAVER Maps JS Geocoder: https://navermaps.github.io/maps.js.en/docs/tutorial-3-geocoder-geocoding.example.html
5. VWorld Geocoder Guide: https://www.vworld.kr/dev/v4dv_geocoderguide2_s001.do
6. VWorld Geocoder Guide (v4): https://www.vworld.kr/dev/v4guide/geocoder_s001.do
7. Juso Open API: https://business.juso.go.kr/addrlink/openApi/searchApi.do
8. Juso Main: https://www.juso.go.kr/
9. Google Geocoding API: https://developers.google.com/maps/documentation/geocoding/start
10. Google API Key/Billing: https://developers.google.com/maps/documentation/geocoding/get-api-key
11. Mapbox Geocoding API: https://docs.mapbox.com/api/search/geocoding/
12. Mapbox API Docs: https://docs.mapbox.com/api/
13. OpenCage API: https://opencagedata.com/api
14. OpenCage Docs: https://opencagedata.com/docs
15. Geocode Earth Docs: https://geocode.earth/docs/
16. Geocode Earth Batch: https://geocode.earth/docs/guides/batch_geocoding/
17. Nominatim Search API: https://nominatim.org/release-docs/develop/api/Search/
18. Nominatim Usage Policy: https://operations.osmfoundation.org/policies/nominatim/
19. Nominatim Installation: https://nominatim.org/release-docs/latest/admin/Installation/
