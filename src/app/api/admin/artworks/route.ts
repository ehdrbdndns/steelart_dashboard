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
  production_year: number;
  likes_count: number;
  thumbnail_image_url: string | null;
  deleted_at: string | null;
  updated_at: string;
};

type ArtworkImageRow = RowDataPacket & {
  id: number;
  artwork_id: number;
  image_url: string;
  created_at: string | null;
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
          payload.place_id,
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
          `INSERT INTO artwork_images (artwork_id, image_url, created_at)
           VALUES (?, ?, NOW())`,
          [inserted.insertId, image.image_url],
        );
      }

      const [artworkRows] = await connection.query<RowDataPacket[]>(
        `SELECT * FROM artworks WHERE id = ?`,
        [inserted.insertId],
      );
      const [imageRows] = await connection.query<ArtworkImageRow[]>(
        `SELECT id, artwork_id, image_url, created_at
         FROM artwork_images
         WHERE artwork_id = ?
         ORDER BY id ASC`,
        [inserted.insertId],
      );

      return {
        ...artworkRows[0],
        images: imageRows,
      };
    });

    return ok(created);
  } catch (error) {
    return handleRouteError(error);
  }
}
