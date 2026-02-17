export type ApiError = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type ApiSuccess<T> = {
  data: T;
  meta?: {
    total: number;
    page: number;
    size: number;
    totalPages: number;
  };
};

async function parseResponse<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<ApiSuccess<T>> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const payload = (await response.json()) as ApiSuccess<T> | ApiError;

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload !== null && "error" in payload
        ? payload.error.message
        : "요청 처리에 실패했습니다.";

    throw new Error(message);
  }

  if (typeof payload === "object" && payload !== null && "data" in payload) {
    return payload;
  }

  throw new Error("잘못된 API 응답 형식입니다.");
}

export async function requestJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await parseResponse<T>(input, init);
  return response.data;
}

export async function requestJsonWithMeta<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<ApiSuccess<T>> {
  return parseResponse<T>(input, init);
}

export function buildQuery(
  values: Record<string, string | number | boolean | undefined | null>,
) {
  const searchParams = new URLSearchParams();

  Object.entries(values).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    searchParams.set(key, String(value));
  });

  return searchParams.toString();
}
