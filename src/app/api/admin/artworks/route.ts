import type { NextRequest } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { handleRouteError, ok } from "@/lib/server/api-response";
import { query } from "@/lib/server/db";
import { makePaginationMeta, parsePagination } from "@/lib/server/pagination";
import { buildDeletedAtClause, extractString } from "@/lib/server/sql";
import { withTransaction } from "@/lib/server/tx";
import {
  artworkPayloadSchema,
  artworksQuerySchema,
} from "@/lib/server/validators/admin";

export const dynamic = "force-dynamic";

type ArtworkListRow = RowDataPacket & {
  id: number;
  title_ko: string;
  title_en: string;
  artist_id: number;
  artist_name_ko: string;
  place_id: number;
  place_name_ko: string;
  zone_id: number | null;
  zone_name_ko: string | null;
  category: string;
  production_year: number | null;
  likes_count: number;
  thumbnail_image_url: string | null;
  festival_years_summary: string | null;
  deleted_at: string | null;
  updated_at: string;
};

type ArtworkImageRow = RowDataPacket & {
  id: number;
  artwork_id: number;
  image_url: string;
  image_width: number | null;
  image_height: number | null;
  created_at: string | null;
};

type ArtworkFestivalRow = RowDataPacket & {
  year: string;
};

export async function GET(request: NextRequest) {
  try {
    const search = artworksQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );

    const pagination = parsePagination(request.nextUrl.searchParams);
    const where: string[] = ["WHERE 1=1"];
    const params: unknown[] = [];

    const keyword = extractString(search.query);
    if (keyword) {
      where.push("AND (a.title_ko LIKE ? OR a.title_en LIKE ?)");
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    const category = extractString(search.category);
    if (category) {
      where.push("AND a.category = ?");
      params.push(category);
    }

    if (search.artistId) {
      where.push("AND a.artist_id = ?");
      params.push(search.artistId);
    }

    if (search.placeId) {
      where.push("AND a.place_id = ?");
      params.push(search.placeId);
    }

    if (search.zoneId) {
      where.push("AND p.zone_id = ?");
      params.push(search.zoneId);
    }

    const deletedClause = buildDeletedAtClause(search.deleted ?? "exclude", "a.deleted_at");
    where.push(deletedClause.clause);

    const countRows = await query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) AS total
       FROM artworks a
       INNER JOIN places p ON p.id = a.place_id
       ${where.join(" ")}`,
      params,
    );

    const total = countRows[0]?.total ?? 0;

    const rows = await query<ArtworkListRow[]>(
      `SELECT a.id, a.title_ko, a.title_en, a.artist_id, ar.name_ko AS artist_name_ko,
              a.place_id, p.name_ko AS place_name_ko, p.zone_id, z.name_ko AS zone_name_ko,
              a.category, a.production_year, a.likes_count, thumb.image_url AS thumbnail_image_url,
              festivals.festival_years_summary,
              a.deleted_at, a.updated_at
       FROM artworks a
       INNER JOIN artists ar ON ar.id = a.artist_id
       INNER JOIN places p ON p.id = a.place_id
       LEFT JOIN zones z ON z.id = p.zone_id
       LEFT JOIN (
         SELECT ai.artwork_id, ai.image_url
         FROM artwork_images ai
         INNER JOIN (
           SELECT artwork_id, MIN(id) AS first_image_id
           FROM artwork_images
           GROUP BY artwork_id
         ) first_ai ON first_ai.first_image_id = ai.id
       ) thumb ON thumb.artwork_id = a.id
       LEFT JOIN (
         SELECT artwork_id,
                GROUP_CONCAT(
                  \`year\` ORDER BY CAST(\`year\` AS UNSIGNED) DESC SEPARATOR ', '
                ) AS festival_years_summary
         FROM artwork_festivals
         GROUP BY artwork_id
       ) festivals ON festivals.artwork_id = a.id
       ${where.join(" ")}
       ORDER BY a.updated_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pagination.size, pagination.offset],
    );

    return ok(rows, makePaginationMeta(total, pagination.page, pagination.size));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = artworkPayloadSchema.parse(await request.json());

    const created = await withTransaction(async (connection) => {
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

      const [inserted] = await connection.query<ResultSetHeader>(
        `INSERT INTO artworks (
            title_ko, title_en, artist_id, place_id, category, production_year,
            size_text_ko, size_text_en, description_ko, description_en,
            audio_url_ko, audio_url_en,
            likes_count, deleted_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NOW(), NOW())`,
        [
          payload.title_ko,
          payload.title_en,
          payload.artist_id,
          insertedPlace.insertId,
          payload.category,
          payload.production_year,
          payload.size_text_ko,
          payload.size_text_en,
          payload.description_ko,
          payload.description_en,
          payload.audio_url_ko,
          payload.audio_url_en,
        ],
      );

      for (const image of payload.images) {
        await connection.query<ResultSetHeader>(
          `INSERT INTO artwork_images (
             artwork_id, image_url, created_at, image_width, image_height
           ) VALUES (?, ?, NOW(), ?, ?)`,
          [
            inserted.insertId,
            image.image_url,
            image.image_width,
            image.image_height,
          ],
        );
      }

      for (const year of payload.festival_years) {
        await connection.query<ResultSetHeader>(
          `INSERT INTO artwork_festivals (artwork_id, \`year\`, created_at)
           VALUES (?, ?, NOW())`,
          [inserted.insertId, year],
        );
      }

      const [artworkRows] = await connection.query<RowDataPacket[]>(
        `SELECT * FROM artworks WHERE id = ?`,
        [inserted.insertId],
      );
      const [imageRows] = await connection.query<ArtworkImageRow[]>(
        `SELECT id, artwork_id, image_url, image_width, image_height, created_at
         FROM artwork_images
         WHERE artwork_id = ?
         ORDER BY id ASC`,
        [inserted.insertId],
      );
      const [festivalRows] = await connection.query<ArtworkFestivalRow[]>(
        `SELECT \`year\` AS year
         FROM artwork_festivals
         WHERE artwork_id = ?
         ORDER BY CAST(\`year\` AS UNSIGNED) DESC, \`year\` DESC`,
        [inserted.insertId],
      );
      const [placeRows] = await connection.query<RowDataPacket[]>(
        `SELECT p.id, p.zone_id, z.name_ko AS zone_name_ko, p.name_ko, p.name_en, p.address,
                CAST(p.lat AS DOUBLE) AS lat, CAST(p.lng AS DOUBLE) AS lng,
                p.deleted_at, p.created_at, p.updated_at
         FROM places p
         LEFT JOIN zones z ON z.id = p.zone_id
         WHERE p.id = ?`,
        [insertedPlace.insertId],
      );

      return {
        ...artworkRows[0],
        place: placeRows[0] ?? null,
        images: imageRows,
        festival_years: festivalRows.map((row) => row.year),
      };
    });

    return ok(created);
  } catch (error) {
    return handleRouteError(error);
  }
}
