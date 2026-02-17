import mysql from "mysql2/promise";

const MOCK_PREFIX = "[MOCK]";
const DEFAULT_MEDIA_BASE_URL = "https://example.com/steelart/mock";

const TARGET = {
  artists: 30,
  artworks: 120,
  courses: 30,
  banners: 20,
  zones: 3,
  places: 20,
};

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

function mediaUrl(seed, fileName) {
  const base = (process.env.MOCK_MEDIA_BASE_URL || DEFAULT_MEDIA_BASE_URL).replace(
    /\/+$/,
    "",
  );
  return `${base}/artworks/${seed}/${fileName}`;
}

function seededRandom(min, max, seed) {
  const x = Math.sin(seed) * 10000;
  const fraction = x - Math.floor(x);
  return Math.floor(fraction * (max - min + 1)) + min;
}

if (process.env.NODE_ENV === "production") {
  throw new Error("Mock seed is blocked in production environment.");
}

if (!boolEnv("ALLOW_MOCK_SEED", false)) {
  throw new Error("Set ALLOW_MOCK_SEED=true to run mock seed.");
}

const connection = await mysql.createConnection({
  host: requireEnv("DB_HOST"),
  port: Number(requireEnv("DB_PORT")),
  user: requireEnv("DB_USER"),
  password: requireEnv("DB_PASSWORD"),
  database: requireEnv("DB_NAME"),
});

async function ensureMockZones() {
  const zoneIds = [];

  for (let i = 1; i <= TARGET.zones; i += 1) {
    const code = `MOCK_ZONE_${i}`;

    const [rows] = await connection.query(
      `SELECT id FROM zones WHERE code = ? LIMIT 1`,
      [code],
    );

    if (rows[0]?.id) {
      zoneIds.push(rows[0].id);
      continue;
    }

    const [inserted] = await connection.query(
      `INSERT INTO zones (code, name_ko, name_en, sort_order)
       VALUES (?, ?, ?, ?)`,
      [code, `${MOCK_PREFIX} Zone ${i}`, `${MOCK_PREFIX} Zone ${i}`, i],
    );

    zoneIds.push(inserted.insertId);
  }

  return zoneIds;
}

async function ensurePlaces() {
  const [existingActivePlaces] = await connection.query(
    `SELECT id FROM places WHERE deleted_at IS NULL ORDER BY id ASC`,
  );

  if (existingActivePlaces.length > 0) {
    return existingActivePlaces.map((row) => row.id);
  }

  const zoneIds = await ensureMockZones();

  for (let i = 1; i <= TARGET.places; i += 1) {
    const nameKo = `${MOCK_PREFIX} Place ${i}`;
    const nameEn = `${MOCK_PREFIX} Place ${i}`;

    const [rows] = await connection.query(
      `SELECT id FROM places WHERE name_ko = ? LIMIT 1`,
      [nameKo],
    );

    if (rows[0]?.id) {
      continue;
    }

    const zoneId = zoneIds[(i - 1) % zoneIds.length];
    const lat = Number((37.4 + i * 0.01).toFixed(7));
    const lng = Number((127.0 + i * 0.01).toFixed(7));

    await connection.query(
      `INSERT INTO places (
        name_ko, name_en, address, lat, lng, zone_id, deleted_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, NOW(), NOW())`,
      [nameKo, nameEn, `${MOCK_PREFIX} Address ${i}`, lat, lng, zoneId],
    );
  }

  const [placeRows] = await connection.query(
    `SELECT id FROM places WHERE deleted_at IS NULL ORDER BY id ASC`,
  );

  return placeRows.map((row) => row.id);
}

async function findOrCreateArtist(index) {
  const nameKo = `${MOCK_PREFIX} Artist ${index}`;
  const nameEn = `${MOCK_PREFIX} Artist ${index}`;
  const type = index % 2 === 0 ? "COMPANY" : "INDIVIDUAL";

  const [rows] = await connection.query(
    `SELECT id FROM artists WHERE name_ko = ? LIMIT 1`,
    [nameKo],
  );

  if (rows[0]?.id) {
    return rows[0].id;
  }

  const [inserted] = await connection.query(
    `INSERT INTO artists (name_ko, name_en, type, deleted_at, created_at, updated_at)
     VALUES (?, ?, ?, NULL, NOW(), NOW())`,
    [nameKo, nameEn, type],
  );

  return inserted.insertId;
}

async function findOrCreateArtwork(index, artistIds, placeIds) {
  const titleKo = `${MOCK_PREFIX} Artwork ${index}`;
  const titleEn = `${MOCK_PREFIX} Artwork ${index}`;

  const [rows] = await connection.query(
    `SELECT id FROM artworks WHERE title_ko = ? LIMIT 1`,
    [titleKo],
  );

  if (rows[0]?.id) {
    return rows[0].id;
  }

  const artistId = artistIds[(index - 1) % artistIds.length];
  const placeId = placeIds[(index - 1) % placeIds.length];
  const category = index % 2 === 0 ? "STEEL_ART" : "PUBLIC_ART";
  const year = 1990 + ((index - 1) % 35);
  const seed = `mock-${index}`;

  const [inserted] = await connection.query(
    `INSERT INTO artworks (
      title_ko, title_en, artist_id, place_id, category, production_year,
      size_text_ko, size_text_en, description_ko, description_en,
      photo_day_url, photo_night_url, audio_url_ko, audio_url_en,
      likes_count, deleted_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NOW(), NOW())`,
    [
      titleKo,
      titleEn,
      artistId,
      placeId,
      category,
      year,
      `${index}x${index}cm`,
      `${index}x${index}cm`,
      `${MOCK_PREFIX} description ko ${index}`,
      `${MOCK_PREFIX} description en ${index}`,
      mediaUrl(seed, "photo-day.jpg"),
      mediaUrl(seed, "photo-night.jpg"),
      mediaUrl(seed, "audio-ko.mp3"),
      mediaUrl(seed, "audio-en.mp3"),
    ],
  );

  return inserted.insertId;
}

async function findOrCreateCourse(index) {
  const titleKo = `${MOCK_PREFIX} Course ${index}`;
  const titleEn = `${MOCK_PREFIX} Course ${index}`;

  const [rows] = await connection.query(
    `SELECT id FROM courses WHERE title_ko = ? LIMIT 1`,
    [titleKo],
  );

  if (rows[0]?.id) {
    return rows[0].id;
  }

  const [inserted] = await connection.query(
    `INSERT INTO courses (
      title_ko, title_en, description_ko, description_en,
      is_official, created_by_user_id, likes_count,
      deleted_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, NULL, 0, NULL, NOW(), NOW())`,
    [
      titleKo,
      titleEn,
      `${MOCK_PREFIX} course ko ${index}`,
      `${MOCK_PREFIX} course en ${index}`,
      index % 2 === 0 ? 1 : 0,
    ],
  );

  return inserted.insertId;
}

async function seedCourseItems(courseId, courseIndex, artworkIds) {
  const targetCount = seededRandom(5, 8, courseIndex);

  const [existingRows] = await connection.query(
    `SELECT id, artwork_id, seq
     FROM course_items
     WHERE course_id = ?
     ORDER BY seq ASC`,
    [courseId],
  );

  const existingArtworkIds = new Set(existingRows.map((row) => row.artwork_id));
  let nextSeq = (existingRows.at(-1)?.seq || 0) + 1;

  let offset = 0;
  while (existingArtworkIds.size < targetCount && offset < artworkIds.length * 2) {
    const artworkId = artworkIds[(courseIndex * 7 + offset) % artworkIds.length];

    if (!existingArtworkIds.has(artworkId)) {
      await connection.query(
        `INSERT INTO course_items (course_id, seq, artwork_id, created_at)
         VALUES (?, ?, ?, NOW())`,
        [courseId, nextSeq, artworkId],
      );
      existingArtworkIds.add(artworkId);
      nextSeq += 1;
    }

    offset += 1;
  }
}

async function seedHomeBanners(mockArtworkIds) {
  for (const artworkId of mockArtworkIds) {
    const [existingRows] = await connection.query(
      `SELECT id FROM home_banners WHERE artwork_id = ? LIMIT 1`,
      [artworkId],
    );

    if (existingRows[0]?.id) {
      continue;
    }

    const [orderRows] = await connection.query(
      `SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM home_banners`,
    );

    const nextOrder = orderRows[0]?.next_order || 1;

    await connection.query(
      `INSERT INTO home_banners (artwork_id, display_order, is_active, created_at, updated_at)
       VALUES (?, ?, 1, NOW(), NOW())`,
      [artworkId, nextOrder],
    );
  }

  const [rows] = await connection.query(
    `SELECT id FROM home_banners ORDER BY display_order ASC, id ASC`,
  );

  await connection.query(`UPDATE home_banners SET display_order = display_order + 1000`);

  for (let index = 0; index < rows.length; index += 1) {
    await connection.query(
      `UPDATE home_banners SET display_order = ?, updated_at = NOW() WHERE id = ?`,
      [index + 1, rows[index].id],
    );
  }
}

try {
  const placeIds = await ensurePlaces();

  const artistIds = [];
  for (let i = 1; i <= TARGET.artists; i += 1) {
    artistIds.push(await findOrCreateArtist(i));
  }

  const artworkIds = [];
  for (let i = 1; i <= TARGET.artworks; i += 1) {
    artworkIds.push(await findOrCreateArtwork(i, artistIds, placeIds));
  }

  const courseIds = [];
  for (let i = 1; i <= TARGET.courses; i += 1) {
    courseIds.push(await findOrCreateCourse(i));
  }

  for (let i = 0; i < courseIds.length; i += 1) {
    await seedCourseItems(courseIds[i], i + 1, artworkIds);
  }

  await seedHomeBanners(artworkIds.slice(0, TARGET.banners));

  console.log("Mock seed completed successfully.");
  console.log(
    JSON.stringify(
      {
        artists: TARGET.artists,
        artworks: TARGET.artworks,
        courses: TARGET.courses,
        banners: TARGET.banners,
      },
      null,
      2,
    ),
  );
} finally {
  await connection.end();
}
