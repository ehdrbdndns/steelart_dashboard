import type { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { handleRouteError, ok } from "@/lib/server/api-response";
import { query } from "@/lib/server/db";
import { makePaginationMeta, parsePagination } from "@/lib/server/pagination";
import { extractString } from "@/lib/server/sql";
import { usersQuerySchema } from "@/lib/server/validators/admin";

export const dynamic = "force-dynamic";

type UserListRow = RowDataPacket & {
  id: number;
  nickname: string;
  residency: "POHANG" | "NON_POHANG";
  age_group: "TEEN" | "20S" | "30S" | "40S" | "50S" | "60S" | "70_PLUS";
  language: "ko" | "en";
  notifications_enabled: number;
  created_at: string;
  updated_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const search = usersQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );

    const pagination = parsePagination(request.nextUrl.searchParams);
    const where: string[] = ["WHERE 1=1"];
    const params: unknown[] = [];

    const keyword = extractString(search.query);
    if (keyword) {
      where.push("AND u.nickname LIKE ?");
      params.push(`%${keyword}%`);
    }

    if (search.residency) {
      where.push("AND u.residency = ?");
      params.push(search.residency);
    }

    if (search.ageGroup) {
      where.push("AND u.age_group = ?");
      params.push(search.ageGroup);
    }

    if (search.language) {
      where.push("AND u.language = ?");
      params.push(search.language);
    }

    const countRows = await query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) AS total
       FROM users u
       ${where.join(" ")}`,
      params,
    );

    const total = Number(countRows[0]?.total ?? 0);

    const rows = await query<UserListRow[]>(
      `SELECT u.id, u.nickname, u.residency, u.age_group, u.language,
              u.notifications_enabled, u.created_at, u.updated_at
       FROM users u
       ${where.join(" ")}
       ORDER BY u.created_at DESC, u.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pagination.size, pagination.offset],
    );

    return ok(rows, makePaginationMeta(total, pagination.page, pagination.size));
  } catch (error) {
    return handleRouteError(error);
  }
}
