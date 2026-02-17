import { NextResponse } from "next/server";

export type ApiErrorShape = {
  code: string;
  message: string;
  details?: unknown;
};

export function ok<T>(data: T, meta?: unknown) {
  if (meta) {
    return NextResponse.json({ data, meta });
  }

  return NextResponse.json({ data });
}

export function fail(
  status: number,
  code: string,
  message: string,
  details?: unknown,
) {
  const error: ApiErrorShape = { code, message };

  if (details !== undefined) {
    error.details = details;
  }

  return NextResponse.json({ error }, { status });
}

export function handleRouteError(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "ZodError"
  ) {
    return fail(400, "VALIDATION_ERROR", "입력값이 올바르지 않습니다.", error);
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ER_DUP_ENTRY"
  ) {
    return fail(409, "CONFLICT", "중복된 데이터입니다.");
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ER_NO_REFERENCED_ROW_2"
  ) {
    return fail(400, "REFERENCE_ERROR", "참조 데이터가 올바르지 않습니다.");
  }

  const message =
    error instanceof Error ? error.message : "서버 내부 오류가 발생했습니다.";

  return fail(500, "INTERNAL_SERVER_ERROR", message);
}
