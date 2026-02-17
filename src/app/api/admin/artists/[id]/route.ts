import type { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { fail, ok, handleRouteError } from "@/lib/server/api-response";
import { query } from "@/lib/server/db";
import { artistPayloadSchema, idParamSchema } from "@/lib/server/validators/admin";

export const dynamic = "force-dynamic";

type ArtistRow = RowDataPacket & {
  id: number;
  name_ko: string;
  name_en: string;
  type: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = idParamSchema.parse(await params);

    const rows = await query<ArtistRow[]>(
      `SELECT id, name_ko, name_en, type, deleted_at, created_at, updated_at
       FROM artists
       WHERE id = ?`,
      [id],
    );

    if (!rows[0]) {
      return fail(404, "NOT_FOUND", "아티스트를 찾을 수 없습니다.");
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
    const payload = artistPayloadSchema.parse(await request.json());

    const result = await query<{ affectedRows: number } & RowDataPacket[]>(
      `UPDATE artists
       SET name_ko = ?, name_en = ?, type = ?, updated_at = NOW()
       WHERE id = ?`,
      [payload.name_ko, payload.name_en, payload.type, id],
    );

    if (result.affectedRows === 0) {
      return fail(404, "NOT_FOUND", "아티스트를 찾을 수 없습니다.");
    }

    const rows = await query<ArtistRow[]>(
      `SELECT id, name_ko, name_en, type, deleted_at, created_at, updated_at
       FROM artists
       WHERE id = ?`,
      [id],
    );

    return ok(rows[0]);
  } catch (error) {
    return handleRouteError(error);
  }
}
