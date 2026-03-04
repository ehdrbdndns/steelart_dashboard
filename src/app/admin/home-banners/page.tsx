"use client";

import { useCallback, useEffect, useState } from "react";
import { FileUploadField } from "@/components/admin/file-upload-field";
import { PageTitle } from "@/components/admin/page-title";
import { Button } from "@/components/ui/button";
import { requestJson } from "@/lib/client/admin-api";
import { confirmAction } from "@/lib/client/confirm-action";

type Banner = {
  id: number;
  banner_image_url: string | null;
  display_order: number;
  is_active: number;
  created_at: string;
  updated_at: string;
};

export default function HomeBannersPage() {
  const [items, setItems] = useState<Banner[]>([]);
  const [createBannerImageUrl, setCreateBannerImageUrl] = useState("");
  const [imageDrafts, setImageDrafts] = useState<Record<number, string>>({});
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [loading, setLoading] = useState(false);

  const syncImageDrafts = (banners: Banner[]) => {
    setImageDrafts((previous) => {
      const next: Record<number, string> = {};

      for (const banner of banners) {
        const existingDraft = previous[banner.id];
        next[banner.id] = existingDraft ?? (banner.banner_image_url ?? "");
      }

      return next;
    });
  };

  const fetchBanners = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await requestJson<Banner[]>("/api/admin/home-banners");
      setItems(response);
      syncImageDrafts(response);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchBanners();
  }, [fetchBanners]);

  const handleCreate = async () => {
    const normalizedImageUrl = createBannerImageUrl.trim();

    if (!normalizedImageUrl) {
      setActionError("배너 이미지를 업로드하거나 URL을 입력하세요.");
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
          banner_image_url: normalizedImageUrl,
          is_active: isActive,
        }),
      });
      setCreateBannerImageUrl("");
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

  const mutateReplaceImage = async (id: number) => {
    const normalizedImageUrl = (imageDrafts[id] ?? "").trim();

    if (!normalizedImageUrl) {
      setActionError("교체할 배너 이미지 URL이 비어 있습니다.");
      return;
    }

    if (!confirmAction("이 배너 이미지를 교체하시겠습니까?")) {
      return;
    }

    setActionError("");

    try {
      await requestJson(`/api/admin/home-banners/${id}/image`, {
        method: "PATCH",
        body: JSON.stringify({ banner_image_url: normalizedImageUrl }),
      });
      await fetchBanners();
    } catch (replaceError) {
      setActionError(replaceError instanceof Error ? replaceError.message : "이미지 교체 실패");
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
        description="홈 배너를 이미지 업로드 기반으로 추가/교체/정렬/활성화/삭제합니다. 삭제는 복구 불가(하드 삭제)입니다."
      />

      <div className="mb-4 rounded-md border p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <FileUploadField
            label="새 배너 이미지"
            value={createBannerImageUrl}
            folder="home-banners"
            accept="image/*"
            required
            onChange={setCreateBannerImageUrl}
          />
          <div className="flex flex-col justify-between gap-3">
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
        </div>
      </div>

      {error ? <p className="mb-4 text-sm text-red-500">{error}</p> : null}
      {actionError ? <p className="mb-4 text-sm text-red-500">{actionError}</p> : null}

      <div className="overflow-hidden rounded-md border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900">
            <tr>
              <th className="px-3 py-2 text-left">order</th>
              <th className="px-3 py-2 text-left">ID</th>
              <th className="px-3 py-2 text-left">image</th>
              <th className="px-3 py-2 text-left">is_active</th>
              <th className="px-3 py-2 text-left">actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  로딩 중...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  데이터가 없습니다.
                </td>
              </tr>
            ) : (
              items.map((item, index) => (
                <tr key={item.id} className="border-t align-top">
                  <td className="px-3 py-2">{item.display_order}</td>
                  <td className="px-3 py-2">{item.id}</td>
                  <td className="px-3 py-2">
                    {item.banner_image_url ? (
                      <div className="space-y-2">
                        <div className="h-20 w-20 overflow-hidden rounded-md border bg-muted/20">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={item.banner_image_url}
                            alt={`banner-${item.id}`}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <p className="max-w-xs break-all text-xs text-muted-foreground">
                          {item.banner_image_url}
                        </p>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">미등록</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{item.is_active ? "Y" : "N"}</td>
                  <td className="px-3 py-2">
                    <div className="space-y-3">
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

                      <div className="rounded-md border p-2">
                        <FileUploadField
                          label={`배너 이미지 교체 #${item.id}`}
                          value={imageDrafts[item.id] ?? ""}
                          folder="home-banners"
                          accept="image/*"
                          onChange={(value) =>
                            setImageDrafts((previous) => ({
                              ...previous,
                              [item.id]: value,
                            }))
                          }
                        />
                        <Button
                          type="button"
                          size="sm"
                          className="mt-2"
                          onClick={() => void mutateReplaceImage(item.id)}
                        >
                          이미지 교체 저장
                        </Button>
                      </div>
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
