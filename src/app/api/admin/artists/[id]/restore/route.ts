import type { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { fail, ok, handleRouteError } from "@/lib/server/api-response";
import { query } from "@/lib/server/db";
import { idParamSchema } from "@/lib/server/validators/admin";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = idParamSchema.parse(await params);

    const result = await query<{ affectedRows: number } & RowDataPacket[]>(
      `UPDATE artists SET deleted_at = NULL, updated_at = NOW() WHERE id = ?`,
      [id],
    );

    if (result.affectedRows === 0) {
      return fail(404, "NOT_FOUND", "아티스트를 찾을 수 없습니다.");
    }

    return ok({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
