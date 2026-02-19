"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { FileUploadField } from "@/components/admin/file-upload-field";
import { Button } from "@/components/ui/button";
import { requestJson, requestJsonWithMeta } from "@/lib/client/admin-api";
import { confirmAction } from "@/lib/client/confirm-action";
import { artworkCategorySchema } from "@/lib/server/validators/admin";

const optionalUrlSchema = z
  .string()
  .trim()
  .refine(
    (value) => value.length === 0 || z.string().url().safeParse(value).success,
    "유효한 URL이어야 합니다.",
  );

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
  photo_day_url: optionalUrlSchema,
  photo_night_url: optionalUrlSchema,
  audio_url_ko: optionalUrlSchema,
  audio_url_en: optionalUrlSchema,
});

type FormValues = z.infer<typeof schema>;
type MediaFieldKey =
  | "photo_day_url"
  | "photo_night_url"
  | "audio_url_ko"
  | "audio_url_en";

type ArtworkInitialData = {
  id?: number;
  title_ko?: string;
  title_en?: string;
  artist_id?: number;
  place_id?: number;
  category?: "STEEL_ART" | "PUBLIC_ART";
  production_year?: number;
  size_text_ko?: string;
  size_text_en?: string;
  description_ko?: string;
  description_en?: string;
  photo_day_url?: string | null;
  photo_night_url?: string | null;
  audio_url_ko?: string | null;
  audio_url_en?: string | null;
};

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
  initialData?: ArtworkInitialData;
  onSaved: () => void;
}) {
  const [artists, setArtists] = useState<SelectOption[]>([]);
  const [places, setPlaces] = useState<SelectOption[]>([]);
  const [error, setError] = useState("");

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title_ko: initialData?.title_ko ?? "",
      title_en: initialData?.title_en ?? "",
      artist_id: Number(initialData?.artist_id ?? 0),
      place_id: Number(initialData?.place_id ?? 0),
      category: initialData?.category ?? "STEEL_ART",
      production_year: Number(
        initialData?.production_year ?? new Date().getFullYear(),
      ),
      size_text_ko: initialData?.size_text_ko ?? "",
      size_text_en: initialData?.size_text_en ?? "",
      description_ko: initialData?.description_ko ?? "",
      description_en: initialData?.description_en ?? "",
      photo_day_url: initialData?.photo_day_url ?? "",
      photo_night_url: initialData?.photo_night_url ?? "",
      audio_url_ko: initialData?.audio_url_ko ?? "",
      audio_url_en: initialData?.audio_url_en ?? "",
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
    const requiredMediaFields: MediaFieldKey[] = [
      "photo_day_url",
      "photo_night_url",
      "audio_url_ko",
      "audio_url_en",
    ];

    if (mode === "create") {
      const hasMissingMedia = requiredMediaFields.some(
        (key) => values[key].trim().length === 0,
      );
      if (hasMissingMedia) {
        setError("생성 시 이미지/오디오 4개 파일을 모두 업로드해야 합니다.");
        return;
      }
    }

    if (
      !confirmAction(
        mode === "create"
          ? "작품을 생성하시겠습니까?"
          : "작품 정보를 저장하시겠습니까?",
      )
    ) {
      return;
    }

    try {
      const payload = {
        ...values,
        photo_day_url: values.photo_day_url.trim() || undefined,
        photo_night_url: values.photo_night_url.trim() || undefined,
        audio_url_ko: values.audio_url_ko.trim() || undefined,
        audio_url_en: values.audio_url_en.trim() || undefined,
      };

      if (mode === "create") {
        await requestJson("/api/admin/artworks", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      } else {
        await requestJson(`/api/admin/artworks/${initialData?.id ?? 0}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      }

      onSaved();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "저장 실패");
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
      <div className="rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-900">
        {mode === "create"
          ? "생성 시 이미지 2개/오디오 2개 파일 업로드가 필요합니다."
          : "수정 시 교체가 필요한 파일만 업로드하세요. 업로드하지 않은 URL은 기존값을 유지합니다."}
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <Controller
            control={control}
            name="photo_day_url"
            render={({ field }) => (
              <FileUploadField
                label="photo_day_url"
                value={typeof field.value === "string" ? field.value : ""}
                folder="artworks/photo-day"
                accept="image/*"
                required={mode === "create"}
                onChange={field.onChange}
              />
            )}
          />
          {errors.photo_day_url ? (
            <p className="text-sm text-red-500">유효한 URL이어야 합니다.</p>
          ) : null}
        </div>
        <div className="space-y-1">
          <Controller
            control={control}
            name="photo_night_url"
            render={({ field }) => (
              <FileUploadField
                label="photo_night_url"
                value={typeof field.value === "string" ? field.value : ""}
                folder="artworks/photo-night"
                accept="image/*"
                required={mode === "create"}
                onChange={field.onChange}
              />
            )}
          />
          {errors.photo_night_url ? (
            <p className="text-sm text-red-500">유효한 URL이어야 합니다.</p>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <Controller
            control={control}
            name="audio_url_ko"
            render={({ field }) => (
              <FileUploadField
                label="audio_url_ko"
                value={typeof field.value === "string" ? field.value : ""}
                folder="artworks/audio-ko"
                accept="audio/*"
                required={mode === "create"}
                onChange={field.onChange}
              />
            )}
          />
          {errors.audio_url_ko ? (
            <p className="text-sm text-red-500">유효한 URL이어야 합니다.</p>
          ) : null}
        </div>
        <div className="space-y-1">
          <Controller
            control={control}
            name="audio_url_en"
            render={({ field }) => (
              <FileUploadField
                label="audio_url_en"
                value={typeof field.value === "string" ? field.value : ""}
                folder="artworks/audio-en"
                accept="audio/*"
                required={mode === "create"}
                onChange={field.onChange}
              />
            )}
          />
          {errors.audio_url_en ? (
            <p className="text-sm text-red-500">유효한 URL이어야 합니다.</p>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "저장 중..." : "저장"}
      </Button>
    </form>
  );
}
