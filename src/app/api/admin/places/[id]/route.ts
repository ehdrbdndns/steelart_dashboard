import type { NextRequest } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { fail, handleRouteError, ok } from "@/lib/server/api-response";
import { query } from "@/lib/server/db";
import {
  idParamSchema,
  placeUpdatePayloadSchema,
} from "@/lib/server/validators/admin";

export const dynamic = "force-dynamic";

type PlaceRow = RowDataPacket & {
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

async function getPlaceById(id: number) {
  const rows = await query<PlaceRow[]>(
    `SELECT p.id, p.zone_id, z.name_ko AS zone_name_ko, p.name_ko, p.name_en, p.address,
            CAST(p.lat AS DOUBLE) AS lat, CAST(p.lng AS DOUBLE) AS lng,
            p.deleted_at, p.created_at, p.updated_at
     FROM places p
     LEFT JOIN zones z ON z.id = p.zone_id
     WHERE p.id = ?`,
    [id],
  );

  return rows[0] ?? null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = idParamSchema.parse(await params);
    const place = await getPlaceById(id);

    if (!place) {
      return fail(404, "NOT_FOUND", "장소를 찾을 수 없습니다.");
    }

    return ok(place);
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
    const payload = placeUpdatePayloadSchema.parse(await request.json());

    const updated = await query<ResultSetHeader>(
      `UPDATE places
       SET name_ko = ?, name_en = ?, address = ?, lat = ?, lng = ?, zone_id = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        payload.name_ko,
        payload.name_en,
        payload.address,
        payload.lat,
        payload.lng,
        payload.zone_id ?? null,
        id,
      ],
    );

    if (updated.affectedRows === 0) {
      return fail(404, "NOT_FOUND", "장소를 찾을 수 없습니다.");
    }

    const place = await getPlaceById(id);
    if (!place) {
      return fail(404, "NOT_FOUND", "장소를 찾을 수 없습니다.");
    }

    return ok(place);
  } catch (error) {
    return handleRouteError(error);
  }
}
