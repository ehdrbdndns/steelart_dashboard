import mysql from "mysql2/promise";
import type { QueryResult } from "mysql2";
import { getCoreEnv } from "@/lib/server/env";

declare global {
  // eslint-disable-next-line no-var
  var __steelartPool: mysql.Pool | undefined;
}

export function getDbPool() {
  if (!global.__steelartPool) {
    const env = getCoreEnv();

    global.__steelartPool = mysql.createPool({
      host: env.DB_HOST,
      port: env.DB_PORT,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: false,
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
