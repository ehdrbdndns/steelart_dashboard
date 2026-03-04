import type { NextRequest } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { handleRouteError, ok } from "@/lib/server/api-response";
import { query } from "@/lib/server/db";
import { withTransaction } from "@/lib/server/tx";
import { homeBannerCreateSchema } from "@/lib/server/validators/admin";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  try {
    const rows = await query<RowDataPacket[]>(
      `SELECT id, banner_image_url, display_order, is_active, created_at, updated_at
       FROM home_banners
       ORDER BY display_order ASC`,
    );

    return ok(rows);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = homeBannerCreateSchema.parse(await request.json());

    const created = await withTransaction(async (connection) => {
      const [orderRows] = await connection.query<(RowDataPacket & { next_order: number })[]>(
        `SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM home_banners FOR UPDATE`,
      );

      const nextOrder = orderRows[0]?.next_order ?? 1;

      const [inserted] = await connection.query<ResultSetHeader>(
        `INSERT INTO home_banners (banner_image_url, display_order, is_active, created_at, updated_at)
         VALUES (?, ?, ?, NOW(), NOW())`,
        [payload.banner_image_url, nextOrder, payload.is_active ? 1 : 0],
      );

      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT * FROM home_banners WHERE id = ?`,
        [inserted.insertId],
      );

      return rows[0];
    });

    return ok(created);
  } catch (error) {
    return handleRouteError(error);
  }
}
