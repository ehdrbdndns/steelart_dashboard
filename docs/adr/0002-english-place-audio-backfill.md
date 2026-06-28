---
status: accepted
date: 2026-06-28
---

# 영어 장소·주소·오디오를 타깃 비파괴 백필로 채움

## 맥락과 결정

앱 영어 모드에서 작품 오디오(`audio_url_en`)가 재생되지 않았다. 원인은 마이그레이션 extract가
(1) `작품설명(영문)` 시트의 영어 컬럼 `작품위치`/`주소`/`권역`을 읽지 않고,
(2) `audio_url_en`을 null로 하드코딩하며,
(3) 영어 음원 폴더 `작품설명(TTS_음성안내 파일)_영어`를 스캔하지 않은 것이다.
영어 음원·영어 장소명·영어 주소는 모두 데이터 원천(20260625)에 존재한다.

드리프트 분석 결과 현재 DB 작품 집합과 20260625 적재 대상 집합은 동일(184 유지, 추가/삭제 0)했다.
따라서 ADR 0001의 destructive full-replace 대신, **`places.name_en`·`places.address_en`·
`artworks.audio_url_en` 세 필드만 채우는 타깃 비파괴 백필**을 채택한다. full-replace는 집합 변동이
없는데도 작품 PK 재발급·`course_items` wipe·전체 미디어 재업로드 비용을 치르므로 부적합하다.

## 알아둘 점

- 매칭은 `normalizeLoose(작가명+작품명)` 자연키. 작가+작품명이 동일한 중복 2건은 ambiguous로 리포트 후 수동 처리.
- 차기 full-replace에서 영어가 다시 누락되지 않도록 `migrate-steelart-extract.mjs`를 영어 컬럼/음원 포함하도록 고쳐야 한다(후속).
- zone 영어는 zones가 코드에 영어명을 하드코딩하므로 이번 범위에서 제외.
