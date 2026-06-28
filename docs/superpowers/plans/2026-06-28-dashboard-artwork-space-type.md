# 대시보드 작품 "공간 유형"(space_type) 입력 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대시보드 작품 생성/수정 화면에서 "공간 유형"(예: 공원, 카페)을 한국어/영어 자유 텍스트로 입력·저장하고, 수정 시 기존 값이 다시 채워지도록 한다.

**Architecture:** 대시보드는 독립 Next.js 풀스택 앱으로, 자체 API 라우트(`/api/admin/artworks`)가 MySQL에 직접 SQL을 쓴다. `artworks` 테이블에 `space_type_ko` / `space_type_en` 두 컬럼(자유 텍스트, nullable)을 추가하는 작업이며, 이 계획은 **대시보드 코드만** 다룬다(컬럼 자체는 DB 담당자가 추가). 변경 지점은 검증 스키마 → 생성 INSERT → 수정 UPDATE → 폼 4곳이다. 상세 조회는 `SELECT *`라 컬럼만 생기면 자동 포함된다.

**Tech Stack:** Next.js (App Router) · TypeScript · zod · react-hook-form · mysql2 (raw SQL) · pnpm. 테스트 러너 없음 → 각 태스크 검증은 `pnpm exec tsc --noEmit` + `pnpm lint`, 최종 태스크에서 `pnpm dev` 수동 확인.

---

## 사전 조건 (DB 담당자가 처리 — 이 계획 범위 밖)

- `artworks` 테이블에 아래 두 컬럼이 추가돼 있어야 한다. 없으면 생성/수정 저장이 SQL 에러로 실패한다.
  - `space_type_ko VARCHAR(120) NULL`
  - `space_type_en VARCHAR(120) NULL`
- 기존 작품 행은 두 컬럼이 `NULL`로 채워지면 된다(자유 텍스트, 안 채워도 됨).

## 결정 사항 (그릴링 결과 / `CONTEXT.md` 의 "공간 유형" 참고)

- 위치: **`artworks` 테이블**(작품별 독립 기록), `places` 아님.
- 형태: **자유 텍스트(varchar)**. enum/별도 테이블/드롭다운 아님.
- 다국어: **`space_type_ko` / `space_type_en` 쌍**.
- 필수 아님: 비워두면 `null`로 저장. 입력칸에 **placeholder 넣지 않음**.
- 앱(소비자) 노출은 추후. 이 계획은 데이터 입력(대시보드)까지만.

## File Structure (수정 대상 4개 파일)

| 파일 | 책임 | 변경 |
|---|---|---|
| `src/lib/server/validators/admin.ts` | 작품 payload 검증(zod) | `artworkBasePayloadSchema`에 `space_type_ko/en`(optional, nullable, trim→null) 추가 |
| `src/app/api/admin/artworks/route.ts` | 작품 목록(GET)·생성(POST) | POST의 `INSERT INTO artworks`에 두 컬럼 추가. (목록 GET은 변경 없음) |
| `src/app/api/admin/artworks/[id]/route.ts` | 작품 상세(GET)·수정(PUT) | PUT의 `UPDATE artworks`에 두 컬럼 추가. (상세 GET은 `SELECT *`라 변경 없음) |
| `src/components/admin/artworks-form.tsx` | 생성/수정 폼 | zod schema·`ArtworkInitialData`·defaultValues·submit payload·입력 UI 5곳에 `space_type_ko/en` 추가 |

작업 디렉터리: `/Users/donggyunyang/code/steelart/steelart_dashboard`. 모든 명령은 이 디렉터리에서 실행.

---

## Task 1: 검증 스키마에 space_type 추가

**Files:**
- Modify: `src/lib/server/validators/admin.ts`

- [ ] **Step 1: 재사용 가능한 optional 텍스트 스키마 추가**

`optionalAddressSchema` 정의(73-84행 부근) 바로 아래에 다음을 추가한다. (빈 문자열/공백/undefined → `null`, 값 있으면 trim 결과)

```ts
const optionalTrimmedTextSchema = z
  .string()
  .optional()
  .nullable()
  .transform((value) => {
    if (value == null) {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  });
```

- [ ] **Step 2: `artworkBasePayloadSchema`에 두 필드 추가**

`artworkBasePayloadSchema`(104-114행 부근)의 `description_en` 줄 다음에 추가:

```ts
const artworkBasePayloadSchema = z.object({
  title_ko: z.string().min(1),
  title_en: z.string().min(1),
  artist_id: z.coerce.number().int().positive(),
  category: artworkCategorySchema,
  production_year: z.coerce.number().int().positive(),
  size_text_ko: z.string().min(1),
  size_text_en: z.string().min(1),
  description_ko: z.string().min(1),
  description_en: z.string().min(1),
  space_type_ko: optionalTrimmedTextSchema,
  space_type_en: optionalTrimmedTextSchema,
});
```

> `artworkPayloadSchema`(생성)와 `artworkUpdatePayloadSchema`(수정) 모두 이 base를 확장하므로 두 곳 다 자동 반영된다. 변환 결과 타입은 `string | null`.

- [ ] **Step 3: 타입 체크 + 린트**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음 (종료 코드 0)

Run: `pnpm lint`
Expected: 에러/경고 없음

- [ ] **Step 4: 커밋**

```bash
git add src/lib/server/validators/admin.ts
git commit -m "feat: 작품 payload 검증에 space_type_ko/en 추가" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 작품 생성(POST) INSERT에 space_type 반영

**Files:**
- Modify: `src/app/api/admin/artworks/route.ts:156-177` (POST 내부 `INSERT INTO artworks`)

- [ ] **Step 1: INSERT 컬럼/VALUES/params에 두 컬럼 추가**

기존(156-177행):

```ts
      const [inserted] = await connection.query<ResultSetHeader>(
        `INSERT INTO artworks (
            title_ko, title_en, artist_id, place_id, category, production_year,
            size_text_ko, size_text_en, description_ko, description_en,
            audio_url_ko, audio_url_en,
            likes_count, deleted_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NOW(), NOW())`,
        [
          payload.title_ko,
          payload.title_en,
          payload.artist_id,
          insertedPlace.insertId,
          payload.category,
          payload.production_year,
          payload.size_text_ko,
          payload.size_text_en,
          payload.description_ko,
          payload.description_en,
          payload.audio_url_ko,
          payload.audio_url_en,
        ],
      );
```

변경 후 (컬럼 2개·VALUES `?` 2개·params 2개 추가, `?` 총 12→14):

```ts
      const [inserted] = await connection.query<ResultSetHeader>(
        `INSERT INTO artworks (
            title_ko, title_en, artist_id, place_id, category, production_year,
            size_text_ko, size_text_en, description_ko, description_en,
            audio_url_ko, audio_url_en, space_type_ko, space_type_en,
            likes_count, deleted_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NOW(), NOW())`,
        [
          payload.title_ko,
          payload.title_en,
          payload.artist_id,
          insertedPlace.insertId,
          payload.category,
          payload.production_year,
          payload.size_text_ko,
          payload.size_text_en,
          payload.description_ko,
          payload.description_en,
          payload.audio_url_ko,
          payload.audio_url_en,
          payload.space_type_ko ?? null,
          payload.space_type_en ?? null,
        ],
      );
```

> POST 마지막의 `SELECT * FROM artworks WHERE id = ?`(202행)는 새 컬럼을 자동 포함하므로 변경 불필요.

- [ ] **Step 2: 타입 체크 + 린트**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음

Run: `pnpm lint`
Expected: 에러/경고 없음

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/admin/artworks/route.ts
git commit -m "feat: 작품 생성 시 space_type_ko/en 저장" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: 작품 수정(PUT) UPDATE에 space_type 반영

**Files:**
- Modify: `src/app/api/admin/artworks/[id]/route.ts:182-204` (PUT 내부 `UPDATE artworks`)

- [ ] **Step 1: UPDATE SET/params에 두 컬럼 추가**

기존(182-204행):

```ts
      await connection.query<ResultSetHeader>(
        `UPDATE artworks
         SET title_ko = ?, title_en = ?, artist_id = ?, place_id = ?,
             category = ?, production_year = ?, size_text_ko = ?, size_text_en = ?,
             description_ko = ?, description_en = ?,
             audio_url_ko = ?, audio_url_en = ?, updated_at = NOW()
         WHERE id = ?`,
        [
          payload.title_ko,
          payload.title_en,
          payload.artist_id,
          nextPlaceId,
          payload.category,
          payload.production_year,
          payload.size_text_ko,
          payload.size_text_en,
          payload.description_ko,
          payload.description_en,
          payload.audio_url_ko ?? existingRow.audio_url_ko,
          payload.audio_url_en ?? existingRow.audio_url_en,
          id,
        ],
      );
```

변경 후 (`space_type_ko = ?, space_type_en = ?` 추가, params는 `id` 앞에 2개 추가):

```ts
      await connection.query<ResultSetHeader>(
        `UPDATE artworks
         SET title_ko = ?, title_en = ?, artist_id = ?, place_id = ?,
             category = ?, production_year = ?, size_text_ko = ?, size_text_en = ?,
             description_ko = ?, description_en = ?,
             audio_url_ko = ?, audio_url_en = ?,
             space_type_ko = ?, space_type_en = ?, updated_at = NOW()
         WHERE id = ?`,
        [
          payload.title_ko,
          payload.title_en,
          payload.artist_id,
          nextPlaceId,
          payload.category,
          payload.production_year,
          payload.size_text_ko,
          payload.size_text_en,
          payload.description_ko,
          payload.description_en,
          payload.audio_url_ko ?? existingRow.audio_url_ko,
          payload.audio_url_en ?? existingRow.audio_url_en,
          payload.space_type_ko ?? null,
          payload.space_type_en ?? null,
          id,
        ],
      );
```

> 상세 GET(`getArtworkWithImages` 내 `SELECT * FROM artworks`, 53행)은 새 컬럼을 자동 포함하므로 변경 불필요. 즉 수정 화면 진입 시 기존 값이 그대로 채워진다(Task 4의 defaultValues가 이를 사용).

- [ ] **Step 2: 타입 체크 + 린트**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음

Run: `pnpm lint`
Expected: 에러/경고 없음

- [ ] **Step 3: 커밋**

```bash
git add "src/app/api/admin/artworks/[id]/route.ts"
git commit -m "feat: 작품 수정 시 space_type_ko/en 저장" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: 작품 폼에 공간 입력칸 + 데이터 연결

**Files:**
- Modify: `src/components/admin/artworks-form.tsx` (5개 지점)

- [ ] **Step 1: zod `schema`에 두 필드 추가**

`schema`(87-108행)의 `description_en` 줄 다음에 추가:

```ts
  description_ko: z.string().min(1),
  description_en: z.string().min(1),
  space_type_ko: z.string().optional(),
  space_type_en: z.string().optional(),
  place: z.object({
```

- [ ] **Step 2: `ArtworkInitialData` 타입에 두 필드 추가**

`ArtworkInitialData`(134-151행)의 `description_en?` 줄 다음에 추가:

```ts
  description_ko?: string;
  description_en?: string;
  space_type_ko?: string | null;
  space_type_en?: string | null;
  audio_url_ko?: string | null;
```

- [ ] **Step 3: `defaultValues`에 두 필드 추가**

`useForm`의 `defaultValues`(279-300행)에서 `description_en` 줄 다음에 추가:

```ts
      description_ko: initialData?.description_ko ?? "",
      description_en: initialData?.description_en ?? "",
      space_type_ko: initialData?.space_type_ko ?? "",
      space_type_en: initialData?.space_type_en ?? "",
      audio_url_ko: initialData?.audio_url_ko ?? "",
```

- [ ] **Step 4: submit `payload`에 두 필드 추가**

`onSubmit` 내부 `payload` 객체(574-601행)에서 `description_en` 줄 다음에 추가 (빈 값이면 `null` 전송):

```ts
        description_ko: values.description_ko,
        description_en: values.description_en,
        space_type_ko: values.space_type_ko?.trim() ? values.space_type_ko.trim() : null,
        space_type_en: values.space_type_en?.trim() ? values.space_type_en.trim() : null,
        place: {
```

- [ ] **Step 5: "기본 정보" 카드에 입력칸 2개 추가 (placeholder 없음)**

"기본 정보" `Card`의 마지막, **작품 설명(영어) 그리드가 끝난 직후 ~ `</CardContent>` 직전**(759-760행 사이)에 새 그리드를 추가한다. 기존:

```tsx
            <div className="space-y-1">
              <Label htmlFor="description_en">작품 설명(영어)</Label>
              <Textarea id="description_en" rows={4} {...register("description_en")} />
              {errors.description_en ? (
                <p className="text-sm text-red-500">필수 입력입니다.</p>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
```

변경 후:

```tsx
            <div className="space-y-1">
              <Label htmlFor="description_en">작품 설명(영어)</Label>
              <Textarea id="description_en" rows={4} {...register("description_en")} />
              {errors.description_en ? (
                <p className="text-sm text-red-500">필수 입력입니다.</p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="space_type_ko">공간(한국어)</Label>
              <Input id="space_type_ko" {...register("space_type_ko")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="space_type_en">공간(영어)</Label>
              <Input id="space_type_en" {...register("space_type_en")} />
            </div>
          </div>
        </CardContent>
      </Card>
```

> 선택 입력이라 에러 표시(`errors.space_type_*`)는 두지 않는다. `placeholder` 속성 없음.

- [ ] **Step 6: 타입 체크 + 린트**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음

Run: `pnpm lint`
Expected: 에러/경고 없음

- [ ] **Step 7: 커밋**

```bash
git add src/components/admin/artworks-form.tsx
git commit -m "feat: 작품 폼에 공간(space_type) 한/영 입력칸 추가" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: 수동 검증 (테스트 러너 없음 → 실제 화면 확인)

**Files:** 없음 (실행/확인만)

> 사전 조건: DB에 `space_type_ko` / `space_type_en` 컬럼이 추가돼 있어야 함. 미적용 시 저장이 SQL 에러로 실패한다.

- [ ] **Step 1: 빌드로 전체 타입/번들 확인**

Run: `pnpm build`
Expected: 빌드 성공 (타입 에러·린트 에러 없음)

- [ ] **Step 2: 개발 서버 실행**

Run: `pnpm dev`
Expected: `http://localhost:3000` 기동

- [ ] **Step 3: 생성 검증**

1. `/admin/artworks/new` 진입.
2. 필수 필드 + "공간(한국어)"에 `공원`, "공간(영어)"에 `Park` 입력 후 저장.
3. Expected: 저장 성공(목록으로 이동). DB `artworks` 최신 행의 `space_type_ko='공원'`, `space_type_en='Park'` 확인(또는 4의 수정 화면으로 재확인).

- [ ] **Step 4: 수정 재진입 검증(값 재채움)**

1. 방금 만든 작품의 `/admin/artworks/{id}` 진입.
2. Expected: "공간(한국어)"=`공원`, "공간(영어)"=`Park`가 **미리 채워져** 있음.
3. 값을 `카페`/`Cafe`로 바꿔 저장 → 다시 진입 시 바뀐 값 유지 확인.

- [ ] **Step 5: 빈 값 검증(선택 입력)**

1. 두 칸을 비우고 저장 → 저장 성공(필수 아님), DB에 `NULL` 저장 확인.

- [ ] **Step 6: 확인 후 정리**

수동 검증 통과를 확인하면 이 태스크는 커밋 불필요(코드 변경 없음). 문제가 있으면 해당 Task로 돌아가 수정.

---

## Self-Review (작성자 점검 결과)

1. **Spec coverage:** 결정 사항 전부 태스크에 매핑됨 — artworks 위치(Task 2·3), 자유 텍스트(Task 1 optional/transform), ko/en 쌍(전 태스크), 필수 아님(optional + null 저장), placeholder 없음(Task 4 Step 5), 대시보드 생성/수정 입력(Task 4 + 5). DB 컬럼은 범위 밖(사전 조건에 명시).
2. **Placeholder 스캔:** 모든 코드 스텝에 실제 코드 포함. "적절히 처리" 류 없음.
3. **Type consistency:** 필드명 `space_type_ko` / `space_type_en` 전 파일 동일. 검증 변환 결과 `string | null` → INSERT/UPDATE params `?? null` 일관. 폼 payload는 `trim() ? ... : null`로 동일한 null 규약 사용. `optionalTrimmedTextSchema`는 Task 1에서 정의 후 base schema에서만 사용.

## CONTEXT.md / ADR
- CONTEXT.md: "공간 유형" 용어는 그릴링 단계에서 이미 추가됨(별도 작업 불필요).
- ADR: 사용자 요청으로 작성하지 않음.
