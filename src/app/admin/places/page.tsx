"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PageTitle } from "@/components/admin/page-title";
import { PaginationControls } from "@/components/admin/pagination-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildQuery,
  requestJson,
  requestJsonWithMeta,
} from "@/lib/client/admin-api";
import { confirmAction } from "@/lib/client/confirm-action";

type Place = {
  id: number;
  zone_id: number | null;
  zone_name_ko: string | null;
  name_ko: string;
  name_en: string;
  address: string | null;
  lat: number;
  lng: number;
  deleted_at: string | null;
};

type ZoneOption = {
  id: number;
  name_ko: string;
};

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export default function PlacesPage() {
  const [items, setItems] = useState<Place[]>([]);
  const [zones, setZones] = useState<ZoneOption[]>([]);
  const [query, setQuery] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [deleted, setDeleted] = useState<"exclude" | "only" | "all">("exclude");
  const [page, setPage] = useState(1);
  const [size] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");

  const queryString = useMemo(
    () =>
      buildQuery({
        query,
        zoneId,
        deleted,
        page,
        size,
      }),
    [deleted, page, query, size, zoneId],
  );

  const fetchItems = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await requestJsonWithMeta<Place[]>(
        `/api/admin/places?${queryString}`,
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
    const fetchZones = async () => {
      try {
        const response = await requestJson<ZoneOption[]>("/api/admin/zones");
        setZones(response);
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "권역 조회 실패");
      }
    };

    void fetchZones();
  }, []);

  useEffect(() => {
    void fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString]);

  const mutateDelete = async (id: number, restore: boolean) => {
    const confirmed = confirmAction(
      restore ? "이 장소를 복구하시겠습니까?" : "이 장소를 삭제하시겠습니까?",
    );
    if (!confirmed) {
      return;
    }

    setActionError("");

    try {
      await requestJson(`/api/admin/places/${id}/${restore ? "restore" : "soft-delete"}`, {
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
        title="Places"
        description="장소를 생성/수정/삭제/복구합니다."
        ctaHref="/admin/places/new"
        ctaLabel="새 장소"
      />

      <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-5">
        <Input
          value={query}
          onChange={(event) => {
            setPage(1);
            setQuery(event.target.value);
          }}
          placeholder="검색어"
        />
        <select
          className={selectClassName}
          value={zoneId}
          onChange={(event) => {
            setPage(1);
            setZoneId(event.target.value);
          }}
        >
          <option value="">권역 전체</option>
          {zones.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.name_ko}
            </option>
          ))}
        </select>
        <select
          className={selectClassName}
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
              <th className="px-3 py-2 text-left">이름(한글)</th>
              <th className="px-3 py-2 text-left">이름(영문)</th>
              <th className="px-3 py-2 text-left">권역</th>
              <th className="px-3 py-2 text-left">주소</th>
              <th className="px-3 py-2 text-left">위도</th>
              <th className="px-3 py-2 text-left">경도</th>
              <th className="px-3 py-2 text-left">삭제</th>
              <th className="px-3 py-2 text-left">관리</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                  로딩 중...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                  데이터가 없습니다.
                </td>
              </tr>
            ) : (
              items.map((place) => (
                <tr key={place.id} className="border-t">
                  <td className="px-3 py-2">{place.id}</td>
                  <td className="px-3 py-2">{place.name_ko}</td>
                  <td className="px-3 py-2">{place.name_en}</td>
                  <td className="px-3 py-2">{place.zone_name_ko ?? "-"}</td>
                  <td className="px-3 py-2">{place.address ?? "-"}</td>
                  <td className="px-3 py-2">{place.lat.toFixed(7)}</td>
                  <td className="px-3 py-2">{place.lng.toFixed(7)}</td>
                  <td className="px-3 py-2">{place.deleted_at ? "Y" : "N"}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/admin/places/${place.id}`}>수정</Link>
                      </Button>
                      {place.deleted_at ? (
                        <Button size="sm" onClick={() => void mutateDelete(place.id, true)}>
                          복구
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => void mutateDelete(place.id, false)}
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
