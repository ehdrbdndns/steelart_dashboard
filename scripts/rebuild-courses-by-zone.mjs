import { createDbConnection } from "./lib/db-connection.mjs";

// 코스 관련 데이터를 전부 hard-delete 한 뒤, 권역(zone)별 공식 추천 코스를 자동 생성한다.
// - wipe: course_checkins, course_likes, course_items, courses (+ AUTO_INCREMENT 리셋)
// - rebuild: 지리적 권역마다 공식 코스 1개. "기타(Others)"는 경로가 아니므로 제외.
// - 코스 항목 순서: 권역 작품을 좌표 기반 최근접(greedy nearest-neighbor) 도보 경로로 정렬.
// users 는 보존한다. 결정 근거: 대화 합의(2026-06-21).

const WIPE_TABLES = ["course_checkins", "course_likes", "course_items", "courses"];
const EXCLUDED_ZONE_CODES = new Set(["ZONE_07"]); // 기타 / Others

function parseArgs(argv) {
  const options = { confirm: false };
  for (const arg of argv) if (arg === "--yes" || arg === "--confirm") options.confirm = true;
  return options;
}

async function tableExists(connection, dbName, table) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema=? AND table_name=?`,
    [dbName, table],
  );
  return Number(rows[0]?.cnt ?? 0) > 0;
}

// 권역 작품을 서쪽(min lng) 시작점에서 최근접 이웃으로 정렬한다.
function orderByNearestNeighbor(artworks) {
  const pts = artworks.map((a) => ({ ...a, lat: Number(a.lat), lng: Number(a.lng) }));
  if (pts.length <= 2) return pts;

  let startIndex = 0;
  for (let i = 1; i < pts.length; i += 1) {
    if (pts[i].lng < pts[startIndex].lng) startIndex = i;
  }

  const distance = (a, b) => {
    const dLat = a.lat - b.lat;
    const dLng = (a.lng - b.lng) * Math.cos((a.lat * Math.PI) / 180);
    return dLat * dLat + dLng * dLng;
  };

  const used = new Array(pts.length).fill(false);
  const order = [startIndex];
  used[startIndex] = true;

  for (let step = 1; step < pts.length; step += 1) {
    const current = pts[order[order.length - 1]];
    let best = -1;
    let bestDistance = Infinity;
    for (let j = 0; j < pts.length; j += 1) {
      if (used[j]) continue;
      const d = distance(current, pts[j]);
      if (d < bestDistance) {
        bestDistance = d;
        best = j;
      }
    }
    order.push(best);
    used[best] = true;
  }

  return order.map((i) => pts[i]);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.confirm) {
    throw new Error("Refusing to run without confirmation. Re-run with --yes.");
  }

  const dbName = process.env.DB_NAME;
  const connection = await createDbConnection();

  try {
    // 1) 코스 관련 데이터 wipe
    const targets = [];
    for (const table of WIPE_TABLES) {
      if (await tableExists(connection, dbName, table)) targets.push(table);
    }

    await connection.beginTransaction();
    try {
      await connection.query("SET FOREIGN_KEY_CHECKS = 0");
      const deleted = {};
      for (const table of targets) {
        const [result] = await connection.query(`DELETE FROM \`${table}\``);
        deleted[table] = result.affectedRows ?? 0;
      }
      await connection.query("SET FOREIGN_KEY_CHECKS = 1");
      await connection.commit();
      for (const table of targets) {
        await connection.query(`ALTER TABLE \`${table}\` AUTO_INCREMENT = 1`);
      }
      console.log("=== wiped ===");
      for (const table of targets) console.log(`${table}=${deleted[table]}`);
    } catch (error) {
      await connection.rollback();
      await connection.query("SET FOREIGN_KEY_CHECKS = 1").catch(() => {});
      throw error;
    }

    // 2) 권역별 공식 코스 재구성
    const [zones] = await connection.query(
      `SELECT id, code, name_ko, name_en FROM zones ORDER BY sort_order`,
    );

    console.log("\n=== rebuild ===");
    let createdCourses = 0;
    let createdItems = 0;

    for (const zone of zones) {
      if (EXCLUDED_ZONE_CODES.has(zone.code)) {
        console.log(`skip zone (excluded): ${zone.name_ko}`);
        continue;
      }

      const [artworks] = await connection.query(
        `SELECT a.id, p.lat, p.lng
           FROM artworks a
           JOIN places p ON p.id = a.place_id AND p.deleted_at IS NULL
          WHERE p.zone_id = ? AND a.deleted_at IS NULL`,
        [zone.id],
      );

      if (artworks.length === 0) {
        console.log(`skip zone (no artworks): ${zone.name_ko}`);
        continue;
      }

      const ordered = orderByNearestNeighbor(artworks);

      const titleKo = `${zone.name_ko} 스틸아트 코스`;
      const titleEn = `${zone.name_en} Steel Art Course`;
      const descKo = `${zone.name_ko} 일대의 스틸아트 작품을 둘러보는 공식 추천 코스입니다.`;
      const descEn = `An official recommended course around steel art works in ${zone.name_en}.`;

      await connection.beginTransaction();
      try {
        const [courseResult] = await connection.execute(
          `INSERT INTO courses (title_ko, title_en, description_ko, description_en, is_official, created_by_user_id, likes_count)
           VALUES (?, ?, ?, ?, 1, NULL, 0)`,
          [titleKo, titleEn, descKo, descEn],
        );
        const courseId = courseResult.insertId;

        let seq = 1;
        for (const artwork of ordered) {
          await connection.execute(
            `INSERT INTO course_items (course_id, seq, artwork_id) VALUES (?, ?, ?)`,
            [courseId, seq, artwork.id],
          );
          seq += 1;
          createdItems += 1;
        }

        await connection.commit();
        createdCourses += 1;
        console.log(`course #${courseId} "${titleKo}" items=${ordered.length}`);
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }

    console.log(`\nDone. courses=${createdCourses} items=${createdItems}`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
