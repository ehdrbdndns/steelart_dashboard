# Course Realistic Mock Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the course-domain mock seed produce realistic, relationally coherent course data instead of random course-item links.

**Architecture:** Keep the existing database-backed seed workflow, but move course mock generation to deterministic blueprint helpers that understand `zones -> places -> artworks -> course_items -> users/likes/checkins`. The seed remains idempotent and avoids destructive item deletion when `course_checkins` already reference course items.

**Tech Stack:** Node.js ESM scripts, mysql2/promise, existing `.env` seed commands, MySQL foreign keys and unique constraints.

---

## Current Findings

- Primary course mock entrypoint: `scripts/seed-mock-data.mjs`
- Related user activity seed: `scripts/seed-users-realistic.mjs`
- Course DB contract: `docs/db-contract.md`
- Course schema snapshot: `docs/db-schema.sql`
- Existing seed issue: `seedCourseItems()` picks artworks by `(courseIndex * 7 + offset) % artworkIds.length`, so routes are deterministic but not geographically or thematically coherent.
- Existing activity issue: `scripts/seed-users-realistic.mjs` inserts `course_likes` and `artwork_likes`, but does not recalculate denormalized `likes_count`.

## Target Data Relationships

The seed should model these relationships:

- `courses.is_official = 1`: curated editorial courses, no `created_by_user_id`.
- `courses.is_official = 0`: user-created courses, valid `created_by_user_id`.
- `course_items`: each course has ordered artwork stops from nearby places or a coherent theme.
- `course_items.seq`: contiguous from `1..n`, with existing row ids preserved on reorder.
- `course_checkins`: each row references a valid user, course, and course item from the same course.
- `course_likes`: users like courses that fit their persona; `courses.likes_count` equals actual like rows.
- `artwork_likes`: user activity can support course persona realism; `artworks.likes_count` equals actual like rows.

## File Structure

- Modify: `scripts/seed-mock-data.mjs`
  - Add course blueprints, artwork catalog queries, course item sync, seeded user personas, likes/checkins, and count reconciliation.
- Modify: `scripts/seed-users-realistic.mjs`
  - Add the same like-count reconciliation after its existing user activity inserts so both seed commands leave counts consistent.
- Modify: `docs/admin-backoffice.md`
  - Document the new mock seed output: coherent courses, user-created courses, likes/checkins.
- Modify: `docs/db-contract.md`
  - Add seed-data invariants for course item ordering and denormalized like counts.
- Read-only reference: `.github/pull_request_template.md`
  - Final PR write-up must use the existing template sections: 요약, 변경내용, 검증, 스크린샷.

---

### Task 1: Map Course Mock Invariants

**Files:**
- Modify: `docs/db-contract.md`

- [ ] **Step 1: Add seed-data invariants**

Add this section after `## Critical Rules`:

```md
## Seed Data Invariants

- Mock course items should be geographically or thematically coherent, not random artwork rotations.
- Mock course item `seq` values must be contiguous from `1` for each course.
- Mock seed scripts must not delete `course_items` rows that have `course_checkins`.
- Mock seed scripts must reconcile denormalized `courses.likes_count` and `artworks.likes_count` from like tables when seeding likes.
- User-created mock courses must have `is_official = 0` and a valid `created_by_user_id`.
- Official mock courses must have `is_official = 1` and `created_by_user_id = NULL`.
```

- [ ] **Step 2: Review the changed section**

Run:

```bash
sed -n '1,80p' docs/db-contract.md
```

Expected: the new seed invariants appear after the existing critical rules.

- [ ] **Step 3: Commit**

```bash
git add docs/db-contract.md
git commit -m "docs: define course mock seed invariants"
```

---

### Task 2: Add Deterministic Course Blueprints

**Files:**
- Modify: `scripts/seed-mock-data.mjs`

- [ ] **Step 1: Add named course and user seed constants**

Place these constants after `TARGET`:

```js
const COURSE_BLUEPRINTS = [
  {
    slug: "yeongildae-seaside",
    titleKo: `${MOCK_PREFIX} 영일대 해안 산책 코스`,
    titleEn: `${MOCK_PREFIX} Yeongildae Seaside Walk`,
    descriptionKo: "해안가와 가까운 작품을 따라 걷는 공식 산책 코스",
    descriptionEn: "An official walk linking artworks near the seaside.",
    isOfficial: 1,
    zoneOffset: 0,
    category: "PUBLIC_ART",
    targetCount: 6,
  },
  {
    slug: "steel-heritage",
    titleKo: `${MOCK_PREFIX} 철의 도시 조형 코스`,
    titleEn: `${MOCK_PREFIX} Steel Heritage Route`,
    descriptionKo: "스틸아트 작품을 중심으로 구성한 공식 감상 코스",
    descriptionEn: "An official route focused on steel art pieces.",
    isOfficial: 1,
    zoneOffset: 1,
    category: "STEEL_ART",
    targetCount: 7,
  },
  {
    slug: "family-weekend",
    titleKo: `${MOCK_PREFIX} 가족 주말 관람 코스`,
    titleEn: `${MOCK_PREFIX} Family Weekend Course`,
    descriptionKo: "짧은 동선으로 작품을 둘러보는 사용자 추천 코스",
    descriptionEn: "A user-recommended short course for a weekend visit.",
    isOfficial: 0,
    userSeedIndex: 0,
    zoneOffset: 2,
    targetCount: 4,
  },
  {
    slug: "night-photo",
    titleKo: `${MOCK_PREFIX} 야간 포토 스팟 코스`,
    titleEn: `${MOCK_PREFIX} Night Photo Spot Course`,
    descriptionKo: "저녁 산책과 사진 촬영에 어울리는 사용자 추천 코스",
    descriptionEn: "A user-recommended route for evening photos.",
    isOfficial: 0,
    userSeedIndex: 1,
    zoneOffset: 0,
    targetCount: 5,
  },
];

const COURSE_USER_SEEDS = [
  { nickname: "포항코스_수진", residency: "POHANG", age_group: "30S", language: "ko", notifications_enabled: 1 },
  { nickname: "steel_route_mike", residency: "NON_POHANG", age_group: "40S", language: "en", notifications_enabled: 1 },
  { nickname: "가족나들이_현우", residency: "POHANG", age_group: "40S", language: "ko", notifications_enabled: 0 },
  { nickname: "weekend_art_ana", residency: "NON_POHANG", age_group: "20S", language: "en", notifications_enabled: 1 },
];
```

- [ ] **Step 2: Run a syntax check**

Run:

```bash
node --check scripts/seed-mock-data.mjs
```

Expected: no syntax errors.

- [ ] **Step 3: Commit**

```bash
git add scripts/seed-mock-data.mjs
git commit -m "feat: add course mock blueprints"
```

---

### Task 3: Build Artwork Catalog Selection

**Files:**
- Modify: `scripts/seed-mock-data.mjs`

- [ ] **Step 1: Add catalog query helper**

Add this helper after `findOrCreateArtwork()`:

```js
async function loadArtworkCatalog() {
  const [rows] = await connection.query(
    `SELECT
       a.id AS artwork_id,
       a.category,
       a.production_year,
       p.id AS place_id,
       p.zone_id,
       p.lat,
       p.lng
     FROM artworks a
     INNER JOIN places p ON p.id = a.place_id
     WHERE a.deleted_at IS NULL
       AND p.deleted_at IS NULL
     ORDER BY p.zone_id ASC, a.production_year ASC, a.id ASC`,
  );

  return rows;
}

function selectArtworkIdsForCourse(catalog, blueprint, fallbackArtworkIds) {
  const zoneIds = [...new Set(catalog.map((row) => row.zone_id).filter(Boolean))];
  const preferredZoneId = zoneIds[blueprint.zoneOffset % zoneIds.length];
  const filtered = catalog.filter((row) => {
    const categoryMatches = !blueprint.category || row.category === blueprint.category;
    return categoryMatches && row.zone_id === preferredZoneId;
  });
  const nearbyFallback = catalog.filter((row) => row.zone_id === preferredZoneId);
  const pool = filtered.length >= blueprint.targetCount ? filtered : nearbyFallback;
  const selected = pool.slice(0, blueprint.targetCount).map((row) => row.artwork_id);

  if (selected.length >= blueprint.targetCount) {
    return selected;
  }

  for (const artworkId of fallbackArtworkIds) {
    if (!selected.includes(artworkId)) {
      selected.push(artworkId);
    }
    if (selected.length === blueprint.targetCount) {
      break;
    }
  }

  return selected;
}
```

- [ ] **Step 2: Guard empty catalog**

Inside `selectArtworkIdsForCourse`, before reading `zoneIds[blueprint.zoneOffset % zoneIds.length]`, add:

```js
  if (catalog.length === 0 || zoneIds.length === 0) {
    return fallbackArtworkIds.slice(0, blueprint.targetCount);
  }
```

- [ ] **Step 3: Run syntax check**

Run:

```bash
node --check scripts/seed-mock-data.mjs
```

Expected: no syntax errors.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-mock-data.mjs
git commit -m "feat: select coherent artwork stops for mock courses"
```

---

### Task 4: Seed Course Users And Courses

**Files:**
- Modify: `scripts/seed-mock-data.mjs`

- [ ] **Step 1: Add user helper**

Add this helper after `selectArtworkIdsForCourse()`:

```js
async function findOrCreateCourseUser(seed) {
  const [rows] = await connection.query(
    `SELECT id FROM users WHERE nickname = ? LIMIT 1`,
    [seed.nickname],
  );

  if (rows[0]?.id) {
    await connection.query(
      `UPDATE users
       SET residency = ?, age_group = ?, language = ?, notifications_enabled = ?, updated_at = NOW()
       WHERE id = ?`,
      [seed.residency, seed.age_group, seed.language, seed.notifications_enabled, rows[0].id],
    );
    return rows[0].id;
  }

  const [inserted] = await connection.query(
    `INSERT INTO users (
       nickname, residency, age_group, language, notifications_enabled, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
    [seed.nickname, seed.residency, seed.age_group, seed.language, seed.notifications_enabled],
  );

  return inserted.insertId;
}

async function ensureCourseUsers() {
  const userIds = [];

  for (const seed of COURSE_USER_SEEDS) {
    userIds.push(await findOrCreateCourseUser(seed));
  }

  return userIds;
}
```

- [ ] **Step 2: Replace `findOrCreateCourse(index)` with blueprint version**

Replace the function signature and body with:

```js
async function findOrCreateCourseFromBlueprint(blueprint, userIds) {
  const createdByUserId =
    blueprint.isOfficial === 1 ? null : userIds[blueprint.userSeedIndex % userIds.length];

  const [rows] = await connection.query(
    `SELECT id FROM courses WHERE title_ko = ? LIMIT 1`,
    [blueprint.titleKo],
  );

  if (rows[0]?.id) {
    await connection.query(
      `UPDATE courses
       SET title_en = ?, description_ko = ?, description_en = ?,
           is_official = ?, created_by_user_id = ?, deleted_at = NULL, updated_at = NOW()
       WHERE id = ?`,
      [
        blueprint.titleEn,
        blueprint.descriptionKo,
        blueprint.descriptionEn,
        blueprint.isOfficial,
        createdByUserId,
        rows[0].id,
      ],
    );
    return rows[0].id;
  }

  const [inserted] = await connection.query(
    `INSERT INTO courses (
      title_ko, title_en, description_ko, description_en,
      is_official, created_by_user_id, likes_count,
      deleted_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0, NULL, NOW(), NOW())`,
    [
      blueprint.titleKo,
      blueprint.titleEn,
      blueprint.descriptionKo,
      blueprint.descriptionEn,
      blueprint.isOfficial,
      createdByUserId,
    ],
  );

  return inserted.insertId;
}
```

- [ ] **Step 3: Run syntax check**

Run:

```bash
node --check scripts/seed-mock-data.mjs
```

Expected: no syntax errors.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-mock-data.mjs
git commit -m "feat: seed realistic course owners"
```

---

### Task 5: Sync Course Items Without Breaking Checkins

**Files:**
- Modify: `scripts/seed-mock-data.mjs`

- [ ] **Step 1: Replace `seedCourseItems()`**

Replace the existing `seedCourseItems(courseId, courseIndex, artworkIds)` function with:

```js
async function syncCourseItems(courseId, artworkIds) {
  const [existingRows] = await connection.query(
    `SELECT ci.id, ci.artwork_id, ci.seq,
            COUNT(cc.id) AS checkin_count
     FROM course_items ci
     LEFT JOIN course_checkins cc ON cc.course_item_id = ci.id
     WHERE ci.course_id = ?
     GROUP BY ci.id, ci.artwork_id, ci.seq
     ORDER BY ci.seq ASC, ci.id ASC`,
    [courseId],
  );

  const existingByArtworkId = new Map(existingRows.map((row) => [row.artwork_id, row]));
  const desiredRows = [];

  for (const artworkId of artworkIds) {
    const existing = existingByArtworkId.get(artworkId);
    if (existing) {
      desiredRows.push(existing);
      continue;
    }

    const [inserted] = await connection.query(
      `INSERT INTO course_items (course_id, seq, artwork_id, created_at)
       VALUES (?, ?, ?, NOW())`,
      [courseId, existingRows.length + desiredRows.length + 1, artworkId],
    );

    desiredRows.push({
      id: inserted.insertId,
      artwork_id: artworkId,
      checkin_count: 0,
    });
  }

  const desiredIds = new Set(desiredRows.map((row) => row.id));
  const retainedExtraRows = existingRows.filter(
    (row) => !desiredIds.has(row.id) && Number(row.checkin_count) > 0,
  );
  const removableRows = existingRows.filter(
    (row) => !desiredIds.has(row.id) && Number(row.checkin_count) === 0,
  );

  for (const row of removableRows) {
    await connection.query(`DELETE FROM course_items WHERE id = ? AND course_id = ?`, [
      row.id,
      courseId,
    ]);
  }

  const finalRows = [...desiredRows, ...retainedExtraRows];
  await connection.query(`UPDATE course_items SET seq = seq + 1000 WHERE course_id = ?`, [
    courseId,
  ]);

  for (let index = 0; index < finalRows.length; index += 1) {
    await connection.query(`UPDATE course_items SET seq = ? WHERE id = ? AND course_id = ?`, [
      index + 1,
      finalRows[index].id,
      courseId,
    ]);
  }
}
```

- [ ] **Step 2: Run syntax check**

Run:

```bash
node --check scripts/seed-mock-data.mjs
```

Expected: no syntax errors.

- [ ] **Step 3: Commit**

```bash
git add scripts/seed-mock-data.mjs
git commit -m "feat: sync mock course items safely"
```

---

### Task 6: Seed Course Likes, Checkins, And Counts

**Files:**
- Modify: `scripts/seed-mock-data.mjs`
- Modify: `scripts/seed-users-realistic.mjs`

- [ ] **Step 1: Add activity helpers to `scripts/seed-mock-data.mjs`**

Add these helpers after `syncCourseItems()`:

```js
async function seedCourseActivity(courseIds, userIds) {
  for (let userIndex = 0; userIndex < userIds.length; userIndex += 1) {
    const userId = userIds[userIndex];
    const likedCourseIds = [
      courseIds[userIndex % courseIds.length],
      courseIds[(userIndex + 1) % courseIds.length],
    ];

    for (const courseId of likedCourseIds) {
      await connection.query(
        `INSERT IGNORE INTO course_likes (user_id, course_id, created_at)
         VALUES (?, ?, NOW())`,
        [userId, courseId],
      );
    }

    const checkinCourseId = courseIds[userIndex % courseIds.length];
    const [items] = await connection.query(
      `SELECT id, course_id
       FROM course_items
       WHERE course_id = ?
       ORDER BY seq ASC
       LIMIT ?`,
      [checkinCourseId, userIndex % 2 === 0 ? 3 : 2],
    );

    for (const item of items) {
      await connection.query(
        `INSERT IGNORE INTO course_checkins (user_id, course_id, course_item_id, created_at)
         VALUES (?, ?, ?, NOW())`,
        [userId, item.course_id, item.id],
      );
    }
  }
}

async function reconcileLikeCounts() {
  await connection.query(
    `UPDATE courses c
     SET likes_count = (
       SELECT COUNT(*)
       FROM course_likes cl
       WHERE cl.course_id = c.id
     )`,
  );

  await connection.query(
    `UPDATE artworks a
     SET likes_count = (
       SELECT COUNT(*)
       FROM artwork_likes al
       WHERE al.artwork_id = a.id
     )`,
  );
}
```

- [ ] **Step 2: Call `reconcileLikeCounts()` in `scripts/seed-users-realistic.mjs`**

Before the final user query in `scripts/seed-users-realistic.mjs`, add:

```js
  await connection.query(
    `UPDATE courses c
     SET likes_count = (
       SELECT COUNT(*)
       FROM course_likes cl
       WHERE cl.course_id = c.id
     )`,
  );

  await connection.query(
    `UPDATE artworks a
     SET likes_count = (
       SELECT COUNT(*)
       FROM artwork_likes al
       WHERE al.artwork_id = a.id
     )`,
  );
```

- [ ] **Step 3: Run syntax checks**

Run:

```bash
node --check scripts/seed-mock-data.mjs
node --check scripts/seed-users-realistic.mjs
```

Expected: both commands print no syntax errors.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-mock-data.mjs scripts/seed-users-realistic.mjs
git commit -m "feat: seed realistic course activity"
```

---

### Task 7: Wire Main Seed Flow

**Files:**
- Modify: `scripts/seed-mock-data.mjs`

- [ ] **Step 1: Replace course creation loop in the main `try` block**

Replace this block:

```js
  const courseIds = [];
  for (let i = 1; i <= TARGET.courses; i += 1) {
    courseIds.push(await findOrCreateCourse(i));
  }

  for (let i = 0; i < courseIds.length; i += 1) {
    await seedCourseItems(courseIds[i], i + 1, artworkIds);
  }
```

With:

```js
  const courseUserIds = await ensureCourseUsers();
  const artworkCatalog = await loadArtworkCatalog();
  const courseIds = [];

  for (const blueprint of COURSE_BLUEPRINTS) {
    const courseId = await findOrCreateCourseFromBlueprint(blueprint, courseUserIds);
    const selectedArtworkIds = selectArtworkIdsForCourse(
      artworkCatalog,
      blueprint,
      artworkIds,
    );

    await syncCourseItems(courseId, selectedArtworkIds);
    courseIds.push(courseId);
  }

  await seedCourseActivity(courseIds, courseUserIds);
  await reconcileLikeCounts();
```

- [ ] **Step 2: Update final summary output**

Replace the current summary object with:

```js
      {
        artists: TARGET.artists,
        artworks: TARGET.artworks,
        courses: COURSE_BLUEPRINTS.length,
        courseUsers: COURSE_USER_SEEDS.length,
        banners: TARGET.banners,
      },
```

- [ ] **Step 3: Run syntax check**

Run:

```bash
node --check scripts/seed-mock-data.mjs
```

Expected: no syntax errors.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-mock-data.mjs
git commit -m "feat: wire realistic course mock seed"
```

---

### Task 8: Document Mock Seed Behavior

**Files:**
- Modify: `docs/admin-backoffice.md`

- [ ] **Step 1: Update mock seed docs**

In the mock seed section, document:

```md
- `pnpm db:seed:mock` creates:
  - mock zones, places, artists, artworks, artwork images, artwork festivals
  - official course blueprints with coherent artwork stops
  - user-created courses with valid `created_by_user_id`
  - course likes and course checkins that satisfy FK relationships
  - reconciled `likes_count` values for courses and artworks
- Run `pnpm db:seed:users` after `pnpm db:seed:mock` only when extra user activity volume is needed.
```

- [ ] **Step 2: Review the docs section**

Run:

```bash
rg -n "db:seed:mock|db:seed:users|course likes|course checkins" docs/admin-backoffice.md
```

Expected: the new mock seed behavior is visible.

- [ ] **Step 3: Commit**

```bash
git add docs/admin-backoffice.md
git commit -m "docs: describe realistic course mock data"
```

---

### Task 9: Verify Against A Database

**Files:**
- No source edits expected

- [ ] **Step 1: Run static checks**

Run:

```bash
node --check scripts/seed-mock-data.mjs
node --check scripts/seed-users-realistic.mjs
```

Expected: no syntax errors.

- [ ] **Step 2: Run mock seed against a non-production database**

Run:

```bash
ALLOW_MOCK_SEED=true pnpm db:seed:mock
```

Expected:

```txt
Mock seed completed successfully.
```

- [ ] **Step 3: Verify course item relationships**

Run this SQL against the same database:

```sql
SELECT course_id, COUNT(*) AS item_count, MIN(seq) AS first_seq, MAX(seq) AS last_seq
FROM course_items
GROUP BY course_id
HAVING item_count <> last_seq OR first_seq <> 1;
```

Expected: zero rows.

- [ ] **Step 4: Verify checkins reference matching course items**

Run:

```sql
SELECT cc.id
FROM course_checkins cc
INNER JOIN course_items ci ON ci.id = cc.course_item_id
WHERE cc.course_id <> ci.course_id;
```

Expected: zero rows.

- [ ] **Step 5: Verify course like counts**

Run:

```sql
SELECT c.id, c.likes_count, COUNT(cl.course_id) AS actual_likes
FROM courses c
LEFT JOIN course_likes cl ON cl.course_id = c.id
GROUP BY c.id, c.likes_count
HAVING c.likes_count <> actual_likes;
```

Expected: zero rows.

- [ ] **Step 6: Verify official/user-created split**

Run:

```sql
SELECT id, title_ko, is_official, created_by_user_id
FROM courses
WHERE title_ko LIKE '[MOCK]%'
  AND (
    (is_official = 1 AND created_by_user_id IS NOT NULL)
    OR (is_official = 0 AND created_by_user_id IS NULL)
  );
```

Expected: zero rows.

- [ ] **Step 7: Commit verification-only docs if any command notes are added**

If no files changed during verification, do not create a commit.

---

### Task 10: Write PR From Repository Template

**Files:**
- Read: `.github/pull_request_template.md`
- Create: `docs/pr-assets/course-realistic-mock-data-pr.md`

- [ ] **Step 1: Write the PR body using the repository template**

Create `docs/pr-assets/course-realistic-mock-data-pr.md` with:

```md
## 요약
- course 도메인 mock seed를 실제 데이터 관계에 맞게 재구성했습니다.

## 변경내용
- 공식 코스와 사용자 생성 코스를 blueprint 기반으로 생성합니다.
- course item은 zone/category 기반으로 가까운 artwork를 선택하고, seq를 연속 값으로 동기화합니다.
- course likes/checkins를 FK 관계에 맞게 생성하고 likes_count를 실제 like row 기준으로 보정합니다.
- mock seed 동작과 seed-data invariant를 문서화했습니다.

## 검증
- `node --check scripts/seed-mock-data.mjs`
- `node --check scripts/seed-users-realistic.mjs`
- `ALLOW_MOCK_SEED=true pnpm db:seed:mock`
- course item seq 검증 SQL: zero rows
- course_checkins/course_items course_id mismatch 검증 SQL: zero rows
- courses.likes_count 검증 SQL: zero rows
- official/user-created course split 검증 SQL: zero rows

## 스크린샷
- 해당 없음: DB seed/script 변경
```

- [ ] **Step 2: Commit PR body**

```bash
git add docs/pr-assets/course-realistic-mock-data-pr.md
git commit -m "docs: write course mock data pr"
```
