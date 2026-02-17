import type { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { handleRouteError, ok } from "@/lib/server/api-response";
import { query } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  try {
    const rows = await query<RowDataPacket[]>(
      `SELECT id, code, name_ko, name_en, sort_order
       FROM zones
       ORDER BY sort_order ASC, name_ko ASC`,
    );

    return ok(rows);
  } catch (error) {
    return handleRouteError(error);
  }
}
