import type { NextRequest } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { fail, handleRouteError, ok } from "@/lib/server/api-response";
import { withTransaction } from "@/lib/server/tx";
import {
  homeBannerUpdateSchema,
  idParamSchema,
} from "@/lib/server/validators/admin";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = idParamSchema.parse(await params);
    const payload = homeBannerUpdateSchema.parse(await request.json());

    const updated = await withTransaction(async (connection) => {
      await connection.query<ResultSetHeader>(
        `UPDATE home_banners SET is_active = ?, updated_at = NOW() WHERE id = ?`,
        [payload.is_active ? 1 : 0, id],
      );

      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT * FROM home_banners WHERE id = ?`,
        [id],
      );

      return rows[0] ?? null;
    });

    if (!updated) {
      return fail(404, "NOT_FOUND", "홈 배너를 찾을 수 없습니다.");
    }

    return ok(updated);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = idParamSchema.parse(await params);

    const deleted = await withTransaction(async (connection) => {
      const [result] = await connection.query<ResultSetHeader>(
        `DELETE FROM home_banners WHERE id = ?`,
        [id],
      );

      if (result.affectedRows === 0) {
        return false;
      }

      const [rows] = await connection.query<(RowDataPacket & { id: number })[]>(
        `SELECT id FROM home_banners ORDER BY display_order ASC FOR UPDATE`,
      );

      await connection.query(`UPDATE home_banners SET display_order = display_order + 1000`);

      for (let index = 0; index < rows.length; index += 1) {
        await connection.query(
          `UPDATE home_banners SET display_order = ?, updated_at = NOW() WHERE id = ?`,
          [index + 1, rows[index].id],
        );
      }

      return true;
    });

    if (!deleted) {
      return fail(404, "NOT_FOUND", "홈 배너를 찾을 수 없습니다.");
    }

    return ok({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
