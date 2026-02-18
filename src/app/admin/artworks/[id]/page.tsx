"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArtworksForm } from "@/components/admin/artworks-form";
import { PageTitle } from "@/components/admin/page-title";
import { requestJson } from "@/lib/client/admin-api";

type Artwork = {
  id: number;
  title_ko: string;
  title_en: string;
  artist_id: number;
  place_id: number;
  category: "STEEL_ART" | "PUBLIC_ART";
  production_year: number;
  size_text_ko: string;
  size_text_en: string;
  description_ko: string;
  description_en: string;
  photo_day_url: string;
  photo_night_url: string;
  audio_url_ko: string | null;
  audio_url_en: string | null;
};

export default function EditArtworkPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<Artwork | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const id = Array.isArray(params.id) ? params.id[0] : params.id;
    if (!id) return;

    const fetchArtwork = async () => {
      try {
        const response = await requestJson<Artwork>(`/api/admin/artworks/${id}`);
        setItem(response);
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "조회 실패");
      }
    };

    void fetchArtwork();
  }, [params.id]);

  return (
    <div>
      <PageTitle title="작품 수정" description="작품 정보를 수정합니다." />
      {error ? <p className="mb-4 text-sm text-red-500">{error}</p> : null}
      {item ? (
        <ArtworksForm
          mode="edit"
          initialData={item}
          onSaved={() => router.push("/admin/artworks")}
        />
      ) : (
        <p>로딩 중...</p>
      )}
    </div>
  );
}
