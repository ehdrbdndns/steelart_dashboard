import type { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { fail, ok, handleRouteError } from "@/lib/server/api-response";
import { query } from "@/lib/server/db";
import {
  artistUpdatePayloadSchema,
  idParamSchema,
} from "@/lib/server/validators/admin";

export const dynamic = "force-dynamic";

type ArtistRow = RowDataPacket & {
  id: number;
  name_ko: string;
  name_en: string;
  type: string;
  profile_image_url: string | null;
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
      `SELECT id, name_ko, name_en, type, profile_image_url, deleted_at, created_at, updated_at
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
    const payload = artistUpdatePayloadSchema.parse(await request.json());

    const existingRows = await query<ArtistRow[]>(
      `SELECT id, name_ko, name_en, type, profile_image_url, deleted_at, created_at, updated_at
       FROM artists
       WHERE id = ?`,
      [id],
    );

    const existingArtist = existingRows[0];
    if (!existingArtist) {
      return fail(404, "NOT_FOUND", "아티스트를 찾을 수 없습니다.");
    }

    await query<{ affectedRows: number } & RowDataPacket[]>(
      `UPDATE artists
       SET name_ko = ?, name_en = ?, type = ?, profile_image_url = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        payload.name_ko,
        payload.name_en,
        payload.type,
        payload.profile_image_url ?? existingArtist.profile_image_url,
        id,
      ],
    );

    const rows = await query<ArtistRow[]>(
      `SELECT id, name_ko, name_en, type, profile_image_url, deleted_at, created_at, updated_at
       FROM artists
       WHERE id = ?`,
      [id],
    );

    return ok(rows[0]);
  } catch (error) {
    return handleRouteError(error);
  }
}
