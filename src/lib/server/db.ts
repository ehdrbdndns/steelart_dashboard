import mysql from "mysql2/promise";
import type { QueryResult } from "mysql2";
import { getCoreEnv } from "@/lib/server/env";

declare global {
  // eslint-disable-next-line no-var
  var __steelartPool: mysql.Pool | undefined;
}

const LOCAL_DB_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const SSL_ENABLED_VALUES = new Set(["1", "true", "yes", "required"]);
const SSL_DISABLED_VALUES = new Set(["0", "false", "no", "disabled"]);

function resolveSslOption(host: string) {
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

export function getDbPool() {
  if (!global.__steelartPool) {
    const env = getCoreEnv();
    const ssl = resolveSslOption(env.DB_HOST);

    global.__steelartPool = mysql.createPool({
      host: env.DB_HOST,
      port: env.DB_PORT,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: false,
      ...(ssl ? { ssl } : {}),
    });
  }

  return global.__steelartPool;
}

export async function query<T extends QueryResult>(
  sql: string,
  params: unknown[] = [],
) {
  const [rows] = await getDbPool().query<T>(sql, params);
  return rows;
}
