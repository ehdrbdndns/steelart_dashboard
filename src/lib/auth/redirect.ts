export const ADMIN_LOGIN_PATH = "/admin/login";
export const DEFAULT_ADMIN_REDIRECT = "/admin/artists";
export const AUTH_REQUIRED_REASON = "auth-required";
export const AUTH_REQUIRED_ALERT_MESSAGE =
  "로그인이 필요합니다. 로그인 후 다시 시도해 주세요.";

export function isSafeAdminRedirect(
  value: string | null | undefined,
): value is string {
  if (!value || !value.startsWith("/admin") || value.startsWith("//")) {
    return false;
  }

  return !value.startsWith(ADMIN_LOGIN_PATH);
}

export function getSafeAdminRedirect(
  value: string | null | undefined,
  fallback = DEFAULT_ADMIN_REDIRECT,
): string {
  return isSafeAdminRedirect(value) ? value : fallback;
}

export function normalizeRedirectPath(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  if (!value.startsWith("http://") && !value.startsWith("https://")) {
    return value;
  }

  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function buildAdminLoginRedirect(nextPath: string) {
  const searchParams = new URLSearchParams({
    reason: AUTH_REQUIRED_REASON,
  });

  if (isSafeAdminRedirect(nextPath)) {
    searchParams.set("next", nextPath);
  }

  return `${ADMIN_LOGIN_PATH}?${searchParams.toString()}`;
}
