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
import { confirmAction } from "@/lib/client/confirm-action";

type Course = {
  id: number;
  title_ko: string;
  title_en: string;
  is_official: number;
  deleted_at: string | null;
  updated_at: string;
};

export default function CoursesPage() {
  const [items, setItems] = useState<Course[]>([]);
  const [query, setQuery] = useState("");
  const [isOfficial, setIsOfficial] = useState("");
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
        isOfficial,
        deleted,
        page,
        size,
      }),
    [deleted, isOfficial, page, query, size],
  );

  const fetchItems = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await requestJsonWithMeta<Course[]>(
        `/api/admin/courses?${queryString}`,
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
    const confirmed = confirmAction(
      restore ? "이 코스를 복구하시겠습니까?" : "이 코스를 삭제하시겠습니까?",
    );
    if (!confirmed) {
      return;
    }

    setActionError("");

    try {
      await requestJson(`/api/admin/courses/${id}/${restore ? "restore" : "soft-delete"}`, {
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
        title="Courses"
        description="코스를 생성/수정/삭제하고 아이템 순서를 관리합니다."
        ctaHref="/admin/courses/new"
        ctaLabel="새 코스"
      />

      <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-5">
        <input
          className="rounded-md border px-3 py-2"
          placeholder="검색어"
          value={query}
          onChange={(event) => {
            setPage(1);
            setQuery(event.target.value);
          }}
        />
        <select
          className="rounded-md border px-3 py-2"
          value={isOfficial}
          onChange={(event) => {
            setPage(1);
            setIsOfficial(event.target.value);
          }}
        >
          <option value="">is_official 전체</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
        <select
          className="rounded-md border px-3 py-2"
          value={deleted}
          onChange={(event) => {
            setPage(1);
            setDeleted(event.target.value as "exclude" | "only" | "all");
          }}
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
              <th className="px-3 py-2 text-left">title_ko</th>
              <th className="px-3 py-2 text-left">is_official</th>
              <th className="px-3 py-2 text-left">deleted</th>
              <th className="px-3 py-2 text-left">actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">로딩 중...</td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">데이터가 없습니다.</td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="px-3 py-2">{item.id}</td>
                  <td className="px-3 py-2">{item.title_ko}</td>
                  <td className="px-3 py-2">{item.is_official ? "Y" : "N"}</td>
                  <td className="px-3 py-2">{item.deleted_at ? "Y" : "N"}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/admin/courses/${item.id}`}>수정</Link>
                      </Button>
                      {item.deleted_at ? (
                        <Button size="sm" onClick={() => void mutateDelete(item.id, true)}>복구</Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => void mutateDelete(item.id, false)}
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

      <PaginationControls page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
