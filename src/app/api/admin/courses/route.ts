import type { NextRequest } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { handleRouteError, ok } from "@/lib/server/api-response";
import { query } from "@/lib/server/db";
import { makePaginationMeta, parsePagination } from "@/lib/server/pagination";
import { buildDeletedAtClause, extractString } from "@/lib/server/sql";
import {
  coursePayloadSchema,
  coursesQuerySchema,
  parseBooleanString,
} from "@/lib/server/validators/admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const search = coursesQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );

    const pagination = parsePagination(request.nextUrl.searchParams);
    const where: string[] = ["WHERE 1=1"];
    const params: unknown[] = [];

    const keyword = extractString(search.query);
    if (keyword) {
      where.push("AND (title_ko LIKE ? OR title_en LIKE ?)");
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    const isOfficial = parseBooleanString(search.isOfficial);
    if (typeof isOfficial === "boolean") {
      where.push("AND is_official = ?");
      params.push(isOfficial ? 1 : 0);
    }

    const deletedClause = buildDeletedAtClause(search.deleted ?? "exclude");
    where.push(deletedClause.clause);

    const countRows = await query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) AS total FROM courses ${where.join(" ")}`,
      params,
    );

    const total = countRows[0]?.total ?? 0;

    const rows = await query<RowDataPacket[]>(
      `SELECT id, title_ko, title_en, description_ko, description_en,
              is_official, created_by_user_id, likes_count, deleted_at,
              created_at, updated_at
       FROM courses
       ${where.join(" ")}
       ORDER BY updated_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pagination.size, pagination.offset],
    );

    return ok(rows, makePaginationMeta(total, pagination.page, pagination.size));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = coursePayloadSchema.parse(await request.json());

    const inserted = await query<ResultSetHeader>(
      `INSERT INTO courses (
          title_ko, title_en, description_ko, description_en,
          is_official, created_by_user_id, likes_count,
          deleted_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, NULL, 0, NULL, NOW(), NOW())`,
      [
        payload.title_ko,
        payload.title_en,
        payload.description_ko,
        payload.description_en,
        payload.is_official ? 1 : 0,
      ],
    );

    const rows = await query<RowDataPacket[]>(`SELECT * FROM courses WHERE id = ?`, [
      inserted.insertId,
    ]);

    return ok(rows[0]);
  } catch (error) {
    return handleRouteError(error);
  }
}
