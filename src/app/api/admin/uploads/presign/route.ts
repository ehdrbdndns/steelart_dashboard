import type { NextRequest } from "next/server";
import { createPresignedUploadUrl } from "@/lib/server/s3";
import { fail, handleRouteError, ok } from "@/lib/server/api-response";
import { isAwsEnvConfigured } from "@/lib/server/env";
import { uploadPresignSchema, validateMimeType } from "@/lib/server/validators/admin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    if (!isAwsEnvConfigured()) {
      return fail(
        503,
        "FEATURE_NOT_CONFIGURED",
        "AWS 업로드 설정이 누락되어 파일 업로드를 사용할 수 없습니다.",
      );
    }

    const payload = uploadPresignSchema.parse(await request.json());

    if (!validateMimeType(payload.contentType)) {
      return fail(
        400,
        "VALIDATION_ERROR",
        "이미지(image/*) 또는 오디오(audio/*) 파일만 업로드할 수 있습니다.",
      );
    }

    const isArtworkFolder = payload.folder.startsWith("artworks/");
    const isArtistProfileFolder =
      payload.folder === "artists/profile" ||
      payload.folder.startsWith("artists/profile/");

    if (!isArtworkFolder && !isArtistProfileFolder) {
      return fail(
        400,
        "VALIDATION_ERROR",
        "지원하지 않는 업로드 경로입니다.",
      );
    }

    const presigned = await createPresignedUploadUrl(payload);

    return ok(presigned);
  } catch (error) {
    return handleRouteError(error);
  }
}
