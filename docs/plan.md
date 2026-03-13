# ArtworkImages `image_width` / `image_height` 구현 계획 및 완료 기록

작성일: 2026-03-12  
최종 업데이트: 2026-03-13  
대상 저장소: `/Users/donggyunyang/code/steelart/steelart_dashboard`  
기준 문서: `docs/research.md`

상태:

- 2026-03-13 기준 본 문서의 구현/검증/PR 작성 단계까지 모두 완료했다.

## 1. 목표

이미 추가된 `artwork_images.image_width`, `artwork_images.image_height`를 관리자 작품 생성/수정 플로우에 연결하고, 이 값이 항상 저장되고 다시 불러와지도록 만든다.

완료 목표:

- 신규/기존 artwork image row가 width/height를 함께 가진다.
- 관리자 작품 생성/수정에서 이미지 metadata가 유실되지 않는다.
- 기존 `artwork_images` row를 안전하게 backfill 한다.
- 관련 문서와 seed 데이터가 새 계약과 일치한다.

## 2. 핵심 제약

- 현재 운영 스냅샷은 artwork당 이미지가 1장씩이지만, 최신 기획과 관리자 코드 계약은 artwork당 여러 이미지를 허용한다.
- 작품 수정 API는 이미지를 부분 수정하지 않고 `DELETE -> INSERT`로 전체 교체한다.
- edit 화면에서 기존 이미지를 그대로 둬도 width/height를 payload에 포함해 다시 보내야 한다.
- `FileUploadField`가 URL만 부모에 넘기던 구조에서는 metadata 유실을 막을 수 없다.

## 3. 구현 원칙

- 기존 DB 컬럼은 이미 운영에 배포된 상태이므로 추가 DDL 없이 wiring과 backfill 중심으로 처리한다.
- 저장/편집 경로는 `image_width`, `image_height`를 사실상 필수값으로 취급한다.
- 파일 업로드와 수동 URL 입력 모두 width/height를 확보해야 저장을 허용한다.
- 작품 목록/코스 화면은 즉시 필수 수정 대상이 아니므로 저장/편집 경로를 우선 완성한다.

## 4. 구현 방향

1. 업로드 경로:
   - `FileUploadField`가 선택된 `File`에서 이미지 width/height를 읽는다.
   - 업로드 성공 후 URL과 metadata를 함께 부모 state에 반영한다.

2. 수동 URL 입력 경로:
   - URL 변경 시 브라우저 `Image` 로딩으로 natural size를 읽는다.
   - width/height를 읽지 못하면 에러를 표시하고 저장을 막는다.

3. edit round-trip:
   - 상세 API가 기존 width/height를 내려준다.
   - 폼 draft가 이 값을 보존한 채 reorder / delete / add를 처리한다.

## 5. 세부 구현 계획

### 5.1 DB 스키마 상태 확인 및 문서 반영 [완료]

완료 내용:

- 실DB `artwork_images`에 `image_width`, `image_height`가 이미 존재하는 것을 기준 상태로 확정했다.
- `pnpm db:schema:export`를 재실행해 `docs/db-schema.sql`을 최신 상태로 동기화했다.
- 후속 구현은 추가 DDL 없이 existing schema를 전제로 진행했다.

### 5.2 기존 데이터 backfill [완료]

완료 내용:

- `scripts/backfill-artwork-image-dimensions.mjs`를 추가했다.
- HTTP fetch 실패 시 S3 `GetObject` fallback까지 포함해 기존 이미지를 역추적하도록 구현했다.
- 2026-03-13 재실행 결과:
  - `target_rows=0`
  - `updated_rows=0`
  - `failed_rows=0`
  - `remaining_null_rows=0`
- SQL 재검증 결과:
  - `total=221`
  - `filled_rows=221`
  - `remaining_null_rows=0`

### 5.3 서버 계약 업데이트 [완료]

완료 내용:

- `src/lib/server/validators/admin.ts`
  - `images[]` object에 `image_width`, `image_height`를 추가했다.
  - 양의 정수 검증을 걸어 누락 payload를 서버에서 차단한다.
- `src/app/api/admin/artworks/route.ts`
  - create insert/select에 새 컬럼을 반영했다.
- `src/app/api/admin/artworks/[id]/route.ts`
  - detail select와 update 재삽입 로직에 새 컬럼을 반영했다.

완료 결과:

- create / detail / update API가 동일한 image object shape를 사용한다.
- 작품 수정 후 `DELETE -> INSERT`가 일어나도 metadata가 유실되지 않는다.

### 5.4 관리자 업로드 컴포넌트 개선 [완료]

완료 내용:

- `src/components/admin/file-upload-field.tsx`
  - 이미지 파일 선택 시 width/height를 계산한다.
  - 수동 URL 입력 시 natural size를 재조회한다.
  - metadata 로딩/오류/표시 UI를 추가했다.
  - 부모가 metadata를 함께 받도록 콜백 계약을 확장했다.

완료 결과:

- 파일 업로드 경로와 수동 URL 경로 모두 width/height를 확보할 수 있다.
- 유효한 크기를 읽지 못한 이미지는 저장 전에 걸러진다.

### 5.5 작품 생성/수정 폼 반영 [완료]

완료 내용:

- `src/components/admin/artworks-form.tsx`
  - 이미지 draft 타입에 `image_width`, `image_height`를 추가했다.
  - 초기값, reorder, remove, add가 metadata를 함께 이동하도록 바꿨다.
  - submit payload에 `image_width`, `image_height`를 포함시켰다.
  - metadata 누락 시 `모든 작품 이미지의 가로/세로 크기를 확인해주세요.`로 저장을 차단한다.
- `src/app/admin/artworks/[id]/page.tsx`
  - edit page 타입에 새 필드를 반영했다.

완료 결과:

- create 화면 저장 payload에 width/height가 포함된다.
- edit 화면에서 기존 이미지를 수정하지 않아도 metadata가 유지된다.
- 이미지 순서 변경 후 저장해도 각 metadata가 해당 이미지와 함께 이동한다.

### 5.6 선택적 화면/API 확장 여부 결정 [완료]

결정:

- 이번 구현 범위에는 작품 목록 페이지와 코스 관리자 화면의 thumbnail dimension 노출을 포함하지 않았다.
- `src/app/admin/artworks/page.tsx`, `src/app/api/admin/courses/[id]/items/route.ts`, `src/components/admin/course-items-editor.tsx`는 현재 소비 계약상 `thumbnail_image_url`만으로 충분하다.

결정 이유:

- 이번 작업의 필수 문제는 저장/편집 시 metadata 유실 방지였다.
- 목록/코스 화면은 width/height를 현재 직접 사용하지 않는다.
- PR 본문에 범위 제외 사유를 명시했다.

### 5.7 Seed / 문서 동기화 [완료]

완료 내용:

- `scripts/seed-mock-data.mjs`가 artwork image insert 시 width/height를 함께 저장하도록 수정했다.
- DB 연결 공통화 및 SSL 자동 처리 helper를 `scripts/lib/db-connection.mjs`, `src/lib/server/db.ts`에 반영했다.
- 다음 문서를 최종 계약과 일치하도록 갱신했다.
  - `docs/research.md`
  - `docs/db-contract.md`
  - `docs/admin-backoffice.md`
  - `docs/db-schema.sql`

## 6. 검증 결과

### 6.1 DB 검증 [완료]

실행 결과:

- `pnpm db:schema:export` 통과
- `pnpm db:backfill:artwork-image-dimensions` 재실행 결과 `remaining_null_rows=0`
- SQL 검증:
  - `SELECT COUNT(*) ...` 결과 `total=221`, `filled_rows=221`, `remaining_null_rows=0`

확인한 사항:

- 기존 데이터 backfill이 완료된 상태다.
- 새 앱/스크립트 재실행이 추가 null row를 만들지 않는다.

### 6.2 관리자 기능 검증 [완료]

실행 결과:

1. 기존 작품 수정 화면 확인
   - `/admin/artworks/128`에서 `이미지 크기: 283 x 426px`가 실제 렌더링되는 것을 확인했다.

2. 수동 URL 실패 경로 확인
   - invalid image URL 입력 시 `이미지 크기를 읽지 못했습니다.`가 표시됐다.
   - 저장 시 `모든 작품 이미지의 가로/세로 크기를 확인해주세요.`로 submit이 차단됐다.

3. 인증된 관리자 API round-trip 확인
   - 임시 artwork를 2개 이미지로 생성했다.
   - 같은 이미지로 text-only update를 수행했다.
   - 이미지 순서를 바꿔 저장한 뒤 응답 순서와 metadata가 함께 바뀌는 것을 확인했다.
   - 한 장 삭제 후 새 이미지 추가 저장을 수행했고 최종 detail 응답의 width/height가 일치하는 것을 확인했다.
   - 검증용 임시 artwork/places row는 마지막에 정리했다.

증빙 산출물:

- 스크린샷: `docs/pr-assets/artwork-image-dimensions-form.png`

### 6.3 정적 검증 [완료]

실행 결과:

- `pnpm exec tsc --noEmit`
- `pnpm lint`
- `pnpm build`

모두 통과했다.

## 7. 적용 순서 기록

실제 적용 순서:

1. 기존 schema 상태 확인 및 문서 동기화
2. backfill 스크립트 구현 및 실행
3. 관리자/UI/API 코드 반영
4. 다중 이미지 round-trip 검증
5. seed 및 문서 동기화
6. PR 본문 및 스크린샷 정리

## 8. 리스크와 대응

- 리스크: edit 저장 시 일부 이미지 metadata가 빠진 payload가 들어오면 기존 값이 유실될 수 있음  
  대응: 폼 저장 전 검증과 서버 스키마 검증 모두에서 누락을 차단했다.

- 리스크: 수동 URL 입력 경로에서 natural size 조회 실패 가능  
  대응: 컴포넌트에서 에러를 노출하고 폼 submit을 막도록 구현했다.

- 리스크: 일부 운영 이미지 URL 접근 실패 가능  
  대응: backfill 스크립트에 HTTP fetch + S3 fallback을 넣고 재실행 가능하게 만들었다.

- 리스크: 목록/코스 화면이 이후 width/height를 필요로 할 수 있음  
  대응: 이번 PR에서는 범위를 제외했지만, 썸네일 subquery 확장 지점은 문서화했다.

## 9. 완료 기준

- 실DB `artwork_images` 기존/신규 row가 width/height를 가진다. 완료
- 관리자 create/edit 저장에서 metadata가 유실되지 않는다. 완료
- 수동 URL 입력도 width/height 확보 없이는 저장되지 않는다. 완료
- seed, 문서, 서버 검증 스키마가 새 계약과 일치한다. 완료
- `pnpm lint`, `pnpm build`가 통과한다. 완료

## 10. 마지막 단계: PR 작성 [완료]

완료 내용:

- `.github/pull_request_template.md` 형식에 맞춘 PR 본문을 `docs/pr-assets/artwork-image-dimensions-pr.md`에 작성했다.
- 작품 수정 화면 스크린샷을 `docs/pr-assets/artwork-image-dimensions-form.png`에 저장했다.

PR 본문에 포함한 내용:

- `## 요약`
  - width/height가 필요한 이유
  - `DELETE -> INSERT` 저장 방식에서 metadata 유실을 막는 방식
- `## 변경내용`
  - backfill
  - 관리자 업로드/폼/API 반영
  - seed / 문서 갱신
  - 목록/코스 범위 제외 결정
- `## 검증`
  - DB null count 0 확인
  - 관리자 UI/API 시나리오 검증
  - `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`
- `## 스크린샷`
  - 작품 수정 화면 metadata 노출 캡처
