# ArtworkImages 조사 및 `image_width` / `image_height` 최종 반영 결과

작성일: 2026-03-12  
최종 업데이트: 2026-03-13  
대상 저장소: `/Users/donggyunyang/code/steelart/steelart_dashboard`

## 1. 결론 요약

- 실DB `artwork_images`는 2026-03-13 기준 221행이며, `image_width`, `image_height`는 221행 모두 채워져 있다.
- 운영 데이터 스냅샷은 현재 1 artwork = 1 image 형태지만, 관리자 저장 계약과 seed 데이터는 artwork당 다중 이미지(1:N)를 유지한다.
- 관리자 작품 생성/수정 플로우는 이제 `images[].image_url`, `image_width`, `image_height`를 함께 저장하고 다시 불러온다.
- 작품 수정 API가 `DELETE -> INSERT`로 이미지를 전체 교체하는 구조이므로, 이번 반영의 핵심은 edit round-trip 시 metadata 유실 방지였다.
- 작품 목록 페이지와 코스 관리자 화면은 현재 `thumbnail_image_url`만 소비하므로 이번 범위에서 width/height 노출은 제외했다.

## 2. 실DB 기준 현재 상태

### 2.1 테이블 구조

실DB `artwork_images`는 아래 컬럼을 가진다.

| 컬럼 | 타입 | NULL | 기본값 | 비고 |
| --- | --- | --- | --- | --- |
| `id` | `bigint(20)` | NO | 없음 | PK, auto_increment |
| `artwork_id` | `bigint(20)` | NO | 없음 | `artworks.id` FK |
| `image_url` | `varchar(512)` | NO | 없음 | 이미지 URL |
| `created_at` | `timestamp` | YES | `current_timestamp()` | 생성시각 |
| `image_width` | `int(10) unsigned` | YES | `NULL` | 이미지 가로 픽셀 |
| `image_height` | `int(10) unsigned` | YES | `NULL` | 이미지 세로 픽셀 |

인덱스 / 제약:

- `PRIMARY KEY (id)`
- `KEY idx_artwork_images_artwork_id (artwork_id)`
- `FOREIGN KEY fk_artwork_images_artwork (artwork_id) REFERENCES artworks(id) ON DELETE CASCADE`

스키마 스냅샷은 `docs/db-schema.sql`에 재추출되어 있다.

### 2.2 데이터 분포

2026-03-13 기준 실DB 집계:

- `artworks`: 221개
- 활성 artwork: 207개
- 삭제 artwork: 14개
- `artwork_images`: 221개
- `artwork_images.artwork_id` distinct 수: 221개
- 이미지 0장 artwork: 0개
- 이미지 1장 artwork: 221개
- 이미지 2장 이상 artwork: 0개
- `image_width` 또는 `image_height`가 비어 있는 row: 0개
- artwork당 평균 이미지 수: 1.00
- `(artwork_id, image_url)` 중복: 0개
- 이미지 호스트: 전부 `steel-art.s3.ap-northeast-2.amazonaws.com`
- 확장자 분포: `jpg` 204개, `png` 17개

핵심 해석:

- 운영 데이터는 여전히 단일 이미지 중심이지만, 구조와 코드 계약은 다중 이미지를 안전하게 지원한다.
- backfill은 완료됐고, 신규 저장 경로도 width/height를 유지한다.

## 3. 현재 코드 계약

### 3.1 입력 검증

`src/lib/server/validators/admin.ts`의 `artworkImagesSchema`는 이제 아래 shape를 필수로 검증한다.

```ts
images: [
  {
    image_url: string;
    image_width: number;
    image_height: number;
  },
];
```

추가된 조건:

- `image_width`, `image_height`는 양의 정수
- `images[]`는 최소 1개

즉, 서버는 이제 width/height 없는 artwork image payload를 허용하지 않는다.

### 3.2 작품 생성 / 상세 / 수정 API

반영 파일:

- `src/app/api/admin/artworks/route.ts`
- `src/app/api/admin/artworks/[id]/route.ts`

현재 동작:

- create insert가 `image_width`, `image_height`를 함께 저장한다.
- detail 응답이 `images[].image_width`, `images[].image_height`를 내려준다.
- update는 기존 이미지를 삭제한 뒤 새 목록을 재삽입하지만, payload에 width/height가 포함되므로 metadata가 유실되지 않는다.

### 3.3 작품 수정 페이지 / 폼

반영 파일:

- `src/app/admin/artworks/[id]/page.tsx`
- `src/components/admin/artworks-form.tsx`

현재 동작:

- 초기 detail 응답의 width/height를 draft state로 보존한다.
- reorder / remove / add 시 metadata도 같은 draft와 함께 이동한다.
- 저장 직전 `모든 작품 이미지의 가로/세로 크기를 확인해주세요.` 검증으로 metadata 누락 submit을 차단한다.

### 3.4 파일 업로드 컴포넌트

반영 파일:

- `src/components/admin/file-upload-field.tsx`

현재 동작:

- 이미지 파일 업로드 시 local file에서 natural width/height를 읽는다.
- 수동 URL 입력 시 브라우저 `Image` 로딩으로 width/height를 재조회한다.
- metadata를 읽는 중에는 상태를 표시하고, 실패하면 `이미지 크기를 읽지 못했습니다.` 에러를 노출한다.
- 작품 이미지 입력 UI에는 `이미지 크기: {width} x {height}px`가 렌더링된다.

## 4. 관리자 페이지 영향 범위 결론

### 4.1 실제로 수정된 곳

| 구분 | 파일 | 반영 내용 |
| --- | --- | --- |
| 입력 검증 | `src/lib/server/validators/admin.ts` | `image_width`, `image_height` 필수화 |
| 작품 생성 API | `src/app/api/admin/artworks/route.ts` | insert/select에 width/height 반영 |
| 작품 상세/수정 API | `src/app/api/admin/artworks/[id]/route.ts` | detail/select/reinsert에 width/height 반영 |
| 작품 수정 페이지 타입 | `src/app/admin/artworks/[id]/page.tsx` | detail image 타입 확장 |
| 작품 생성/수정 폼 | `src/components/admin/artworks-form.tsx` | draft/submit/검증/표시 반영 |
| 업로드 컴포넌트 | `src/components/admin/file-upload-field.tsx` | file/url metadata 수집 및 표시 |

### 4.2 이번 범위에서 제외한 곳

| 구분 | 파일 | 이유 |
| --- | --- | --- |
| 작품 목록 페이지 | `src/app/admin/artworks/page.tsx` | 현재 `thumbnail_image_url`만 사용 |
| 코스 아이템 API | `src/app/api/admin/courses/[id]/items/route.ts` | thumbnail metadata 소비처 없음 |
| 코스 관리자 UI | `src/components/admin/course-items-editor.tsx` | 실제로 thumbnail dimensions를 렌더링하지 않음 |

즉, "관리자 저장/편집 경로에서 metadata 유실 방지"라는 목표에는 작품 생성/수정 페이지와 관련 API 수정만으로 충분했다.

## 5. 데이터 및 운영 보조 스크립트

추가/수정된 스크립트:

- `scripts/backfill-artwork-image-dimensions.mjs`
  - 기존 `artwork_images`의 width/height backfill
  - HTTP fetch 실패 시 S3 fallback
- `scripts/lib/db-connection.mjs`
  - DB 연결 공통화
  - 원격 DB SSL 자동 처리
- `scripts/lib/image-dimensions.mjs`
  - PNG/JPEG/GIF dimensions 추출
- `scripts/seed-mock-data.mjs`
  - mock artwork images에 width/height 저장

실행 명령:

```bash
pnpm db:backfill:artwork-image-dimensions
```

2026-03-13 재실행 결과:

- `target_rows=0`
- `updated_rows=0`
- `failed_rows=0`
- `remaining_null_rows=0`

## 6. 최종 검증 결과

### 6.1 DB 검증

- `SELECT COUNT(*) ...` 결과:
  - `total=221`
  - `filled_rows=221`
  - `remaining_null_rows=0`

### 6.2 관리자 UI 검증

- `/admin/artworks/128` 편집 화면에서 `이미지 크기: 283 x 426px` 노출 확인
- invalid image URL 입력 시:
  - `이미지 크기를 읽지 못했습니다.` 표시
  - 저장 시 `모든 작품 이미지의 가로/세로 크기를 확인해주세요.`로 차단

### 6.3 관리자 API round-trip 검증

인증된 관리자 세션으로 임시 artwork를 생성해 아래를 확인했다.

1. 2개 이미지 create
2. 같은 이미지 목록으로 text-only update
3. 이미지 순서 변경 update
4. 이미지 삭제 + 새 이미지 추가 update
5. 최종 detail 응답의 이미지 순서와 width/height 일치 확인
6. 검증용 임시 row 정리

### 6.4 정적 검증

- `pnpm exec tsc --noEmit`
- `pnpm lint`
- `pnpm build`

모두 통과했다.

## 7. 남은 선택 과제

이번 작업으로 필수 요구사항은 완료됐다. 이후 필요 시 추가 검토할 항목은 아래와 같다.

- 작품 목록 API thumbnail에 `image_width`, `image_height` 추가
- 코스 아이템 API thumbnail metadata 확장
- backfill 완료 후 운영 정책상 `NOT NULL` 전환 여부 검토
