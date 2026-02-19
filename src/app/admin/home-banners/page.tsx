"use client";

import { useEffect, useState } from "react";
import { PageTitle } from "@/components/admin/page-title";
import { Button } from "@/components/ui/button";
import { requestJson, requestJsonWithMeta } from "@/lib/client/admin-api";
import { confirmAction } from "@/lib/client/confirm-action";

type Banner = {
  id: number;
  artwork_id: number;
  title_ko: string;
  display_order: number;
  is_active: number;
};

type ArtworkOption = {
  id: number;
  title_ko: string;
};

export default function HomeBannersPage() {
  const [items, setItems] = useState<Banner[]>([]);
  const [artworks, setArtworks] = useState<ArtworkOption[]>([]);
  const [selectedArtworkId, setSelectedArtworkId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchBanners = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await requestJson<Banner[]>("/api/admin/home-banners");
      setItems(response);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  };

  const fetchArtworks = async () => {
    try {
      const response = await requestJsonWithMeta<ArtworkOption[]>(
        "/api/admin/artworks?deleted=exclude&page=1&size=100",
      );
      setArtworks(response.data);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "작품 조회 실패");
    }
  };

  useEffect(() => {
    void fetchBanners();
    void fetchArtworks();
  }, []);

  const handleCreate = async () => {
    if (!selectedArtworkId) {
      setActionError("작품을 선택하세요.");
      return;
    }
    if (!confirmAction("홈 배너를 추가하시겠습니까?")) {
      return;
    }

    setActionError("");

    try {
      await requestJson("/api/admin/home-banners", {
        method: "POST",
        body: JSON.stringify({
          artwork_id: Number(selectedArtworkId),
          is_active: isActive,
        }),
      });
      setSelectedArtworkId("");
      await fetchBanners();
    } catch (createError) {
      setActionError(createError instanceof Error ? createError.message : "추가 실패");
    }
  };

  const mutateToggle = async (id: number, nextValue: boolean) => {
    if (
      !confirmAction(
        nextValue
          ? "이 배너를 활성화하시겠습니까?"
          : "이 배너를 비활성화하시겠습니까?",
      )
    ) {
      return;
    }

    setActionError("");

    try {
      await requestJson(`/api/admin/home-banners/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: nextValue }),
      });
      await fetchBanners();
    } catch (toggleError) {
      setActionError(toggleError instanceof Error ? toggleError.message : "수정 실패");
    }
  };

  const mutateDelete = async (id: number) => {
    if (!confirmAction("이 배너를 삭제하시겠습니까? 삭제 후 복구할 수 없습니다.")) {
      return;
    }

    setActionError("");

    try {
      await requestJson(`/api/admin/home-banners/${id}`, {
        method: "DELETE",
      });
      await fetchBanners();
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : "삭제 실패");
    }
  };

  const mutateReorder = async (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= items.length) {
      return;
    }
    if (!confirmAction("배너 순서를 변경하시겠습니까?")) {
      return;
    }

    const next = [...items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);

    setActionError("");

    try {
      await requestJson("/api/admin/home-banners/reorder", {
        method: "PATCH",
        body: JSON.stringify({
          items: next.map((item, index) => ({
            id: item.id,
            display_order: index + 1,
          })),
        }),
      });
      await fetchBanners();
    } catch (reorderError) {
      setActionError(reorderError instanceof Error ? reorderError.message : "정렬 실패");
      await fetchBanners();
    }
  };

  return (
    <div>
      <PageTitle
        title="Home Banners"
        description="홈 배너를 추가/정렬/활성화/삭제합니다. 삭제는 복구 불가(하드 삭제)입니다."
      />

      <div className="mb-4 grid grid-cols-1 gap-2 rounded-md border p-4 md:grid-cols-4">
        <select
          value={selectedArtworkId}
          onChange={(event) => setSelectedArtworkId(event.target.value)}
          className="rounded-md border px-3 py-2"
        >
          <option value="">작품 선택</option>
          {artworks.map((artwork) => (
            <option key={artwork.id} value={artwork.id}>
              {artwork.title_ko}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
          />
          is_active
        </label>
        <Button type="button" onClick={() => void handleCreate()}>
          배너 추가
        </Button>
      </div>

      {error ? <p className="mb-4 text-sm text-red-500">{error}</p> : null}
      {actionError ? <p className="mb-4 text-sm text-red-500">{actionError}</p> : null}

      <div className="overflow-hidden rounded-md border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900">
            <tr>
              <th className="px-3 py-2 text-left">order</th>
              <th className="px-3 py-2 text-left">ID</th>
              <th className="px-3 py-2 text-left">artwork</th>
              <th className="px-3 py-2 text-left">is_active</th>
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
              items.map((item, index) => (
                <tr key={item.id} className="border-t">
                  <td className="px-3 py-2">{item.display_order}</td>
                  <td className="px-3 py-2">{item.id}</td>
                  <td className="px-3 py-2">{item.title_ko}</td>
                  <td className="px-3 py-2">{item.is_active ? "Y" : "N"}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void mutateReorder(index, index - 1)}
                        disabled={index === 0}
                      >
                        위로
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void mutateReorder(index, index + 1)}
                        disabled={index === items.length - 1}
                      >
                        아래로
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void mutateToggle(item.id, !item.is_active)}
                      >
                        {item.is_active ? "비활성" : "활성"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() => void mutateDelete(item.id)}
                      >
                        삭제
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
