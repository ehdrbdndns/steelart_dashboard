import type { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { ok, handleRouteError } from "@/lib/server/api-response";
import { query } from "@/lib/server/db";
import { makePaginationMeta, parsePagination } from "@/lib/server/pagination";
import { buildDeletedAtClause, extractString } from "@/lib/server/sql";
import { artistPayloadSchema, artistsQuerySchema } from "@/lib/server/validators/admin";

export const dynamic = "force-dynamic";

type ArtistRow = RowDataPacket & {
  id: number;
  name_ko: string;
  name_en: string;
  type: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const search = artistsQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );

    const pagination = parsePagination(request.nextUrl.searchParams);
    const where: string[] = ["WHERE 1=1"];
    const params: unknown[] = [];

    const keyword = extractString(search.query);
    if (keyword) {
      where.push("AND (name_ko LIKE ? OR name_en LIKE ?)");
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    const type = extractString(search.type);
    if (type) {
      where.push("AND type = ?");
      params.push(type);
    }

    const deletedClause = buildDeletedAtClause(search.deleted ?? "exclude");
    where.push(deletedClause.clause);

    const countRows = await query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) AS total FROM artists ${where.join(" ")}`,
      params,
    );

    const total = countRows[0]?.total ?? 0;

    const rows = await query<ArtistRow[]>(
      `SELECT id, name_ko, name_en, type, deleted_at, created_at, updated_at
       FROM artists
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
    const payload = artistPayloadSchema.parse(await request.json());

    const result = await query<{ insertId: number } & RowDataPacket[]>(
      `INSERT INTO artists (name_ko, name_en, type, deleted_at, created_at, updated_at)
       VALUES (?, ?, ?, NULL, NOW(), NOW())`,
      [payload.name_ko, payload.name_en, payload.type],
    );

    const rows = await query<ArtistRow[]>(
      `SELECT id, name_ko, name_en, type, deleted_at, created_at, updated_at
       FROM artists
       WHERE id = ?`,
      [result.insertId],
    );

    return ok(rows[0]);
  } catch (error) {
    return handleRouteError(error);
  }
}
