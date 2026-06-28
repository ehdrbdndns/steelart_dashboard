# Image Audit

- Baseline missing artworks (`test-extract`): 23
- After manifest filename normalization (`test-extract-image-audit`): 16
- After title variant and English-title fallback (`test-extract-image-audit-v3`): 0
- Final artwork image count: 431
- Remaining ambiguity: 1 artwork (`동일산업 | 조선백자 | 2019`)

## Root Causes

- Manifest lookup missed some `작품정보.txt` files because macOS filename normalization differed from the literal string comparison.
- Title matching was too strict and failed on variants such as:
  - Korean spelling variant: `비즈니스 맨` vs `비지니스 맨`
  - Roman numeral vs digit: `빛의 순환 10-I` vs `빛의 순환 10-1`
  - Parenthetical subtitles: `융합 (Unity)`, `기억의 흔적(Marks 5)`, `정립 (正立)`
  - Bilingual titles: `생명의 순환` vs `Circle of Life (생명의 순환)`, `펭귄` vs `펭귄 Penguin`
  - Extra-folder prefix: `(추가) HOPE2208`
  - English-title-only media folder: `움직임` vs `Motion`

## Resolved By Manifest Filename Fix (7)

- `風景_기억의 방_Pohang` | `김상균`
- `공동체` | `이웅배`
- `2050 비너스의 탄생` | `소현우`
- `2016 타임캡슐 포항 I` | `제일테크노스`
- `2016 타임캡슐 포항 II` | `신화테크`
- `스페이스_P` | `엄익훈`
- `조선백자II` | `동일산업`

## Resolved By Title Variant Matching (16)

- `self-portrait` | `강대영`
- `비즈니스 맨` | `정국택`
- `빛의 순환 10-I` | `도흥록`
- `기억의 흔적` | `맹하섭`
- `융합 (Unity)` | `SMC`
- `해돋이-연오랑 세오녀` | `이동섭`
- `태양의 노래` | `최우람`
- `펭귄` | `김도훈`
- `움직임` | `이윤복`
- `정립` | `동국제강`
- `생명의 순환` | `제일테크노스`
- `나무, 불, 대지, 철, 그리고 물` | `포스코강판`
- `HOPE2208` | `최은정`
- `철의 성화` | `포항철강산업단지관리공단`
- `성장의 불꽃` | `포스코`
- `스틸러스50` | `포항스틸러스`

## Example Evidence

- `2016 타임캡슐 포항 I`: image manifest exists under `data/작품사진/2016 타임캡슐 포항 i/작품정보.txt`
- `움직임`: image file exists under `data/작품사진2/Motion/Motion_이윤복_(대표사진).jpg`
