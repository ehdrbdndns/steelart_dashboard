import type { NextRequest } from "next/server";
import { z } from "zod";
import { fail, handleRouteError, ok } from "@/lib/server/api-response";
import { placeGeocodePayloadSchema } from "@/lib/server/validators/admin";

export const dynamic = "force-dynamic";

const kakaoAddressSearchResponseSchema = z.object({
  documents: z.array(
    z.object({
      address_name: z.string(),
      x: z.string(),
      y: z.string(),
    }),
  ),
});

export async function POST(request: NextRequest) {
  try {
    const payload = placeGeocodePayloadSchema.parse(await request.json());
    const kakaoRestApiKey = (process.env.KAKAO_REST_API_KEY ?? "").trim();

    if (!kakaoRestApiKey) {
      return fail(
        503,
        "KAKAO_REST_API_KEY_MISSING",
        "KAKAO_REST_API_KEY가 설정되지 않아 좌표 자동 입력을 사용할 수 없습니다.",
      );
    }

    const endpoint = new URL("https://dapi.kakao.com/v2/local/search/address.json");
    endpoint.searchParams.set("query", payload.address);
    endpoint.searchParams.set("size", "1");

    const response = await fetch(endpoint.toString(), {
      method: "GET",
      headers: {
        Authorization: `KakaoAK ${kakaoRestApiKey}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return fail(
        502,
        "KAKAO_GEOCODE_FAILED",
        "카카오 주소 검색 요청에 실패했습니다.",
        { status: response.status },
      );
    }

    const result = kakaoAddressSearchResponseSchema.parse(await response.json());
    const matched = result.documents[0];

    if (!matched) {
      return fail(404, "GEOCODE_NOT_FOUND", "주소에 대한 좌표를 찾지 못했습니다.");
    }

    const lat = Number(matched.y);
    const lng = Number(matched.x);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return fail(502, "GEOCODE_INVALID_COORDINATE", "좌표 변환 결과가 올바르지 않습니다.");
    }

    return ok({
      lat: Number(lat.toFixed(7)),
      lng: Number(lng.toFixed(7)),
      matched_address: matched.address_name,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
