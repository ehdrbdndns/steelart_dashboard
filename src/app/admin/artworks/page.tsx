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

type Artwork = {
  id: number;
  title_ko: string;
  title_en: string;
  artist_name_ko: string;
  place_name_ko: string;
  category: string;
  production_year: number;
  deleted_at: string | null;
};

type Option = { id: number; name_ko: string };

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
        title="Artworks"
        description="작품과 미디어 URL을 관리합니다."
        ctaHref="/admin/artworks/new"
        ctaLabel="새 작품"
      />

      <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-4 xl:grid-cols-8">
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
          value={category}
          onChange={(event) => {
            setPage(1);
            setCategory(event.target.value);
          }}
          className="rounded-md border px-3 py-2"
        >
          <option value="">category 전체</option>
          <option value="STEEL_ART">STEEL_ART</option>
          <option value="PUBLIC_ART">PUBLIC_ART</option>
        </select>
        <select
          value={artistId}
          onChange={(event) => {
            setPage(1);
            setArtistId(event.target.value);
          }}
          className="rounded-md border px-3 py-2"
        >
          <option value="">artist</option>
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
          className="rounded-md border px-3 py-2"
        >
          <option value="">zone</option>
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
          className="rounded-md border px-3 py-2"
        >
          <option value="">place</option>
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
          className="rounded-md border px-3 py-2"
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
              <th className="px-3 py-2 text-left">title_ko</th>
              <th className="px-3 py-2 text-left">artist</th>
              <th className="px-3 py-2 text-left">place</th>
              <th className="px-3 py-2 text-left">category</th>
              <th className="px-3 py-2 text-left">year</th>
              <th className="px-3 py-2 text-left">deleted</th>
              <th className="px-3 py-2 text-left">actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">로딩 중...</td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">데이터가 없습니다.</td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="px-3 py-2">{item.id}</td>
                  <td className="px-3 py-2">{item.title_ko}</td>
                  <td className="px-3 py-2">{item.artist_name_ko}</td>
                  <td className="px-3 py-2">{item.place_name_ko}</td>
                  <td className="px-3 py-2">{item.category}</td>
                  <td className="px-3 py-2">{item.production_year}</td>
                  <td className="px-3 py-2">{item.deleted_at ? "Y" : "N"}</td>
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
