import type { NextRequest } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { fail, handleRouteError, ok } from "@/lib/server/api-response";
import { query } from "@/lib/server/db";
import { resolveArtworkMediaUrls } from "@/lib/server/mock-media";
import { artworkPayloadSchema, idParamSchema } from "@/lib/server/validators/admin";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = idParamSchema.parse(await params);

    const rows = await query<RowDataPacket[]>(`SELECT * FROM artworks WHERE id = ?`, [id]);

    if (!rows[0]) {
      return fail(404, "NOT_FOUND", "작품을 찾을 수 없습니다.");
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
    const payload = artworkPayloadSchema.parse(await request.json());
    const existingRows = await query<RowDataPacket[]>(
      `SELECT id, photo_day_url, photo_night_url, audio_url_ko, audio_url_en
       FROM artworks
       WHERE id = ?`,
      [id],
    );

    const existingRow = existingRows[0];
    if (!existingRow) {
      return fail(404, "NOT_FOUND", "작품을 찾을 수 없습니다.");
    }

    const mediaUrls = resolveArtworkMediaUrls({
      input: payload,
      existing: {
        photo_day_url: existingRow.photo_day_url as string | undefined,
        photo_night_url: existingRow.photo_night_url as string | undefined,
        audio_url_ko: existingRow.audio_url_ko as string | undefined,
        audio_url_en: existingRow.audio_url_en as string | undefined,
      },
      seed: String(id),
    });

    await query<ResultSetHeader>(
      `UPDATE artworks
       SET title_ko = ?, title_en = ?, artist_id = ?, place_id = ?,
           category = ?, production_year = ?, size_text_ko = ?, size_text_en = ?,
           description_ko = ?, description_en = ?, photo_day_url = ?, photo_night_url = ?,
           audio_url_ko = ?, audio_url_en = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        payload.title_ko,
        payload.title_en,
        payload.artist_id,
        payload.place_id,
        payload.category,
        payload.production_year,
        payload.size_text_ko,
        payload.size_text_en,
        payload.description_ko,
        payload.description_en,
        mediaUrls.photo_day_url,
        mediaUrls.photo_night_url,
        mediaUrls.audio_url_ko,
        mediaUrls.audio_url_en,
        id,
      ],
    );

    const rows = await query<RowDataPacket[]>(`SELECT * FROM artworks WHERE id = ?`, [id]);
    return ok(rows[0]);
  } catch (error) {
    return handleRouteError(error);
  }
}
