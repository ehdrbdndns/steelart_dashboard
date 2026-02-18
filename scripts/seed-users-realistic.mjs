import mysql from "mysql2/promise";

const USER_SEEDS = [
  { nickname: "포항산책러_민지", residency: "POHANG", age_group: "20S", language: "ko", notifications_enabled: 1 },
  { nickname: "영일대러버", residency: "POHANG", age_group: "30S", language: "ko", notifications_enabled: 1 },
  { nickname: "steel_walk_jay", residency: "NON_POHANG", age_group: "30S", language: "en", notifications_enabled: 1 },
  { nickname: "주말코스탐험가", residency: "NON_POHANG", age_group: "40S", language: "ko", notifications_enabled: 0 },
  { nickname: "바다보는예진", residency: "POHANG", age_group: "20S", language: "ko", notifications_enabled: 1 },
  { nickname: "포항첫여행", residency: "NON_POHANG", age_group: "20S", language: "ko", notifications_enabled: 1 },
  { nickname: "night_gallery_ian", residency: "NON_POHANG", age_group: "50S", language: "en", notifications_enabled: 0 },
  { nickname: "철길따라소희", residency: "POHANG", age_group: "30S", language: "ko", notifications_enabled: 1 },
  { nickname: "sunset_choi", residency: "POHANG", age_group: "40S", language: "en", notifications_enabled: 1 },
  { nickname: "아트투어_대니", residency: "NON_POHANG", age_group: "60S", language: "ko", notifications_enabled: 0 },
  { nickname: "포항사는지후", residency: "POHANG", age_group: "TEEN", language: "ko", notifications_enabled: 1 },
  { nickname: "weekend_maria", residency: "NON_POHANG", age_group: "70_PLUS", language: "en", notifications_enabled: 1 },
];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }

  return value;
}

function boolEnv(name, defaultValue = false) {
  const value = process.env[name];
  if (!value) return defaultValue;
  return value === "true" || value === "1";
}

if (process.env.NODE_ENV === "production") {
  throw new Error("Realistic user seed is blocked in production environment.");
}

if (!boolEnv("ALLOW_MOCK_SEED", false)) {
  throw new Error("Set ALLOW_MOCK_SEED=true to run realistic user seed.");
}

const connection = await mysql.createConnection({
  host: requireEnv("DB_HOST"),
  port: Number(requireEnv("DB_PORT")),
  user: requireEnv("DB_USER"),
  password: requireEnv("DB_PASSWORD"),
  database: requireEnv("DB_NAME"),
});

function pick(arr, index) {
  return arr[index % arr.length];
}

try {
  const [courseRows] = await connection.query(
    `SELECT id FROM courses WHERE deleted_at IS NULL ORDER BY id ASC`,
  );
  const [artworkRows] = await connection.query(
    `SELECT id FROM artworks WHERE deleted_at IS NULL ORDER BY id ASC`,
  );

  if (courseRows.length === 0 || artworkRows.length === 0) {
    throw new Error("Need active courses and artworks before seeding users.");
  }

  const courseIds = courseRows.map((row) => row.id);
  const artworkIds = artworkRows.map((row) => row.id);

  // 기존 E2E 이름은 사람이 읽기 쉬운 닉네임으로 치환
  await connection.query(
    `UPDATE users
     SET nickname = '포항아트_첫사용자'
     WHERE nickname = '[E2E_USER] activity-user'`,
  );

  const userIds = [];
  for (const seed of USER_SEEDS) {
    const [existingRows] = await connection.query(
      `SELECT id FROM users WHERE nickname = ? LIMIT 1`,
      [seed.nickname],
    );

    let userId = existingRows[0]?.id;
    if (!userId) {
      const [inserted] = await connection.query(
        `INSERT INTO users (nickname, residency, age_group, language, notifications_enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          seed.nickname,
          seed.residency,
          seed.age_group,
          seed.language,
          seed.notifications_enabled,
        ],
      );
      userId = inserted.insertId;
    } else {
      await connection.query(
        `UPDATE users
         SET residency = ?, age_group = ?, language = ?, notifications_enabled = ?, updated_at = NOW()
         WHERE id = ?`,
        [
          seed.residency,
          seed.age_group,
          seed.language,
          seed.notifications_enabled,
          userId,
        ],
      );
    }

    userIds.push(userId);
  }

  // 사용자별 created course 생성/연결
  for (let i = 0; i < userIds.length; i += 1) {
    const userId = userIds[i];
    const nickname = USER_SEEDS[i].nickname;
    const titleKo = `${nickname}의 추천 코스`;
    const titleEn = `${nickname} course`;

    const [courseByTitle] = await connection.query(
      `SELECT id FROM courses WHERE title_ko = ? LIMIT 1`,
      [titleKo],
    );

    let createdCourseId = courseByTitle[0]?.id;
    if (!createdCourseId) {
      const [inserted] = await connection.query(
        `INSERT INTO courses (
            title_ko, title_en, description_ko, description_en,
            is_official, created_by_user_id, likes_count, deleted_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 0, ?, 0, NULL, NOW(), NOW())`,
        [
          titleKo,
          titleEn,
          `${nickname}가 자주 걷는 추천 동선`,
          `Recommended course by ${nickname}`,
          userId,
        ],
      );
      createdCourseId = inserted.insertId;
    } else {
      await connection.query(
        `UPDATE courses
         SET created_by_user_id = ?, deleted_at = NULL, updated_at = NOW()
         WHERE id = ?`,
        [userId, createdCourseId],
      );
    }

    const [existingItems] = await connection.query(
      `SELECT id FROM course_items WHERE course_id = ? LIMIT 1`,
      [createdCourseId],
    );

    if (existingItems.length === 0) {
      const artworkBaseIndex = i * 3;
      for (let seq = 1; seq <= 3; seq += 1) {
        const artworkId = pick(artworkIds, artworkBaseIndex + seq);
        await connection.query(
          `INSERT INTO course_items (course_id, seq, artwork_id, created_at)
           VALUES (?, ?, ?, NOW())`,
          [createdCourseId, seq, artworkId],
        );
      }
    }
  }

  // 좋아요/선택코스/스탬프 데이터 생성
  for (let i = 0; i < userIds.length; i += 1) {
    const userId = userIds[i];
    const selectedCourseId = pick(courseIds, i);
    const likedCourseIds = [pick(courseIds, i + 1), pick(courseIds, i + 2)];
    const likedArtworkIds = [
      pick(artworkIds, i),
      pick(artworkIds, i + 1),
      pick(artworkIds, i + 2),
    ];

    await connection.query(
      `INSERT INTO user_selected_courses (user_id, course_id, created_at)
       VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE course_id = VALUES(course_id), created_at = VALUES(created_at)`,
      [userId, selectedCourseId],
    );

    for (const courseId of likedCourseIds) {
      await connection.query(
        `INSERT IGNORE INTO course_likes (user_id, course_id, created_at)
         VALUES (?, ?, NOW())`,
        [userId, courseId],
      );
    }

    for (const artworkId of likedArtworkIds) {
      await connection.query(
        `INSERT IGNORE INTO artwork_likes (user_id, artwork_id, created_at)
         VALUES (?, ?, NOW())`,
        [userId, artworkId],
      );
    }

    const [itemRows] = await connection.query(
      `SELECT id AS course_item_id, course_id
       FROM course_items
       WHERE course_id = ?
       ORDER BY seq ASC
       LIMIT 2`,
      [selectedCourseId],
    );

    for (const item of itemRows) {
      await connection.query(
        `INSERT IGNORE INTO course_checkins (user_id, course_id, course_item_id, created_at)
         VALUES (?, ?, ?, NOW())`,
        [userId, item.course_id, item.course_item_id],
      );
    }
  }

  const [rows] = await connection.query(
    `SELECT id, nickname, residency, age_group, language
     FROM users
     ORDER BY id ASC`,
  );

  console.log("Realistic user seed completed.");
  console.log(rows);
} finally {
  await connection.end();
}
