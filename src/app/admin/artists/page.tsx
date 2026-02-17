"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PageTitle } from "@/components/admin/page-title";
import { PaginationControls } from "@/components/admin/pagination-controls";
import { Button } from "@/components/ui/button";
import {
  buildQuery,
  requestJson,
  requestJsonWithMeta,
} from "@/lib/client/admin-api";

type Artist = {
  id: number;
  name_ko: string;
  name_en: string;
  type: "COMPANY" | "INDIVIDUAL";
  deleted_at: string | null;
  updated_at: string;
};

export default function ArtistsPage() {
  const [items, setItems] = useState<Artist[]>([]);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [deleted, setDeleted] = useState<"exclude" | "only" | "all">("exclude");
  const [page, setPage] = useState(1);
  const [size] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [totalPages, setTotalPages] = useState(1);

  const queryString = useMemo(
    () =>
      buildQuery({
        query,
        type,
        deleted,
        page,
        size,
      }),
    [deleted, page, query, size, type],
  );

  const fetchItems = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await requestJsonWithMeta<Artist[]>(
        `/api/admin/artists?${queryString}`,
      );
      setItems(response.data);
      setTotalPages(response.meta?.totalPages ?? 1);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString]);

  const mutateDelete = async (id: number, restore: boolean) => {
    setActionError("");

    try {
      await requestJson(`/api/admin/artists/${id}/${restore ? "restore" : "soft-delete"}`, {
        method: "POST",
      });
      await fetchItems();
    } catch (mutationError) {
      setActionError(
        mutationError instanceof Error ? mutationError.message : "처리 실패",
      );
    }
  };

  return (
    <div>
      <PageTitle
        title="Artists"
        description="작가를 생성/수정/삭제/복구합니다."
        ctaHref="/admin/artists/new"
        ctaLabel="새 작가"
      />

      <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-4">
        <input
          value={query}
          onChange={(event) => {
            setPage(1);
            setQuery(event.target.value);
          }}
          className="rounded-md border px-3 py-2"
          placeholder="검색어"
        />
        <select
          value={type}
          onChange={(event) => {
            setPage(1);
            setType(event.target.value);
          }}
          className="rounded-md border px-3 py-2"
        >
          <option value="">type 전체</option>
          <option value="COMPANY">COMPANY</option>
          <option value="INDIVIDUAL">INDIVIDUAL</option>
        </select>
        <select
          value={deleted}
          onChange={(event) => {
            setPage(1);
            setDeleted(event.target.value as "exclude" | "only" | "all");
          }}
          className="rounded-md border px-3 py-2"
        >
          <option value="exclude">삭제 제외</option>
          <option value="only">삭제만</option>
          <option value="all">전체</option>
        </select>
        <Button type="button" variant="outline" onClick={() => void fetchItems()}>
          조회
        </Button>
      </div>

      {error ? <p className="mb-4 text-sm text-red-500">{error}</p> : null}
      {actionError ? <p className="mb-4 text-sm text-red-500">{actionError}</p> : null}

      <div className="overflow-hidden rounded-md border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900">
            <tr>
              <th className="px-3 py-2 text-left">ID</th>
              <th className="px-3 py-2 text-left">name_ko</th>
              <th className="px-3 py-2 text-left">name_en</th>
              <th className="px-3 py-2 text-left">type</th>
              <th className="px-3 py-2 text-left">deleted</th>
              <th className="px-3 py-2 text-left">actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  로딩 중...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  데이터가 없습니다.
                </td>
              </tr>
            ) : (
              items.map((artist) => (
                <tr key={artist.id} className="border-t">
                  <td className="px-3 py-2">{artist.id}</td>
                  <td className="px-3 py-2">{artist.name_ko}</td>
                  <td className="px-3 py-2">{artist.name_en}</td>
                  <td className="px-3 py-2">{artist.type}</td>
                  <td className="px-3 py-2">{artist.deleted_at ? "Y" : "N"}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/admin/artists/${artist.id}`}>수정</Link>
                      </Button>
                      {artist.deleted_at ? (
                        <Button
                          size="sm"
                          onClick={() => void mutateDelete(artist.id, true)}
                        >
                          복구
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => void mutateDelete(artist.id, false)}
                        >
                          삭제
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <PaginationControls
        page={page}
        totalPages={totalPages}
        onPageChange={(next) => setPage(next)}
      />
    </div>
  );
}
