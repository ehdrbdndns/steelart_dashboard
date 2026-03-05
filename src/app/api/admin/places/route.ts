import type { NextRequest } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { handleRouteError, ok } from "@/lib/server/api-response";
import { query } from "@/lib/server/db";
import { makePaginationMeta, parsePagination } from "@/lib/server/pagination";
import { buildDeletedAtClause, extractString } from "@/lib/server/sql";
import {
  placeCreatePayloadSchema,
  placesQuerySchema,
} from "@/lib/server/validators/admin";

export const dynamic = "force-dynamic";

type PlaceRow = RowDataPacket & {
  id: number;
  zone_id: number | null;
  zone_name_ko: string | null;
  name_ko: string;
  name_en: string;
  address: string | null;
  lat: number;
  lng: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const search = placesQuerySchema.parse(
      Object.fromEntries(searchParams.entries()),
    );
    const queryText = extractString(search.query);
    const paginationRequested =
      search.page !== undefined || search.size !== undefined;
    const pagination = parsePagination(searchParams);

    const where: string[] = ["WHERE 1=1"];
    const params: unknown[] = [];

    if (queryText) {
      where.push("AND (p.name_ko LIKE ? OR p.name_en LIKE ?)");
      params.push(`%${queryText}%`, `%${queryText}%`);
    }

    if (search.zoneId) {
      where.push("AND p.zone_id = ?");
      params.push(search.zoneId);
    }

    const deletedClause = buildDeletedAtClause(search.deleted ?? "exclude", "p.deleted_at");
    where.push(deletedClause.clause);

    if (!paginationRequested) {
      const rows = await query<PlaceRow[]>(
        `SELECT p.id, p.zone_id, z.name_ko AS zone_name_ko, p.name_ko, p.name_en, p.address,
                CAST(p.lat AS DOUBLE) AS lat, CAST(p.lng AS DOUBLE) AS lng,
                p.deleted_at, p.created_at, p.updated_at
         FROM places p
         LEFT JOIN zones z ON z.id = p.zone_id
         ${where.join(" ")}
         ORDER BY p.name_ko ASC`,
        params,
      );

      return ok(rows);
    }

    const countRows = await query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) AS total
       FROM places p
       ${where.join(" ")}`,
      params,
    );
    const total = countRows[0]?.total ?? 0;

    const rows = await query<PlaceRow[]>(
      `SELECT p.id, p.zone_id, z.name_ko AS zone_name_ko, p.name_ko, p.name_en, p.address,
              CAST(p.lat AS DOUBLE) AS lat, CAST(p.lng AS DOUBLE) AS lng,
              p.deleted_at, p.created_at, p.updated_at
       FROM places p
       LEFT JOIN zones z ON z.id = p.zone_id
       ${where.join(" ")}
       ORDER BY p.name_ko ASC
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
    const payload = placeCreatePayloadSchema.parse(await request.json());

    const inserted = await query<ResultSetHeader>(
      `INSERT INTO places (
         name_ko, name_en, address, lat, lng, zone_id, deleted_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, NULL, NOW(), NOW())`,
      [
        payload.name_ko,
        payload.name_en,
        payload.address,
        payload.lat,
        payload.lng,
        payload.zone_id ?? null,
      ],
    );

    const rows = await query<PlaceRow[]>(
      `SELECT p.id, p.zone_id, z.name_ko AS zone_name_ko, p.name_ko, p.name_en, p.address,
              CAST(p.lat AS DOUBLE) AS lat, CAST(p.lng AS DOUBLE) AS lng,
              p.deleted_at, p.created_at, p.updated_at
       FROM places p
       LEFT JOIN zones z ON z.id = p.zone_id
       WHERE p.id = ?`,
      [inserted.insertId],
    );

    return ok(rows[0]);
  } catch (error) {
    return handleRouteError(error);
  }
}
