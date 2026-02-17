import type { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { fail, handleRouteError, ok } from "@/lib/server/api-response";
import { withTransaction } from "@/lib/server/tx";
import { homeBannerReorderSchema } from "@/lib/server/validators/admin";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  try {
    const payload = homeBannerReorderSchema.parse(await request.json());
    const ids = payload.items.map((item) => item.id);
    const orders = payload.items.map((item) => item.display_order);

    if (new Set(ids).size !== ids.length) {
      return fail(400, "VALIDATION_ERROR", "중복된 배너 ID가 있습니다.");
    }

    if (new Set(orders).size !== orders.length) {
      return fail(400, "VALIDATION_ERROR", "중복된 display_order 값이 있습니다.");
    }

    const sorted = [...orders].sort((a, b) => a - b);
    for (let index = 0; index < sorted.length; index += 1) {
      if (sorted[index] !== index + 1) {
        return fail(400, "VALIDATION_ERROR", "display_order는 1부터 연속값이어야 합니다.");
      }
    }

    await withTransaction(async (connection) => {
      const [existing] = await connection.query<(RowDataPacket & { id: number })[]>(
        `SELECT id FROM home_banners ORDER BY id ASC FOR UPDATE`,
      );

      if (existing.length !== payload.items.length) {
        throw new Error("전체 배너를 포함해야 reorder 가능합니다.");
      }

      const existingIds = existing.map((row) => row.id).sort((a, b) => a - b);
      const incomingIds = [...ids].sort((a, b) => a - b);

      if (JSON.stringify(existingIds) !== JSON.stringify(incomingIds)) {
        throw new Error("전체 배너를 포함해야 reorder 가능합니다.");
      }

      await connection.query(`UPDATE home_banners SET display_order = display_order + 1000`);

      for (const item of payload.items) {
        await connection.query(
          `UPDATE home_banners SET display_order = ?, updated_at = NOW() WHERE id = ?`,
          [item.display_order, item.id],
        );
      }
    });

    return ok({ success: true });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "전체 배너를 포함해야 reorder 가능합니다."
    ) {
      return fail(400, "VALIDATION_ERROR", error.message);
    }

    return handleRouteError(error);
  }
}
