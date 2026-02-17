import fs from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";

const required = ["DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME"];
const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
  throw new Error(`Missing DB env vars: ${missing.join(", ")}`);
}

const tables = [
  "artists",
  "artworks",
  "courses",
  "course_items",
  "course_checkins",
  "home_banners",
  "places",
  "zones",
];

const connection = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

try {
  const lines = [];
  lines.push("-- SteelArt dashboard schema snapshot");
  lines.push(`-- generated_at: ${new Date().toISOString()}`);
  lines.push("");

  for (const table of tables) {
    const [rows] = await connection.query(`SHOW CREATE TABLE ${table}`);
    const row = rows[0];
    if (!row || !row["Create Table"]) {
      throw new Error(`Could not read DDL for table: ${table}`);
    }

    lines.push(`-- TABLE: ${table}`);
    lines.push(`${row["Create Table"]};`);
    lines.push("");
  }

  const outputPath = path.resolve(process.cwd(), "docs/db-schema.sql");
  await fs.writeFile(outputPath, lines.join("\n"), "utf8");
  console.log(`Wrote ${outputPath}`);
} finally {
  await connection.end();
}
