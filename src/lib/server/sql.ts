export function buildDeletedAtClause(
  deleted: "all" | "only" | "exclude" = "exclude",
  column = "deleted_at",
) {
  if (deleted === "all") {
    return { clause: "", params: [] as unknown[] };
  }

  if (deleted === "only") {
    return { clause: ` AND ${column} IS NOT NULL`, params: [] as unknown[] };
  }

  return { clause: ` AND ${column} IS NULL`, params: [] as unknown[] };
}

export function extractString(value: string | null | undefined) {
  if (value == null) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
