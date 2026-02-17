import type { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { fail, handleRouteError, ok } from "@/lib/server/api-response";
import { withTransaction } from "@/lib/server/tx";
import {
  courseItemReorderSchema,
  idParamSchema,
} from "@/lib/server/validators/admin";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: courseId } = idParamSchema.parse(await params);
    const payload = courseItemReorderSchema.parse(await request.json());

    const itemIds = payload.items.map((item) => item.id);
    const seqs = payload.items.map((item) => item.seq);

    if (new Set(itemIds).size !== itemIds.length) {
      return fail(400, "VALIDATION_ERROR", "중복된 아이템 ID가 있습니다.");
    }

    if (new Set(seqs).size !== seqs.length) {
      return fail(400, "VALIDATION_ERROR", "중복된 seq 값이 있습니다.");
    }

    const sorted = [...seqs].sort((a, b) => a - b);
    for (let index = 0; index < sorted.length; index += 1) {
      if (sorted[index] !== index + 1) {
        return fail(400, "VALIDATION_ERROR", "seq는 1부터 연속값이어야 합니다.");
      }
    }

    await withTransaction(async (connection) => {
      const [existing] = await connection.query<(RowDataPacket & { id: number })[]>(
        `SELECT id FROM course_items WHERE course_id = ? ORDER BY id ASC FOR UPDATE`,
        [courseId],
      );

      if (existing.length !== payload.items.length) {
        throw new Error("코스 아이템 전체를 포함해야 reorder가 가능합니다.");
      }

      const existingIds = existing.map((row) => row.id).sort((a, b) => a - b);
      const incomingIds = [...itemIds].sort((a, b) => a - b);

      if (JSON.stringify(existingIds) !== JSON.stringify(incomingIds)) {
        throw new Error("코스 아이템 전체를 포함해야 reorder가 가능합니다.");
      }

      await connection.query(
        `UPDATE course_items SET seq = seq + 1000 WHERE course_id = ?`,
        [courseId],
      );

      for (const item of payload.items) {
        await connection.query(
          `UPDATE course_items SET seq = ? WHERE course_id = ? AND id = ?`,
          [item.seq, courseId, item.id],
        );
      }
    });

    return ok({ success: true });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "코스 아이템 전체를 포함해야 reorder가 가능합니다."
    ) {
      return fail(400, "VALIDATION_ERROR", error.message);
    }

    return handleRouteError(error);
  }
}
