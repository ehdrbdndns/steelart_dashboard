import type { NextRequest } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { fail, handleRouteError, ok } from "@/lib/server/api-response";
import { withTransaction } from "@/lib/server/tx";
import { idParamSchema } from "@/lib/server/validators/admin";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const resolvedParams = await params;
    const { id: courseId } = idParamSchema.parse({ id: resolvedParams.id });
    const { id: itemId } = idParamSchema.parse({ id: resolvedParams.itemId });

    await withTransaction(async (connection) => {
      const [itemRows] = await connection.query<RowDataPacket[]>(
        `SELECT id FROM course_items WHERE id = ? AND course_id = ? FOR UPDATE`,
        [itemId, courseId],
      );

      if (!itemRows[0]) {
        throw new Error("NOT_FOUND");
      }

      const [checkins] = await connection.query<(RowDataPacket & { total: number })[]>(
        `SELECT COUNT(*) AS total FROM course_checkins WHERE course_item_id = ?`,
        [itemId],
      );

      if ((checkins[0]?.total ?? 0) > 0) {
        throw new Error("CHECKIN_EXISTS");
      }

      await connection.query<ResultSetHeader>(
        `DELETE FROM course_items WHERE id = ? AND course_id = ?`,
        [itemId, courseId],
      );

      const [remaining] = await connection.query<(RowDataPacket & { id: number })[]>(
        `SELECT id FROM course_items WHERE course_id = ? ORDER BY seq ASC FOR UPDATE`,
        [courseId],
      );

      await connection.query(
        `UPDATE course_items SET seq = seq + 1000 WHERE course_id = ?`,
        [courseId],
      );

      for (let index = 0; index < remaining.length; index += 1) {
        await connection.query(
          `UPDATE course_items SET seq = ? WHERE id = ? AND course_id = ?`,
          [index + 1, remaining[index].id, courseId],
        );
      }
    });

    return ok({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "CHECKIN_EXISTS") {
      return fail(
        409,
        "CHECKIN_EXISTS",
        "체크인 데이터가 존재하는 코스 아이템은 삭제할 수 없습니다.",
      );
    }

    if (error instanceof Error && error.message === "NOT_FOUND") {
      return fail(404, "NOT_FOUND", "코스 아이템을 찾을 수 없습니다.");
    }

    return handleRouteError(error);
  }
}
