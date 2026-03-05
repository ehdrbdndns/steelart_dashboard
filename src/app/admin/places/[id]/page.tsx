"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PlacesForm, type PlaceInitialData } from "@/components/admin/places-form";
import { PageTitle } from "@/components/admin/page-title";
import { requestJson } from "@/lib/client/admin-api";

export default function EditPlacePage() {
  const params = useParams<{ id: string }>();
  const [place, setPlace] = useState<PlaceInitialData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const id = Array.isArray(params.id) ? params.id[0] : params.id;
    if (!id) {
      return;
    }

    const fetchPlace = async () => {
      try {
        const response = await requestJson<PlaceInitialData>(`/api/admin/places/${id}`);
        setPlace(response);
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "조회 실패");
      }
    };

    void fetchPlace();
  }, [params.id]);

  return (
    <div>
      <PageTitle title="장소 수정" description="장소 정보를 수정합니다." />
      {error ? <p className="mb-4 text-sm text-red-500">{error}</p> : null}
      {place ? <PlacesForm mode="edit" initialData={place} /> : <p>로딩 중...</p>}
    </div>
  );
}
