import type { NextRequest } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { fail, handleRouteError, ok } from "@/lib/server/api-response";
import { query } from "@/lib/server/db";
import { withTransaction } from "@/lib/server/tx";
import {
  artworkUpdatePayloadSchema,
  idParamSchema,
} from "@/lib/server/validators/admin";

export const dynamic = "force-dynamic";

type ArtworkImageRow = RowDataPacket & {
  id: number;
  artwork_id: number;
  image_url: string;
  created_at: string | null;
};

type ArtworkFestivalRow = RowDataPacket & {
  year: string;
};

async function getArtworkWithImages(artworkId: number) {
  const rows = await query<RowDataPacket[]>(`SELECT * FROM artworks WHERE id = ?`, [artworkId]);
  const artwork = rows[0];

  if (!artwork) {
    return null;
  }

  const images = await query<ArtworkImageRow[]>(
    `SELECT id, artwork_id, image_url, created_at
     FROM artwork_images
     WHERE artwork_id = ?
     ORDER BY id ASC`,
    [artworkId],
  );

  const festivalRows = await query<ArtworkFestivalRow[]>(
    `SELECT \`year\` AS year
     FROM artwork_festivals
     WHERE artwork_id = ?
     ORDER BY CAST(\`year\` AS UNSIGNED) DESC, \`year\` DESC`,
    [artworkId],
  );

  return {
    ...artwork,
    images,
    festival_years: festivalRows.map((row) => row.year),
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = idParamSchema.parse(await params);
    const artwork = await getArtworkWithImages(id);

    if (!artwork) {
      return fail(404, "NOT_FOUND", "작품을 찾을 수 없습니다.");
    }

    return ok(artwork);
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
    const payload = artworkUpdatePayloadSchema.parse(await request.json());
    const updated = await withTransaction(async (connection) => {
      const [existingRows] = await connection.query<RowDataPacket[]>(
        `SELECT id, audio_url_ko, audio_url_en
         FROM artworks
         WHERE id = ?`,
        [id],
      );

      const existingRow = existingRows[0];
      if (!existingRow) {
        throw new Error("NOT_FOUND");
      }

      await connection.query<ResultSetHeader>(
        `UPDATE artworks
         SET title_ko = ?, title_en = ?, artist_id = ?, place_id = ?,
             category = ?, production_year = ?, size_text_ko = ?, size_text_en = ?,
             description_ko = ?, description_en = ?,
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
          payload.audio_url_ko ?? (existingRow.audio_url_ko as string | null),
          payload.audio_url_en ?? (existingRow.audio_url_en as string | null),
          id,
        ],
      );

      await connection.query<ResultSetHeader>(
        `DELETE FROM artwork_images WHERE artwork_id = ?`,
        [id],
      );

      for (const image of payload.images) {
        await connection.query<ResultSetHeader>(
          `INSERT INTO artwork_images (artwork_id, image_url, created_at)
           VALUES (?, ?, NOW())`,
          [id, image.image_url],
        );
      }

      await connection.query<ResultSetHeader>(
        `DELETE FROM artwork_festivals WHERE artwork_id = ?`,
        [id],
      );

      for (const year of payload.festival_years) {
        await connection.query<ResultSetHeader>(
          `INSERT INTO artwork_festivals (artwork_id, \`year\`, created_at)
           VALUES (?, ?, NOW())`,
          [id, year],
        );
      }

      const [artworkRows] = await connection.query<RowDataPacket[]>(
        `SELECT * FROM artworks WHERE id = ?`,
        [id],
      );
      const [imageRows] = await connection.query<ArtworkImageRow[]>(
        `SELECT id, artwork_id, image_url, created_at
         FROM artwork_images
         WHERE artwork_id = ?
         ORDER BY id ASC`,
        [id],
      );
      const [festivalRows] = await connection.query<ArtworkFestivalRow[]>(
        `SELECT \`year\` AS year
         FROM artwork_festivals
         WHERE artwork_id = ?
         ORDER BY CAST(\`year\` AS UNSIGNED) DESC, \`year\` DESC`,
        [id],
      );

      return {
        ...artworkRows[0],
        images: imageRows,
        festival_years: festivalRows.map((row) => row.year),
      };
    });

    return ok(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return fail(404, "NOT_FOUND", "작품을 찾을 수 없습니다.");
    }
    return handleRouteError(error);
  }
}
