# 대시보드 장소 영문 주소(address_en) 입력 구현 계획

> **에이전트 작업자용:** 필수 하위 스킬 — `superpowers:subagent-driven-development`(권장) 또는 `superpowers:executing-plans`로 태스크 단위 구현. 각 단계는 체크박스(`- [ ]`)로 추적한다.

**목표:** `steelart_dashboard`(Next.js 관리자)의 장소 입력 경로에 영문 주소 `address_en`(필수)을 추가해, 관리자가 장소 폼과 작품 폼에서 영문 주소를 입력·수정하고 DB `places.address_en`에 저장·조회되게 한다.

**아키텍처:** 서버측 zod 검증기 1곳(`placeBasePayloadSchema`)이 장소 생성/수정 + 작품 임베드 place를 모두 커버하므로 검증은 한 곳만 수정한다. API 라우트(places, artworks)의 SQL INSERT/UPDATE/SELECT와 row 타입에 `address_en`을 더하고, 두 클라이언트 폼(`places-form`, `artworks-form`)에 필수 입력 필드를 추가한다. 영문 주소는 단순 텍스트로 **지오코딩 트리거가 아니다**(좌표는 기존대로 한글 도로명 `address`로만 계산). 컬럼 자체는 nullable(레거시 행 NULL 허용)이지만 대시보드 입력 레이어에서 필수로 강제한다.

**기술 스택:** Next.js(App Router) + react-hook-form + zod + mysql2 + Tailwind. 테스트 프레임워크 없음 → 검증은 `npx tsc --noEmit` + `npm run lint` + 수동(dev 서버에서 폼 입력/저장 라운드트립).

**선행 상태(완료됨):**
- DB 컬럼: 서버 마이그레이션 `steelart_server/docs/sql/2026-06-28-add-places-address-en.sql`로 정의됨. 통합 테스트 DB엔 적용 완료(`places.address_en varchar(255) NULL`). 운영/스테이징은 배포 절차로 별도 적용 필요.
- 서버 API: 작품 목록/상세 응답에 `address_en` 노출 완료(PR #32).
- 결정(승인됨): address_en = **필수 텍스트**(지오코딩 없음), **장소 폼 + 작품 폼 둘 다**, **`docs/db-schema.sql` 스냅샷에 라인 추가**.

**범위 밖:** 장소 목록 화면(`/admin/places`)에 영문 주소 컬럼 노출(별도 필요 시), 운영 DB 마이그레이션 적용(배포 절차).

---

## 브랜치 전략

대시보드는 현재 `main`(기본 브랜치)에 동료의 미커밋 변경(users 페이지, `docs/db-schema.sql`, `package.json`, `.migration/` 등)이 있다.

- 작업 전 `git switch -c feat/place-address-en`으로 분기(미커밋 변경은 그대로 따라온다).
- 커밋은 **address_en 관련 파일만 선택적으로** 스테이징한다(동료 변경 제외).
- `docs/db-schema.sql`은 이미 미커밋 변경이 있을 수 있으므로, 커밋 시 `git add -p docs/db-schema.sql`로 **address_en 추가 hunk만** 스테이징한다.

---

## 영향 파일 구조

### 서버측(API + 검증 + 스키마 스냅샷)
- `src/lib/server/validators/admin.ts` — `placeBasePayloadSchema`에 `address_en` 추가(places + 작품 임베드 place 동시 적용)
- `src/app/api/admin/places/route.ts` — PlaceRow 타입, GET SELECT(×2), POST INSERT/SELECT
- `src/app/api/admin/places/[id]/route.ts` — PlaceRow 타입, GET SELECT, PUT UPDATE
- `src/app/api/admin/artworks/route.ts` — POST 임베드 place INSERT/SELECT
- `src/app/api/admin/artworks/[id]/route.ts` — PlaceDetailRow 타입, GET SELECT, PUT place INSERT/UPDATE
- `docs/db-schema.sql` — places 정의에 `address_en` 라인 추가

### 클라이언트측(폼 + 편집 페이지 타입)
- `src/components/admin/places-form.tsx` — zod 스키마, PlaceInitialData, defaults, payload, JSX 필드
- `src/components/admin/artworks-form.tsx` — place zod 스키마, ArtworkPlace 타입, defaults, payload, JSX 필드
- `src/app/admin/artworks/[id]/page.tsx` — Artwork.place 타입

---

## 1부 · 서버측 (API + 검증 + 스냅샷)

> 모든 명령은 `cd /Users/donggyunyang/code/steelart/steelart_dashboard`에서 실행.

### Task 1: 검증기에 address_en 추가

**Files:**
- Modify: `src/lib/server/validators/admin.ts:86-93`

- [ ] **Step 1: `placeBasePayloadSchema`에 필수 `address_en` 추가**

현재:
```ts
const placeBasePayloadSchema = z.object({
  name_ko: z.string().trim().min(1),
  name_en: z.string().trim().min(1),
  address: optionalAddressSchema,
  lat: z.coerce.number().min(-90).max(90),
```
변경:
```ts
const placeBasePayloadSchema = z.object({
  name_ko: z.string().trim().min(1),
  name_en: z.string().trim().min(1),
  address: optionalAddressSchema,
  address_en: z.string().trim().min(1),
  lat: z.coerce.number().min(-90).max(90),
```

> 이 스키마는 `placeCreatePayloadSchema`, `placeUpdatePayloadSchema`, `artworkPlacePayloadSchema`가 공유하므로 한 번에 places·artworks 양쪽 서버 검증에 적용된다. `address`(한글)는 optional 유지, `address_en`만 필수(min 1).

---

### Task 2: places API에 address_en 반영

**Files:**
- Modify: `src/app/api/admin/places/route.ts`
- Modify: `src/app/api/admin/places/[id]/route.ts`

- [ ] **Step 1: `places/route.ts` PlaceRow 타입에 필드 추가**

현재:
```ts
  name_en: string;
  address: string | null;
  lat: number;
```
변경:
```ts
  name_en: string;
  address: string | null;
  address_en: string | null;
  lat: number;
```

- [ ] **Step 2: `places/route.ts` 모든 SELECT 컬럼에 p.address_en 추가**

이 파일에는 동일한 SELECT 컬럼 라인이 3곳(GET 비페이지/페이지, POST 조회) 있다. 다음 치환을 **파일 내 전체 적용**(replace_all):

현재:
```
p.name_ko, p.name_en, p.address,
```
변경:
```
p.name_ko, p.name_en, p.address, p.address_en,
```

- [ ] **Step 3: `places/route.ts` POST INSERT에 컬럼·값 추가**

현재:
```ts
      `INSERT INTO places (
         name_ko, name_en, address, lat, lng, zone_id, deleted_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, NULL, NOW(), NOW())`,
      [
        payload.name_ko,
        payload.name_en,
        payload.address,
        payload.lat,
        payload.lng,
        payload.zone_id ?? null,
      ],
```
변경:
```ts
      `INSERT INTO places (
         name_ko, name_en, address, address_en, lat, lng, zone_id, deleted_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NOW(), NOW())`,
      [
        payload.name_ko,
        payload.name_en,
        payload.address,
        payload.address_en,
        payload.lat,
        payload.lng,
        payload.zone_id ?? null,
      ],
```

- [ ] **Step 4: `places/[id]/route.ts` PlaceRow 타입에 필드 추가**

현재:
```ts
  name_en: string;
  address: string | null;
  lat: number;
```
변경:
```ts
  name_en: string;
  address: string | null;
  address_en: string | null;
  lat: number;
```

- [ ] **Step 5: `places/[id]/route.ts` getPlaceById SELECT에 p.address_en 추가**

치환(파일 내 유일):
현재:
```
p.name_ko, p.name_en, p.address,
```
변경:
```
p.name_ko, p.name_en, p.address, p.address_en,
```

- [ ] **Step 6: `places/[id]/route.ts` PUT UPDATE에 컬럼·값 추가**

현재:
```ts
      `UPDATE places
       SET name_ko = ?, name_en = ?, address = ?, lat = ?, lng = ?, zone_id = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        payload.name_ko,
        payload.name_en,
        payload.address,
        payload.lat,
        payload.lng,
        payload.zone_id ?? null,
        id,
      ],
```
변경:
```ts
      `UPDATE places
       SET name_ko = ?, name_en = ?, address = ?, address_en = ?, lat = ?, lng = ?, zone_id = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        payload.name_ko,
        payload.name_en,
        payload.address,
        payload.address_en,
        payload.lat,
        payload.lng,
        payload.zone_id ?? null,
        id,
      ],
```

---

### Task 3: artworks API의 임베드 place에 address_en 반영

**Files:**
- Modify: `src/app/api/admin/artworks/route.ts`
- Modify: `src/app/api/admin/artworks/[id]/route.ts`

- [ ] **Step 1: `artworks/route.ts` POST 임베드 place INSERT에 컬럼·값 추가**

현재:
```ts
        `INSERT INTO places (
           name_ko, name_en, address, lat, lng, zone_id, deleted_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, NULL, NOW(), NOW())`,
        [
          payload.place.name_ko,
          payload.place.name_en,
          payload.place.address,
          payload.place.lat,
          payload.place.lng,
          payload.place.zone_id ?? null,
        ],
```
변경:
```ts
        `INSERT INTO places (
           name_ko, name_en, address, address_en, lat, lng, zone_id, deleted_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NOW(), NOW())`,
        [
          payload.place.name_ko,
          payload.place.name_en,
          payload.place.address,
          payload.place.address_en,
          payload.place.lat,
          payload.place.lng,
          payload.place.zone_id ?? null,
        ],
```

- [ ] **Step 2: `artworks/route.ts` 임베드 place SELECT에 p.address_en 추가**

치환(파일 내 유일):
현재:
```
p.name_ko, p.name_en, p.address,
```
변경:
```
p.name_ko, p.name_en, p.address, p.address_en,
```

- [ ] **Step 3: `artworks/[id]/route.ts` PlaceDetailRow 타입에 필드 추가**

현재:
```ts
  name_en: string;
  address: string | null;
  lat: number;
```
변경:
```ts
  name_en: string;
  address: string | null;
  address_en: string | null;
  lat: number;
```

- [ ] **Step 4: `artworks/[id]/route.ts` getArtworkWithImages SELECT에 p.address_en 추가**

치환(파일 내 유일):
현재:
```
p.name_ko, p.name_en, p.address,
```
변경:
```
p.name_ko, p.name_en, p.address, p.address_en,
```

- [ ] **Step 5: `artworks/[id]/route.ts` PUT 공유-place INSERT(클론)에 컬럼·값 추가**

현재:
```ts
          `INSERT INTO places (
             name_ko, name_en, address, lat, lng, zone_id, deleted_at, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, NULL, NOW(), NOW())`,
          [
            payload.place.name_ko,
            payload.place.name_en,
            payload.place.address,
            payload.place.lat,
            payload.place.lng,
            payload.place.zone_id ?? null,
          ],
```
변경:
```ts
          `INSERT INTO places (
             name_ko, name_en, address, address_en, lat, lng, zone_id, deleted_at, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NOW(), NOW())`,
          [
            payload.place.name_ko,
            payload.place.name_en,
            payload.place.address,
            payload.place.address_en,
            payload.place.lat,
            payload.place.lng,
            payload.place.zone_id ?? null,
          ],
```

- [ ] **Step 6: `artworks/[id]/route.ts` PUT 단독-place UPDATE에 컬럼·값 추가**

현재:
```ts
          `UPDATE places
           SET name_ko = ?, name_en = ?, address = ?, lat = ?, lng = ?, zone_id = ?,
               deleted_at = NULL, updated_at = NOW()
           WHERE id = ?`,
          [
            payload.place.name_ko,
            payload.place.name_en,
            payload.place.address,
            payload.place.lat,
            payload.place.lng,
            payload.place.zone_id ?? null,
            currentPlaceId,
```
변경:
```ts
          `UPDATE places
           SET name_ko = ?, name_en = ?, address = ?, address_en = ?, lat = ?, lng = ?, zone_id = ?,
               deleted_at = NULL, updated_at = NOW()
           WHERE id = ?`,
          [
            payload.place.name_ko,
            payload.place.name_en,
            payload.place.address,
            payload.place.address_en,
            payload.place.lat,
            payload.place.lng,
            payload.place.zone_id ?? null,
            currentPlaceId,
```

---

### Task 4: 스키마 스냅샷에 address_en 라인 추가

**Files:**
- Modify: `docs/db-schema.sql:144`

- [ ] **Step 1: places 정의에 컬럼 라인 추가**

현재:
```sql
  `address` varchar(255) DEFAULT NULL,
  `lat` decimal(10,7) NOT NULL,
```
변경:
```sql
  `address` varchar(255) DEFAULT NULL,
  `address_en` varchar(255) DEFAULT NULL,
  `lat` decimal(10,7) NOT NULL,
```

> 실제 DB 컬럼과 일치(nullable). 향후 `npm run db:schema:export` 재생성 결과와도 동일하다.

---

### Task 5: 서버측 검증 + 커밋

- [ ] **Step 1: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음(0 exit).

- [ ] **Step 2: 린트(변경 파일 위주)**

Run: `npm run lint`
Expected: 신규 에러 없음.

- [ ] **Step 3: 선택 커밋**

```bash
git add src/lib/server/validators/admin.ts \
        src/app/api/admin/places/route.ts \
        src/app/api/admin/places/[id]/route.ts \
        src/app/api/admin/artworks/route.ts \
        src/app/api/admin/artworks/[id]/route.ts
git add -p docs/db-schema.sql   # address_en hunk만 스테이징
git commit -m "feat: 장소 API에 영문 주소 address_en 추가"
```

---

## 2부 · 클라이언트측 (폼 + 편집 페이지)

### Task 6: 장소 폼에 영문 주소 입력 추가

**Files:**
- Modify: `src/components/admin/places-form.tsx`

- [ ] **Step 1: zod 스키마에 필수 address_en 추가 (`:50-57`)**

현재:
```ts
  name_en: z.string().trim().min(1, "필수 입력입니다."),
  address: z.string().optional(),
  zone_id: zoneIdFieldSchema,
```
변경:
```ts
  name_en: z.string().trim().min(1, "필수 입력입니다."),
  address: z.string().optional(),
  address_en: z.string().trim().min(1, "필수 입력입니다."),
  zone_id: zoneIdFieldSchema,
```

- [ ] **Step 2: `PlaceInitialData` 타입에 필드 추가 (`:76-84`)**

현재:
```ts
  name_en: string;
  address: string | null;
  lat: number;
```
변경:
```ts
  name_en: string;
  address: string | null;
  address_en: string | null;
  lat: number;
```

- [ ] **Step 3: defaultValues에 추가 (`:131-138`)**

현재:
```ts
      address: initialData?.address ?? "",
      zone_id: initialData?.zone_id ? String(initialData.zone_id) : "",
```
변경:
```ts
      address: initialData?.address ?? "",
      address_en: initialData?.address_en ?? "",
      zone_id: initialData?.zone_id ? String(initialData.zone_id) : "",
```

- [ ] **Step 4: onSubmit payload에 추가 (`:331-338`)**

현재:
```ts
      address: values.address?.trim() ? values.address.trim() : null,
      lat: Number(values.lat),
```
변경:
```ts
      address: values.address?.trim() ? values.address.trim() : null,
      address_en: values.address_en.trim(),
      lat: Number(values.lat),
```

- [ ] **Step 5: JSX 영문 주소 필드 추가 (주소(도로명) 블록 닫힌 직후, `:478` 다음 줄)**

`</div>`(주소 도로명 블록 종료) 바로 다음에 새 블록 삽입:
```tsx
      <div className="space-y-1">
        <Label htmlFor="address_en">주소(영문)</Label>
        <Input id="address_en" placeholder="영문 주소를 입력해주세요." {...register("address_en")} />
        {errors.address_en ? <p className="text-sm text-red-500">{errors.address_en.message}</p> : null}
      </div>
```

> 영문 주소는 지오코딩 트리거가 아니므로 좌표 버튼/메시지 없이 단순 Input. `Label`/`Input`은 이미 import됨.

---

### Task 7: 작품 폼의 임베드 place에 영문 주소 입력 추가

**Files:**
- Modify: `src/components/admin/artworks-form.tsx`

- [ ] **Step 1: place zod 스키마에 필수 address_en 추가 (`:99-106`)**

현재:
```ts
    name_en: z.string().trim().min(1, "필수 입력입니다."),
    address: z.string().optional(),
    zone_id: zoneIdFieldSchema,
```
변경:
```ts
    name_en: z.string().trim().min(1, "필수 입력입니다."),
    address: z.string().optional(),
    address_en: z.string().trim().min(1, "필수 입력입니다."),
    zone_id: zoneIdFieldSchema,
```

- [ ] **Step 2: `ArtworkPlace` 타입에 필드 추가 (`:121-130`)**

현재:
```ts
  name_en: string;
  address: string | null;
  lat: number;
```
변경:
```ts
  name_en: string;
  address: string | null;
  address_en: string | null;
  lat: number;
```

- [ ] **Step 3: defaultValues place에 추가 (`:289-296`)**

현재:
```ts
        address: initialData?.place?.address ?? "",
        zone_id: initialData?.place?.zone_id ? String(initialData.place.zone_id) : "",
```
변경:
```ts
        address: initialData?.place?.address ?? "",
        address_en: initialData?.place?.address_en ?? "",
        zone_id: initialData?.place?.zone_id ? String(initialData.place.zone_id) : "",
```

- [ ] **Step 4: onSubmit payload place에 추가 (`:581-588`)**

현재:
```ts
          address: values.place.address?.trim() ? values.place.address.trim() : null,
          lat: Number(values.place.lat),
```
변경:
```ts
          address: values.place.address?.trim() ? values.place.address.trim() : null,
          address_en: values.place.address_en.trim(),
          lat: Number(values.place.lat),
```

- [ ] **Step 5: JSX 영문 주소 필드 추가 (place 주소(도로명) 블록 닫힌 직후, `:843` 다음 줄)**

주소(도로명) place 블록 `</div>`(`:843`) 바로 다음에 삽입:
```tsx
          <div className="space-y-1">
            <Label htmlFor="place_address_en">주소(영문)</Label>
            <Input id="place_address_en" placeholder="영문 주소를 입력해주세요." {...register("place.address_en")} />
            {errors.place?.address_en ? (
              <p className="text-sm text-red-500">{errors.place.address_en.message}</p>
            ) : null}
          </div>
```

---

### Task 8: 작품 편집 페이지 place 타입에 address_en 추가

**Files:**
- Modify: `src/app/admin/artworks/[id]/page.tsx:15-24`

- [ ] **Step 1: Artwork.place 타입에 필드 추가**

현재:
```ts
    name_en: string;
    address: string | null;
    lat: number;
```
변경:
```ts
    name_en: string;
    address: string | null;
    address_en: string | null;
    lat: number;
```

> 이렇게 해야 GET 응답의 `place.address_en`이 `ArtworksForm`의 `initialData.place.address_en`으로 흘러 편집 시 프리필된다.

---

### Task 9: 클라이언트측 검증 + 커밋

- [ ] **Step 1: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음(0 exit).

- [ ] **Step 2: 린트**

Run: `npm run lint`
Expected: 신규 에러 없음.

- [ ] **Step 3: 수동 검증 (dev 서버)**

Run: `npm run dev` 후 브라우저에서:
- `/admin/places/new`: "주소(영문)" 필드가 보이고, 비우면 "필수 입력입니다." 에러로 저장 차단. 입력 후 저장 성공.
- `/admin/artworks/{id}` 수정: place 섹션에 "주소(영문)" 필드가 보이고 기존 값이 프리필(레거시 행은 비어 있어 입력 강제). 저장 후 재진입 시 입력값 유지.

> 통합/운영 DB에 `address_en` 컬럼이 적용돼 있어야 저장이 성공한다(통합 DB는 적용 완료). 미적용 DB로 띄우면 INSERT/UPDATE가 컬럼 없음 에러를 낸다.

- [ ] **Step 4: 선택 커밋**

```bash
git add src/components/admin/places-form.tsx \
        src/components/admin/artworks-form.tsx \
        "src/app/admin/artworks/[id]/page.tsx"
git commit -m "feat: 장소/작품 폼에 영문 주소 address_en 입력 추가"
```

---

## 이후 (범위 밖)
- 운영/스테이징 DB에 `address_en` 컬럼 적용(서버 `docs/sql/2026-06-28-add-places-address-en.sql` 동일 SQL).
- 필요 시 `/admin/places` 목록에 영문 주소 컬럼 노출.
- 기존 장소들의 영문 주소 백필(관리자가 수정하며 채우거나 일괄 데이터 작업).

---

## 자기 검토(Self-Review) 결과

**1. 스펙 커버리지**
- 서버 검증(필수): Task 1 ✓ (placeBase 공유 → places + 작품)
- places API 저장/조회: Task 2 ✓
- 작품 임베드 place 저장/조회(생성·수정, 클론·업데이트): Task 3 ✓
- 스키마 스냅샷: Task 4 ✓
- 장소 폼 입력: Task 6 ✓
- 작품 폼 입력: Task 7 ✓
- 편집 프리필(타입): Task 8 ✓
- 검증/커밋: Task 5, 9 ✓

**2. 플레이스홀더 스캔:** 모든 코드 단계에 실제 before/after + 명령/기대출력 포함. 추상 지시 없음.

**3. 타입/이름 일관성:** 신규 필드명 전부 `address_en`. DB/응답 타입은 `string | null`(nullable, 레거시 NULL 허용), 입력 검증은 필수(`z.string().trim().min(1)`). SELECT 치환 문자열은 모든 라우트에서 동일 패턴(`p.name_ko, p.name_en, p.address,`)이라 라우트별로 일관 적용. `address`(한글)는 optional·지오코딩 유지, `address_en`은 필수·비지오코딩.
