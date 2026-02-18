import mysql from "mysql2/promise";

const DEFAULT_MEDIA_BASE_URL = "https://example.com/steelart/mock";

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

function buildDefaultProfileImageUrl() {
  const base = (process.env.MOCK_MEDIA_BASE_URL || DEFAULT_MEDIA_BASE_URL).replace(
    /\/+$/,
    "",
  );
  return `${base}/artists/profile-default.jpg`;
}

if (process.env.NODE_ENV === "production") {
  throw new Error("Artist profile backfill is blocked in production environment.");
}

if (!boolEnv("ALLOW_MOCK_SEED", false)) {
  throw new Error("Set ALLOW_MOCK_SEED=true to run artist profile backfill.");
}

const connection = await mysql.createConnection({
  host: requireEnv("DB_HOST"),
  port: Number(requireEnv("DB_PORT")),
  user: requireEnv("DB_USER"),
  password: requireEnv("DB_PASSWORD"),
  database: requireEnv("DB_NAME"),
});

try {
  const defaultProfileImageUrl = buildDefaultProfileImageUrl();

  const [updateResult] = await connection.query(
    `UPDATE artists
     SET profile_image_url = ?, updated_at = NOW()
     WHERE profile_image_url IS NULL OR TRIM(profile_image_url) = ''`,
    [defaultProfileImageUrl],
  );

  const [remainingRows] = await connection.query(
    `SELECT COUNT(*) AS total
     FROM artists
     WHERE profile_image_url IS NULL OR TRIM(profile_image_url) = ''`,
  );

  console.log("Artist profile image backfill completed.");
  console.log(`default_url=${defaultProfileImageUrl}`);
  console.log(`updated_rows=${updateResult.affectedRows ?? 0}`);
  console.log(`remaining_empty_rows=${remainingRows[0]?.total ?? 0}`);
} finally {
  await connection.end();
}
