"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArtistsForm } from "@/components/admin/artists-form";
import { PageTitle } from "@/components/admin/page-title";
import { requestJson } from "@/lib/client/admin-api";

type Artist = {
  id: number;
  name_ko: string;
  name_en: string;
  type: "COMPANY" | "INDIVIDUAL";
};

export default function EditArtistPage() {
  const params = useParams<{ id: string }>();
  const [artist, setArtist] = useState<Artist | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const id = Array.isArray(params.id) ? params.id[0] : params.id;
    if (!id) return;

    const fetchArtist = async () => {
      try {
        const response = await requestJson<Artist>(`/api/admin/artists/${id}`);
        setArtist(response);
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "조회 실패");
      }
    };

    void fetchArtist();
  }, [params.id]);

  return (
    <div>
      <PageTitle title="작가 수정" description="작가 정보를 수정합니다." />
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      {artist ? <ArtistsForm mode="edit" initialData={artist} /> : <p>로딩 중...</p>}
    </div>
  );
}
