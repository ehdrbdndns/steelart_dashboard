import type { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { handleRouteError, ok } from "@/lib/server/api-response";
import { query } from "@/lib/server/db";
import { extractString } from "@/lib/server/sql";
import { deletedFilterSchema } from "@/lib/server/validators/admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const queryText = extractString(searchParams.get("query"));
    const zoneId = searchParams.get("zoneId");
    const deleted = deletedFilterSchema.parse(searchParams.get("deleted") ?? "exclude");

    const where: string[] = ["WHERE 1=1"];
    const params: unknown[] = [];

    if (queryText) {
      where.push("AND (name_ko LIKE ? OR name_en LIKE ?)");
      params.push(`%${queryText}%`, `%${queryText}%`);
    }

    if (zoneId) {
      where.push("AND zone_id = ?");
      params.push(Number(zoneId));
    }

    if (deleted === "only") {
      where.push("AND deleted_at IS NOT NULL");
    } else if (deleted === "exclude") {
      where.push("AND deleted_at IS NULL");
    }

    const rows = await query<RowDataPacket[]>(
      `SELECT id, zone_id, name_ko, name_en, deleted_at
       FROM places
       ${where.join(" ")}
       ORDER BY name_ko ASC`,
      params,
    );

    return ok(rows);
  } catch (error) {
    return handleRouteError(error);
  }
}
