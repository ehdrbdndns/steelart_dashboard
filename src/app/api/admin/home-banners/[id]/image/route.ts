import type { NextRequest } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { fail, handleRouteError, ok } from "@/lib/server/api-response";
import { withTransaction } from "@/lib/server/tx";
import {
  homeBannerImageUpdateSchema,
  idParamSchema,
} from "@/lib/server/validators/admin";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = idParamSchema.parse(await params);
    const payload = homeBannerImageUpdateSchema.parse(await request.json());

    const updated = await withTransaction(async (connection) => {
      await connection.query<ResultSetHeader>(
        `UPDATE home_banners SET banner_image_url = ?, updated_at = NOW() WHERE id = ?`,
        [payload.banner_image_url, id],
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
