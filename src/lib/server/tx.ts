import type { PoolConnection } from "mysql2/promise";
import { getDbPool } from "@/lib/server/db";

export async function withTransaction<T>(
  callback: (connection: PoolConnection) => Promise<T>,
) {
  const connection = await getDbPool().getConnection();

  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
