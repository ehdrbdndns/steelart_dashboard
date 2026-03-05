"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PageTitle } from "@/components/admin/page-title";
import { PaginationControls } from "@/components/admin/pagination-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildQuery,
  requestJson,
  requestJsonWithMeta,
} from "@/lib/client/admin-api";
import { confirmAction } from "@/lib/client/confirm-action";

type Artwork = {
  id: number;
  title_ko: string;
  title_en: string;
  artist_name_ko: string;
  place_name_ko: string;
  category: string;
  production_year: number | null;
  thumbnail_image_url: string | null;
  festival_years_summary: string | null;
  deleted_at: string | null;
};

type Option = { id: number; name_ko: string };

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

function getCategoryLabel(category: string) {
  if (category === "STEEL_ART") {
    return "스틸아트";
  }

  if (category === "PUBLIC_ART") {
    return "공공미술";
  }

  return category;
}

export default function ArtworksPage() {
  const [items, setItems] = useState<Artwork[]>([]);
  const [artists, setArtists] = useState<Option[]>([]);
  const [places, setPlaces] = useState<Option[]>([]);
  const [zones, setZones] = useState<Option[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [artistId, setArtistId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [placeId, setPlaceId] = useState("");
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
        category,
        artistId,
        zoneId,
        placeId,
        deleted,
        page,
        size,
      }),
    [artistId, category, deleted, page, placeId, query, size, zoneId],
  );

  const fetchData = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await requestJsonWithMeta<Artwork[]>(
        `/api/admin/artworks?${queryString}`,
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
    const fetchOptions = async () => {
      try {
        const [artistsResponse, placesResponse, zonesResponse] = await Promise.all([
          requestJsonWithMeta<Option[]>(
            "/api/admin/artists?deleted=exclude&page=1&size=100",
          ),
          requestJson<Option[]>("/api/admin/places?deleted=exclude"),
          requestJson<Option[]>("/api/admin/zones"),
        ]);

        setArtists(artistsResponse.data);
        setPlaces(placesResponse);
        setZones(zonesResponse);
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "옵션 조회 실패");
      }
    };

    void fetchOptions();
  }, []);

  useEffect(() => {
    void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString]);

  const mutateDelete = async (id: number, restore: boolean) => {
    const confirmed = confirmAction(
      restore ? "이 작품을 복구하시겠습니까?" : "이 작품을 삭제하시겠습니까?",
    );
    if (!confirmed) {
      return;
    }

    setActionError("");

    try {
      await requestJson(`/api/admin/artworks/${id}/${restore ? "restore" : "soft-delete"}`, {
        method: "POST",
      });
      await fetchData();
    } catch (mutationError) {
      setActionError(
        mutationError instanceof Error ? mutationError.message : "처리 실패",
      );
    }
  };

  return (
    <div>
      <PageTitle
        title="작품 관리"
        description="작품 정보와 이미지를 관리합니다."
        ctaHref="/admin/artworks/new"
        ctaLabel="새 작품"
      />

      <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-4 xl:grid-cols-8">
        <Input
          value={query}
          onChange={(event) => {
            setPage(1);
            setQuery(event.target.value);
          }}
          placeholder="검색어"
        />
        <select
          value={category}
          onChange={(event) => {
            setPage(1);
            setCategory(event.target.value);
          }}
          className={selectClassName}
        >
          <option value="">작품 유형 전체</option>
          <option value="STEEL_ART">스틸아트</option>
          <option value="PUBLIC_ART">공공미술</option>
        </select>
        <select
          value={artistId}
          onChange={(event) => {
            setPage(1);
            setArtistId(event.target.value);
          }}
          className={selectClassName}
        >
          <option value="">작가 전체</option>
          {artists.map((artist) => (
            <option key={artist.id} value={artist.id}>{artist.name_ko}</option>
          ))}
        </select>
        <select
          value={zoneId}
          onChange={(event) => {
            setPage(1);
            setZoneId(event.target.value);
          }}
          className={selectClassName}
        >
          <option value="">권역 전체</option>
          {zones.map((zone) => (
            <option key={zone.id} value={zone.id}>{zone.name_ko}</option>
          ))}
        </select>
        <select
          value={placeId}
          onChange={(event) => {
            setPage(1);
            setPlaceId(event.target.value);
          }}
          className={selectClassName}
        >
          <option value="">장소 전체</option>
          {places.map((place) => (
            <option key={place.id} value={place.id}>{place.name_ko}</option>
          ))}
        </select>
        <select
          value={deleted}
          onChange={(event) => {
            setPage(1);
            setDeleted(event.target.value as "exclude" | "only" | "all");
          }}
          className={selectClassName}
        >
          <option value="exclude">삭제 제외</option>
          <option value="only">삭제만</option>
          <option value="all">전체</option>
        </select>
        <Button type="button" variant="outline" onClick={() => void fetchData()}>
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
              <th className="px-3 py-2 text-left">대표 이미지</th>
              <th className="px-3 py-2 text-left">작품명</th>
              <th className="px-3 py-2 text-left">작가</th>
              <th className="px-3 py-2 text-left">설치 장소</th>
              <th className="px-3 py-2 text-left">작품 유형</th>
              <th className="px-3 py-2 text-left">제작 연도</th>
              <th className="px-3 py-2 text-left">축제 참여 연도</th>
              <th className="px-3 py-2 text-left">상태</th>
              <th className="px-3 py-2 text-left">관리</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">로딩 중...</td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">데이터가 없습니다.</td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t align-top">
                  <td className="px-3 py-2">{item.id}</td>
                  <td className="px-3 py-2">
                    {item.thumbnail_image_url ? (
                      <div className="h-14 w-20 overflow-hidden rounded-md border bg-muted/20">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.thumbnail_image_url}
                          alt={`artwork-${item.id}-thumbnail`}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">미등록</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{item.title_ko}</td>
                  <td className="px-3 py-2">{item.artist_name_ko}</td>
                  <td className="px-3 py-2">{item.place_name_ko}</td>
                  <td className="px-3 py-2">{getCategoryLabel(item.category)}</td>
                  <td className="px-3 py-2">{item.production_year ?? "-"}</td>
                  <td className="px-3 py-2">{item.festival_years_summary ?? "-"}</td>
                  <td className="px-3 py-2">
                    {item.deleted_at ? (
                      <Badge variant="destructive">삭제됨</Badge>
                    ) : (
                      <Badge variant="secondary">활성</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/admin/artworks/${item.id}`}>수정</Link>
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
