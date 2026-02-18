import type { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { handleRouteError, ok } from "@/lib/server/api-response";
import { query } from "@/lib/server/db";

export const dynamic = "force-dynamic";

type SummaryRow = RowDataPacket & {
  total_users: number;
  joined_today: number;
  joined_last_7_days: number;
  joined_last_30_days: number;
};

export async function GET(_request: NextRequest) {
  try {
    const rows = await query<SummaryRow[]>(
      `SELECT
          COUNT(*) AS total_users,
          SUM(CASE WHEN created_at >= CURDATE() THEN 1 ELSE 0 END) AS joined_today,
          SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS joined_last_7_days,
          SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS joined_last_30_days
       FROM users`,
    );

    const row = rows[0];

    return ok({
      totalUsers: Number(row?.total_users ?? 0),
      joinedToday: Number(row?.joined_today ?? 0),
      joinedLast7Days: Number(row?.joined_last_7_days ?? 0),
      joinedLast30Days: Number(row?.joined_last_30_days ?? 0),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
