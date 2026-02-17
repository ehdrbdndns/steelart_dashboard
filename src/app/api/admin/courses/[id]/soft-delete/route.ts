import type { NextRequest } from "next/server";
import type { ResultSetHeader } from "mysql2";
import { fail, handleRouteError, ok } from "@/lib/server/api-response";
import { query } from "@/lib/server/db";
import { idParamSchema } from "@/lib/server/validators/admin";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = idParamSchema.parse(await params);

    const updated = await query<ResultSetHeader>(
      `UPDATE courses SET deleted_at = NOW(), updated_at = NOW() WHERE id = ?`,
      [id],
    );

    if (updated.affectedRows === 0) {
      return fail(404, "NOT_FOUND", "코스를 찾을 수 없습니다.");
    }

    return ok({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
