import type { NextRequest } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { fail, handleRouteError, ok } from "@/lib/server/api-response";
import { query } from "@/lib/server/db";
import { idParamSchema } from "@/lib/server/validators/admin";

export const dynamic = "force-dynamic";

type CountRow = RowDataPacket & {
  total: number;
};

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = idParamSchema.parse(await params);

    const countRows = await query<CountRow[]>(
      `SELECT COUNT(*) AS total
       FROM artworks
       WHERE place_id = ? AND deleted_at IS NULL`,
      [id],
    );

    if ((countRows[0]?.total ?? 0) > 0) {
      return fail(
        409,
        "PLACE_IN_USE",
        "이 장소를 참조 중인 활성 작품이 있어 삭제할 수 없습니다.",
      );
    }

    const updated = await query<ResultSetHeader>(
      `UPDATE places
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [id],
    );

    if (updated.affectedRows === 0) {
      return fail(404, "NOT_FOUND", "장소를 찾을 수 없습니다.");
    }

    return ok({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
