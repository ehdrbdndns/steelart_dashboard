"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { requestJson, requestJsonWithMeta } from "@/lib/client/admin-api";
import { artworkCategorySchema } from "@/lib/server/validators/admin";

const schema = z.object({
  title_ko: z.string().min(1),
  title_en: z.string().min(1),
  artist_id: z.number().int().positive(),
  place_id: z.number().int().positive(),
  category: artworkCategorySchema,
  production_year: z.number().int().positive(),
  size_text_ko: z.string().min(1),
  size_text_en: z.string().min(1),
  description_ko: z.string().min(1),
  description_en: z.string().min(1),
});

type FormValues = z.infer<typeof schema>;

type SelectOption = {
  id: number;
  name_ko: string;
};

export function ArtworksForm({
  mode,
  initialData,
  onSaved,
}: {
  mode: "create" | "edit";
  initialData?: Partial<FormValues> & { id?: number };
  onSaved: () => void;
}) {
  const [artists, setArtists] = useState<SelectOption[]>([]);
  const [places, setPlaces] = useState<SelectOption[]>([]);
  const [error, setError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title_ko: initialData?.title_ko ?? "",
      title_en: initialData?.title_en ?? "",
      artist_id: initialData?.artist_id ?? 0,
      place_id: initialData?.place_id ?? 0,
      category: initialData?.category ?? "STEEL_ART",
      production_year: initialData?.production_year ?? new Date().getFullYear(),
      size_text_ko: initialData?.size_text_ko ?? "",
      size_text_en: initialData?.size_text_en ?? "",
      description_ko: initialData?.description_ko ?? "",
      description_en: initialData?.description_en ?? "",
    },
  });

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const [artistsResponse, placesResponse] = await Promise.all([
          requestJsonWithMeta<SelectOption[]>(
            "/api/admin/artists?deleted=exclude&page=1&size=100",
          ),
          requestJson<SelectOption[]>("/api/admin/places?deleted=exclude"),
        ]);

        setArtists(artistsResponse.data);
        setPlaces(placesResponse);
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "옵션 조회 실패");
      }
    };

    void fetchOptions();
  }, []);

  const onSubmit = async (values: FormValues) => {
    setError("");

    try {
      if (mode === "create") {
        await requestJson("/api/admin/artworks", {
          method: "POST",
          body: JSON.stringify(values),
        });
      } else {
        await requestJson(`/api/admin/artworks/${initialData?.id ?? 0}`, {
          method: "PUT",
          body: JSON.stringify(values),
        });
      }

      onSaved();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "저장 실패");
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
      <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        파일 업로드는 AWS 준비 후 활성화됩니다. 현재는 서버가 목업 미디어 URL을 자동으로 저장합니다.
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm font-medium">title_ko</label>
          <input className="w-full rounded-md border px-3 py-2" {...register("title_ko")} />
          {errors.title_ko ? <p className="text-sm text-red-500">필수 입력입니다.</p> : null}
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">title_en</label>
          <input className="w-full rounded-md border px-3 py-2" {...register("title_en")} />
          {errors.title_en ? <p className="text-sm text-red-500">필수 입력입니다.</p> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm font-medium">artist_id</label>
          <select
            className="w-full rounded-md border px-3 py-2"
            {...register("artist_id", { valueAsNumber: true })}
          >
            <option value="0">선택</option>
            {artists.map((artist) => (
              <option key={artist.id} value={artist.id}>
                {artist.name_ko}
              </option>
            ))}
          </select>
          {errors.artist_id ? <p className="text-sm text-red-500">필수 입력입니다.</p> : null}
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">place_id</label>
          <select
            className="w-full rounded-md border px-3 py-2"
            {...register("place_id", { valueAsNumber: true })}
          >
            <option value="0">선택</option>
            {places.map((place) => (
              <option key={place.id} value={place.id}>
                {place.name_ko}
              </option>
            ))}
          </select>
          {errors.place_id ? <p className="text-sm text-red-500">필수 입력입니다.</p> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm font-medium">category</label>
          <select className="w-full rounded-md border px-3 py-2" {...register("category")}>
            <option value="STEEL_ART">STEEL_ART</option>
            <option value="PUBLIC_ART">PUBLIC_ART</option>
          </select>
          {errors.category ? <p className="text-sm text-red-500">필수 입력입니다.</p> : null}
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">production_year</label>
          <input
            type="number"
            className="w-full rounded-md border px-3 py-2"
            {...register("production_year", { valueAsNumber: true })}
          />
          {errors.production_year ? <p className="text-sm text-red-500">필수 입력입니다.</p> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm font-medium">size_text_ko</label>
          <input className="w-full rounded-md border px-3 py-2" {...register("size_text_ko")} />
          {errors.size_text_ko ? <p className="text-sm text-red-500">필수 입력입니다.</p> : null}
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">size_text_en</label>
          <input className="w-full rounded-md border px-3 py-2" {...register("size_text_en")} />
          {errors.size_text_en ? <p className="text-sm text-red-500">필수 입력입니다.</p> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm font-medium">description_ko</label>
          <textarea
            className="w-full rounded-md border px-3 py-2"
            rows={4}
            {...register("description_ko")}
          />
          {errors.description_ko ? <p className="text-sm text-red-500">필수 입력입니다.</p> : null}
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">description_en</label>
          <textarea
            className="w-full rounded-md border px-3 py-2"
            rows={4}
            {...register("description_en")}
          />
          {errors.description_en ? <p className="text-sm text-red-500">필수 입력입니다.</p> : null}
        </div>
      </div>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "저장 중..." : "저장"}
      </Button>
    </form>
  );
}
