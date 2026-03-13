## 요약

- `artwork_images`에 이미 존재하던 `image_width`, `image_height`를 관리자 작품 생성/수정 플로우에 연결했습니다.
- 작품 수정 API가 이미지를 `DELETE -> INSERT`로 전체 교체하기 때문에, 기존에는 width/height를 저장 경로에 연결하지 않으면 metadata가 쉽게 유실될 구조였습니다.
- 이번 변경으로 기존 221개 artwork image row를 backfill 했고, 신규/수정 저장에서도 width/height가 항상 round-trip 되도록 맞췄습니다.

## 변경내용

- 서버 계약 업데이트
  - `images[]` validator에 `image_width`, `image_height`를 추가했습니다.
  - 작품 create/detail/update API가 width/height를 저장하고 다시 반환하도록 바꿨습니다.
- 관리자 업로드/폼 반영
  - `FileUploadField`가 업로드 파일과 수동 URL에서 image dimensions를 읽도록 했습니다.
  - 작품 폼이 metadata를 draft와 함께 유지하고, 누락 시 submit을 차단하도록 했습니다.
- 데이터/스크립트 정리
  - `scripts/backfill-artwork-image-dimensions.mjs`를 추가했습니다.
  - 공통 DB 연결 helper와 원격 DB SSL 자동 처리를 스크립트/런타임에 반영했습니다.
  - `scripts/seed-mock-data.mjs`가 artwork image width/height를 함께 넣도록 수정했습니다.
- 문서 동기화
  - `docs/research.md`
  - `docs/db-contract.md`
  - `docs/admin-backoffice.md`
  - `docs/db-schema.sql`
- 범위 제외
  - 작품 목록/코스 썸네일 API는 현재 소비처가 없어 `thumbnail_image_url`만 유지했습니다.

## 검증

- DB/스크립트
  - `pnpm db:schema:export`
  - `pnpm db:backfill:artwork-image-dimensions`
    - `target_rows=0`
    - `updated_rows=0`
    - `failed_rows=0`
    - `remaining_null_rows=0`
  - SQL 확인 결과:
    - `total=221`
    - `filled_rows=221`
    - `remaining_null_rows=0`
- 관리자 UI
  - `/admin/artworks/128` 편집 화면에서 `이미지 크기: 283 x 426px` 렌더링 확인
  - invalid image URL 입력 시 `이미지 크기를 읽지 못했습니다.` 표시 확인
  - 저장 시 `모든 작품 이미지의 가로/세로 크기를 확인해주세요.`로 차단 확인
- 관리자 API round-trip
  - 인증된 관리자 세션으로 임시 artwork 생성
  - text-only update 확인
  - 이미지 순서 변경 update 확인
  - 이미지 삭제 + 새 이미지 추가 update 확인
  - 최종 detail 응답의 width/height 일치 확인
  - 검증용 임시 row 정리 완료
- 정적 검증
  - `pnpm exec tsc --noEmit`
  - `pnpm lint`
  - `pnpm build`

## 스크린샷

- 작품 수정 화면의 이미지 metadata 노출

![작품 수정 화면의 이미지 metadata 노출](https://github.com/ehdrbdndns/steelart_dashboard/blob/codex/artwork-image-dimensions/docs/pr-assets/artwork-image-dimensions-form.png?raw=1)
