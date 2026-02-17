import type { NextRequest } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { fail, handleRouteError, ok } from "@/lib/server/api-response";
import { query } from "@/lib/server/db";
import { coursePayloadSchema, idParamSchema } from "@/lib/server/validators/admin";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = idParamSchema.parse(await params);

    const rows = await query<RowDataPacket[]>(`SELECT * FROM courses WHERE id = ?`, [id]);

    if (!rows[0]) {
      return fail(404, "NOT_FOUND", "코스를 찾을 수 없습니다.");
    }

    return ok(rows[0]);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = idParamSchema.parse(await params);
    const payload = coursePayloadSchema.parse(await request.json());

    const updated = await query<ResultSetHeader>(
      `UPDATE courses
       SET title_ko = ?, title_en = ?, description_ko = ?, description_en = ?,
           is_official = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        payload.title_ko,
        payload.title_en,
        payload.description_ko,
        payload.description_en,
        payload.is_official ? 1 : 0,
        id,
      ],
    );

    if (updated.affectedRows === 0) {
      return fail(404, "NOT_FOUND", "코스를 찾을 수 없습니다.");
    }

    const rows = await query<RowDataPacket[]>(`SELECT * FROM courses WHERE id = ?`, [id]);

    return ok(rows[0]);
  } catch (error) {
    return handleRouteError(error);
  }
}
