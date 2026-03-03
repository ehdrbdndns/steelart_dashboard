# Plan: `user_selected_courses`(= 요청의 `user_selecte_course`) 도메인 제거 대응

작성일: 2026-03-03  
대상 저장소: `/Users/donggyunyang/code/steelart_dashboard`

## 1. 목적

`User가 Course를 선택한다`는 도메인을 시스템에서 제거한다.  
이에 따라 관리자 페이지에서 해당 도메인에 의존하는 조회/표시/시드 로직을 제거하고, DB 테이블 삭제 후에도 관리자 기능이 정상 동작하도록 한다.

## 2. 전제 및 확인 사항

- 코드상 실제 테이블명은 `user_selected_courses`이다.

## 진행 상태 (2026-03-03)

- [x] Step 1 API 계약 변경 완료
- [x] Step 2 관리자 사용자 상세 UI 변경 완료
- [x] Step 3 시드 스크립트 변경 완료
- [x] Step 4 DB 삭제 절차 구현 및 실행 시도 완료
  - 수동 SQL 기반 DROP 실행 시도
  - 결과: DB 계정 권한 부족으로 `CREATE TABLE`/`DROP TABLE` 거부 (`ER_TABLEACCESS_DENIED_ERROR`)
  - 후속: DBA 권한 계정으로 아래 권장 SQL 절차 실행 필요
- [x] Step 5 문서 동기화 완료
- [x] 타입체크/빌드 검증 완료 (`pnpm lint`, `pnpm build`)
- [x] Playwright 자동검증 완료
  - 검증 세션: `autoverify`
  - 결과: `/admin/users/:id`에서 `"선택한 코스"` 미노출 확인, `/api/admin/users/:id` 응답에 `selectedCourse` 필드 없음 확인

## 3. 현재 영향 범위 (실제 코드 기준)

의존 코드 3곳:

1. `src/app/api/admin/users/[id]/route.ts`
- `SelectedCourseRow` 타입 정의
- `Promise.all`에서 `user_selected_courses` 조회 쿼리 수행
- API 응답에 `selectedCourse` 포함

2. `src/app/admin/users/[id]/page.tsx`
- `SelectedCourse` 타입 정의
- `UserDetail.selectedCourse` 의존
- "선택한 코스" 섹션 렌더링

3. `scripts/seed-users-realistic.mjs`
- `INSERT INTO user_selected_courses ...`
- `selectedCourseId` 변수를 체크인 데이터 생성 기준으로 사용

## 4. 변경 원칙 (Scope Guard)

이번 변경에서는 다음만 수행한다.

- 관리자 상세 화면의 "선택한 코스" 도메인 제거
- 관리자 사용자 상세 API의 `selectedCourse` 필드 제거
- 시드 스크립트에서 `user_selected_courses` 쓰기 제거
- 테이블 드롭 SQL 및 운영 절차 문서화

이번 변경에서 하지 않는다.

- `course_likes`, `course_checkins`, `created_by_user_id` 도메인 변경
- 사용자/코스 관리자 기능의 추가 UI 개편
- 신규 마이그레이션 프레임워크 도입

## 5. 배포 전략 (중요)

`DB를 먼저 drop`하면 현재 API가 즉시 실패한다. 따라서 순서가 중요하다.

1. 코드 선배포 (테이블 참조 제거)
2. 동작 검증
3. DB에서 `user_selected_courses` 테이블 drop
4. 스키마 문서 갱신

필요 시 2단계 배포로 진행:
- Phase A: 코드 배포
- Phase B: DB 변경

## 6. 상세 작업 계획

## Step 1) API 계약 변경

파일: `src/app/api/admin/users/[id]/route.ts`

작업:
- `SelectedCourseRow` 타입 삭제
- `Promise.all`에서 선택코스 조회 쿼리 제거
- 응답 객체에서 `selectedCourse` 제거

Before (핵심):

```ts
type SelectedCourseRow = RowDataPacket & {
  course_id: number;
  selected_at: string;
  title_ko: string;
  title_en: string;
  is_official: number;
  deleted_at: string | null;
};

const [createdCourses, likedCourses, likedArtworks, stamps, selectedCourses] =
  await Promise.all([
    // ...
    query<SelectedCourseRow[]>(
      `SELECT usc.course_id, usc.created_at AS selected_at,
              c.title_ko, c.title_en, c.is_official, c.deleted_at
       FROM user_selected_courses usc
       INNER JOIN courses c ON c.id = usc.course_id
       WHERE usc.user_id = ?`,
      [userId],
    ),
  ]);

return ok({
  user,
  summary: { ... },
  selectedCourse: selectedCourses[0] ?? null,
  createdCourses,
  likedCourses,
  likedArtworks,
  stamps,
});
```

After (목표):

```ts
const [createdCourses, likedCourses, likedArtworks, stamps] = await Promise.all([
  // createdCourses
  // likedCourses
  // likedArtworks
  // stamps
]);

return ok({
  user,
  summary: {
    createdCourses: createdCourses.length,
    likedCourses: likedCourses.length,
    likedArtworks: likedArtworks.length,
    stamps: stamps.length,
  },
  createdCourses,
  likedCourses,
  likedArtworks,
  stamps,
});
```

API 계약 영향:
- `GET /api/admin/users/:id` 응답에서 `selectedCourse` 필드가 제거된다.

## Step 2) 관리자 사용자 상세 UI 변경

파일: `src/app/admin/users/[id]/page.tsx`

작업:
- `SelectedCourse` 타입 삭제
- `UserDetail` 타입에서 `selectedCourse` 제거
- 구조분해에서 `selectedCourse` 제거
- "선택한 코스" 카드 섹션 전체 삭제
- `Button` import가 해당 섹션에서만 쓰이면 정리

Before (핵심 타입/구조분해):

```ts
type UserDetail = {
  user: UserProfile;
  summary: { ... };
  selectedCourse: SelectedCourse | null;
  createdCourses: CreatedCourse[];
  likedCourses: LikedCourse[];
  likedArtworks: LikedArtwork[];
  stamps: Stamp[];
};

const { user, summary, selectedCourse, createdCourses, likedCourses, likedArtworks, stamps } =
  detail;
```

After (목표):

```ts
type UserDetail = {
  user: UserProfile;
  summary: {
    createdCourses: number;
    likedCourses: number;
    likedArtworks: number;
    stamps: number;
  };
  createdCourses: CreatedCourse[];
  likedCourses: LikedCourse[];
  likedArtworks: LikedArtwork[];
  stamps: Stamp[];
};

const { user, summary, createdCourses, likedCourses, likedArtworks, stamps } = detail;
```

UI 섹션 제거 대상:

```tsx
<div className="rounded-md border p-4">
  <h2 className="mb-3 text-lg font-semibold">선택한 코스</h2>
  ...
</div>
```

## Step 3) 시드 스크립트 변경

파일: `scripts/seed-users-realistic.mjs`

작업:
- `INSERT INTO user_selected_courses` 쿼리 제거
- `selectedCourseId` 변수명을 체크인 목적에 맞게 `checkinCourseId`로 변경
- 체크인 생성은 기존처럼 유지

Before (핵심):

```js
const selectedCourseId = pick(courseIds, i);

await connection.query(
  `INSERT INTO user_selected_courses (user_id, course_id, created_at)
   VALUES (?, ?, NOW())
   ON DUPLICATE KEY UPDATE course_id = VALUES(course_id), created_at = VALUES(created_at)`,
  [userId, selectedCourseId],
);

const [itemRows] = await connection.query(
  `SELECT id AS course_item_id, course_id
   FROM course_items
   WHERE course_id = ?
   ORDER BY seq ASC
   LIMIT 2`,
  [selectedCourseId],
);
```

After (목표):

```js
const checkinCourseId = pick(courseIds, i);

const [itemRows] = await connection.query(
  `SELECT id AS course_item_id, course_id
   FROM course_items
   WHERE course_id = ?
   ORDER BY seq ASC
   LIMIT 2`,
  [checkinCourseId],
);
```

## Step 4) DB 테이블 삭제 절차

테이블 삭제는 코드 배포 후 수행한다.

구현 반영:
- 수동 SQL 절차 문서화

실행 시도 결과(2026-03-03):
- 백업+DROP SQL 실행 시도
- 실패 사유: `ER_TABLEACCESS_DENIED_ERROR` (현재 DB 계정에 `CREATE TABLE`, `DROP TABLE` 권한 없음)
- 따라서 실제 DB drop은 권한 있는 계정으로 별도 실행 필요

권장 SQL 절차:

```sql
-- 1) 존재 확인
SELECT COUNT(*) AS row_count FROM user_selected_courses;

-- 2) 백업(선택)
CREATE TABLE user_selected_courses_backup_20260303 AS
SELECT * FROM user_selected_courses;

-- 3) 삭제
DROP TABLE IF EXISTS user_selected_courses;
```

운영 체크:
- 다른 서비스/잡이 테이블을 참조하지 않는지 사전 확인
- 삭제 직후 관리자 `users/:id` API 재호출하여 500 여부 확인

## Step 5) 문서 동기화

필수 업데이트:
- `docs/db-schema.sql`: `pnpm db:schema:export`로 최신 스냅샷 반영
- `README.md` 또는 `docs/admin-backoffice.md`:
  - 사용자 상세에서 "선택한 코스" 정보 제거 명시
- (선택) `research.md` 최신화

이번 작업에서 반영 완료:
- `pnpm db:schema:export` 실행으로 `docs/db-schema.sql` 갱신
- `docs/admin-backoffice.md`에 selected-course 도메인 제거 내용 반영
- `docs/db-contract.md`에 deprecated 규칙 반영

## 7. 검증 계획

자동 검증:

```bash
pnpm lint
pnpm build
```

E2E 자동 검증 (Playwright):

- 목적: `user_selected_courses` 제거 이후에도 `/admin/users/:id` 페이지가 오류 없이 렌더링되고, API 계약 변경(`selectedCourse` 제거)이 실제 화면에 반영되는지 확인
- 권장 검증 흐름:
1. 관리자 로그인
2. `/admin/users` 진입 후 임의 사용자 상세 페이지 이동
3. 상세 화면에 `"선택한 코스"` 섹션이 노출되지 않음을 확인
4. 네트워크 응답(`/api/admin/users/:id`)에 `selectedCourse` 필드가 없음을 확인
5. 생성 코스/좋아요 코스/좋아요 작품/스탬프 섹션은 정상 노출됨을 확인

Playwright 시나리오 예시:

```ts
test("user detail page renders without selected-course domain", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(process.env.ADMIN_EMAIL!);
  await page.getByLabel("Password").fill(process.env.ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "로그인" }).click();

  await page.goto("/admin/users");
  await page.getByRole("link", { name: "상세" }).first().click();

  await expect(page.getByText("선택한 코스")).toHaveCount(0);
  await expect(page.getByText("이 사용자가 만든 코스")).toBeVisible();
  await expect(page.getByText("좋아요한 코스")).toBeVisible();
  await expect(page.getByText("좋아요한 작품")).toBeVisible();
  await expect(page.getByText("스탬프(체크인) 내역")).toBeVisible();
});
```

실행 결과 (2026-03-03):
- UI 검증: `document.body.innerText.includes("선택한 코스") === false`
- API 검증: `/api/admin/users/:id` 응답 키
  - `["user","summary","createdCourses","likedCourses","likedArtworks","stamps"]`
  - `selectedCourse` 키 미포함
- 보존 섹션 검증:
  - `"이 사용자가 만든 코스"` 노출
  - `"좋아요한 코스"` 노출
  - `"좋아요한 작품"` 노출
  - `"스탬프(체크인) 내역"` 노출

수동 검증:

1. `/admin/users` 목록 진입
2. `/admin/users/:id` 상세 진입
3. "선택한 코스" 섹션이 없어졌는지 확인
4. 생성 코스/좋아요 코스/좋아요 작품/스탬프 섹션 정상 렌더 확인
5. 네트워크 응답에서 `selectedCourse` 필드 미포함 확인
6. `pnpm db:seed:users` 실행 시 `user_selected_courses` 관련 오류가 없는지 확인

## 8. 롤백 계획

- 코드 롤백만 하고 DB를 이미 drop한 경우:
  - 이전 코드가 `user_selected_courses` 조회를 시도하므로 장애 가능
  - 따라서 DB drop 이후 롤백 시에는 백업 테이블에서 복원 필요

복원 예시:

```sql
CREATE TABLE user_selected_courses AS
SELECT * FROM user_selected_courses_backup_20260303;
```

## 9. 완료 기준 (Definition of Done)

- `src/app/api/admin/users/[id]/route.ts`에서 `user_selected_courses` 참조 0건
- `src/app/admin/users/[id]/page.tsx`에서 "선택한 코스" UI 및 타입 의존성 제거
- `scripts/seed-users-realistic.mjs`에서 `user_selected_courses` 쓰기 제거
- `pnpm lint`, `pnpm build` 통과
- DB에서 `user_selected_courses` drop 실행 준비 완료(권한 계정으로 최종 실행 필요)
- 문서(`db-schema.sql` 포함) 최신화

## 10. 구현 순서 요약

1. 코드 수정 (API + UI + seed)
2. lint/build 검증
3. 배포
4. DB backup + drop
5. smoke test
6. schema/doc 갱신
