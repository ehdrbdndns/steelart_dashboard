import mysql from "mysql2/promise";

const LOCAL_DB_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const SSL_ENABLED_VALUES = new Set(["1", "true", "yes", "required"]);
const SSL_DISABLED_VALUES = new Set(["0", "false", "no", "disabled"]);

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }

  return value;
}

export function boolEnv(name, defaultValue = false) {
  const value = process.env[name];
  if (!value) return defaultValue;
  return value === "true" || value === "1";
}

function resolveSslOption(host) {
  const sslSetting = (process.env.DB_SSL ?? "auto").trim().toLowerCase();

  if (SSL_ENABLED_VALUES.has(sslSetting)) {
    return { rejectUnauthorized: false };
  }

  if (SSL_DISABLED_VALUES.has(sslSetting)) {
    return undefined;
  }

  return LOCAL_DB_HOSTS.has(host.trim().toLowerCase())
    ? undefined
    : { rejectUnauthorized: false };
}

export function getDbConnectionConfig() {
  const host = requireEnv("DB_HOST");
  const ssl = resolveSslOption(host);

  return {
    host,
    port: Number(requireEnv("DB_PORT")),
    user: requireEnv("DB_USER"),
    password: requireEnv("DB_PASSWORD"),
    database: requireEnv("DB_NAME"),
    ...(ssl ? { ssl } : {}),
  };
}

export async function createDbConnection() {
  return mysql.createConnection(getDbConnectionConfig());
}
