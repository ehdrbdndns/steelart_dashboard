import { createDbConnection } from "./lib/db-connection.mjs";

// 20260514 full-replace 재적재 전, 작품 콘텐츠 도메인과 이를 FK로 참조하는
// 테스트 데이터를 hard-delete 하고 AUTO_INCREMENT 를 1로 리셋한다.
// courses / users / home_banners / course_likes 는 보존한다.
// 결정 근거: docs/adr/0001-steelart-20260514-full-replace-reload.md

// FK 자식 -> 부모 순서. FOREIGN_KEY_CHECKS=0 으로 돌리므로 순서는 안전망 수준이다.
const WIPE_TABLES = [
  "course_checkins", // -> course_items, courses, users (테스트 스탬프)
  "artwork_likes", // -> artworks, users (선택 테이블, 없을 수 있음)
  "course_items", // -> artworks, courses (테스트 코스 구성)
  "artwork_images", // -> artworks
  "artwork_festivals", // -> artworks
  "artworks", // -> artists, places
  "places", // -> zones
  "artists",
  "zones",
];

// DDL 스냅샷에 없어 환경에 따라 부재할 수 있는 테이블.
const OPTIONAL_TABLES = new Set(["artwork_likes"]);

function parseArgs(argv) {
  const options = { confirm: false };
  for (const arg of argv) {
    if (arg === "--yes" || arg === "--confirm") {
      options.confirm = true;
    }
  }
  return options;
}

async function tableExists(connection, dbName, tableName) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS cnt
       FROM information_schema.tables
      WHERE table_schema = ? AND table_name = ?`,
    [dbName, tableName],
  );
  return Number(rows[0]?.cnt ?? 0) > 0;
}

async function countRows(connection, tableName) {
  const [rows] = await connection.query(`SELECT COUNT(*) AS cnt FROM \`${tableName}\``);
  return Number(rows[0]?.cnt ?? 0);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.confirm) {
    throw new Error(
      "Refusing to wipe without confirmation. Re-run with --yes to hard-delete the artwork domain.",
    );
  }

  const dbName = process.env.DB_NAME;
  const connection = await createDbConnection();

  try {
    // 존재하는 대상 테이블만 추린다.
    const targets = [];
    for (const table of WIPE_TABLES) {
      if (OPTIONAL_TABLES.has(table) && !(await tableExists(connection, dbName, table))) {
        console.log(`skip (absent): ${table}`);
        continue;
      }
      targets.push(table);
    }

    console.log("=== before ===");
    const before = {};
    for (const table of targets) {
      before[table] = await countRows(connection, table);
      console.log(`${table}=${before[table]}`);
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

      // AUTO_INCREMENT 리셋은 DDL 이라 트랜잭션 밖에서 수행한다.
      for (const table of targets) {
        await connection.query(`ALTER TABLE \`${table}\` AUTO_INCREMENT = 1`);
      }

      console.log("=== deleted ===");
      for (const table of targets) {
        console.log(`${table}=${deleted[table]}`);
      }
    } catch (error) {
      await connection.rollback();
      await connection.query("SET FOREIGN_KEY_CHECKS = 1").catch(() => {});
      throw error;
    }

    console.log("=== after ===");
    for (const table of targets) {
      console.log(`${table}=${await countRows(connection, table)}`);
    }

    console.log("SteelArt wipe completed.");
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
