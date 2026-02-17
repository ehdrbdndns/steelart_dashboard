import type { NextRequest } from "next/server";
import { fail } from "@/lib/server/api-response";

export const dynamic = "force-dynamic";

export async function POST(_request: NextRequest) {
  return fail(
    503,
    "FEATURE_DISABLED",
    "파일 업로드 기능은 AWS 준비 후 활성화됩니다.",
  );
}
