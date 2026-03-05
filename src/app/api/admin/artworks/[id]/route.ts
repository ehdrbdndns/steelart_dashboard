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

type PlaceDetailRow = RowDataPacket & {
  id: number;
  zone_id: number | null;
  zone_name_ko: string | null;
  name_ko: string;
  name_en: string;
  address: string | null;
  lat: number;
  lng: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type ArtworkCoreRow = RowDataPacket & {
  id: number;
  place_id: number;
  audio_url_ko: string | null;
  audio_url_en: string | null;
};

type CountRow = RowDataPacket & {
  total: number;
};

async function getArtworkWithImages(artworkId: number) {
  const rows = await query<RowDataPacket[]>(`SELECT * FROM artworks WHERE id = ?`, [artworkId]);
  const artwork = rows[0];

  if (!artwork) {
    return null;
  }

  const placeId = Number(artwork.place_id);
  const placeRows = await query<PlaceDetailRow[]>(
    `SELECT p.id, p.zone_id, z.name_ko AS zone_name_ko, p.name_ko, p.name_en, p.address,
            CAST(p.lat AS DOUBLE) AS lat, CAST(p.lng AS DOUBLE) AS lng,
            p.deleted_at, p.created_at, p.updated_at
     FROM places p
     LEFT JOIN zones z ON z.id = p.zone_id
     WHERE p.id = ?`,
    [placeId],
  );

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
    place: placeRows[0] ?? null,
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

    await withTransaction(async (connection) => {
      const [existingRows] = await connection.query<ArtworkCoreRow[]>(
        `SELECT id, place_id, audio_url_ko, audio_url_en
         FROM artworks
         WHERE id = ?`,
        [id],
      );

      const existingRow = existingRows[0];
      if (!existingRow) {
        throw new Error("NOT_FOUND");
      }

      const currentPlaceId = existingRow.place_id;

      const [sharedRows] = await connection.query<CountRow[]>(
        `SELECT COUNT(*) AS total
         FROM artworks
         WHERE place_id = ? AND deleted_at IS NULL AND id <> ?`,
        [currentPlaceId, id],
      );

      const activeSharedCount = sharedRows[0]?.total ?? 0;
      let nextPlaceId = currentPlaceId;

      if (activeSharedCount > 0) {
        const [insertedPlace] = await connection.query<ResultSetHeader>(
          `INSERT INTO places (
             name_ko, name_en, address, lat, lng, zone_id, deleted_at, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, NULL, NOW(), NOW())`,
          [
            payload.place.name_ko,
            payload.place.name_en,
            payload.place.address,
            payload.place.lat,
            payload.place.lng,
            payload.place.zone_id ?? null,
          ],
        );

        nextPlaceId = insertedPlace.insertId;
      } else {
        await connection.query<ResultSetHeader>(
          `UPDATE places
           SET name_ko = ?, name_en = ?, address = ?, lat = ?, lng = ?, zone_id = ?,
               deleted_at = NULL, updated_at = NOW()
           WHERE id = ?`,
          [
            payload.place.name_ko,
            payload.place.name_en,
            payload.place.address,
            payload.place.lat,
            payload.place.lng,
            payload.place.zone_id ?? null,
            currentPlaceId,
          ],
        );
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
          nextPlaceId,
          payload.category,
          payload.production_year,
          payload.size_text_ko,
          payload.size_text_en,
          payload.description_ko,
          payload.description_en,
          payload.audio_url_ko ?? existingRow.audio_url_ko,
          payload.audio_url_en ?? existingRow.audio_url_en,
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
    });

    const updated = await getArtworkWithImages(id);
    if (!updated) {
      return fail(404, "NOT_FOUND", "작품을 찾을 수 없습니다.");
    }

    return ok(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return fail(404, "NOT_FOUND", "작품을 찾을 수 없습니다.");
    }
    return handleRouteError(error);
  }
}
