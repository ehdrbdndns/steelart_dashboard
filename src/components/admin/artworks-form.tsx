"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { FileUploadField } from "@/components/admin/file-upload-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  audio_url_ko: optionalUrlSchema,
  audio_url_en: optionalUrlSchema,
});

type FormValues = z.infer<typeof schema>;
type AudioFieldKey = "audio_url_ko" | "audio_url_en";

type ArtworkImage = {
  id: number;
  artwork_id: number;
  image_url: string;
  created_at: string | null;
};

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
  audio_url_ko?: string | null;
  audio_url_en?: string | null;
  images?: ArtworkImage[];
};

type SelectOption = {
  id: number;
  name_ko: string;
};

type ArtworkImageDraft = {
  key: string;
  image_url: string;
};

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

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
  const imageDraftIndex = useRef(0);

  const createImageDraft = (imageUrl = ""): ArtworkImageDraft => {
    imageDraftIndex.current += 1;
    return {
      key: `image-draft-${Date.now()}-${imageDraftIndex.current}`,
      image_url: imageUrl,
    };
  };

  const [imageDrafts, setImageDrafts] = useState<ArtworkImageDraft[]>(() => {
    const existingImages = initialData?.images ?? [];
    if (existingImages.length > 0) {
      return existingImages.map((image, index) => ({
        key: `existing-image-${image.id}-${index}`,
        image_url: image.image_url,
      }));
    }
    return [createImageDraft()];
  });

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

  const moveImage = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= imageDrafts.length) {
      return;
    }
    setImageDrafts((previous) => {
      const next = [...previous];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const onSubmit = async (values: FormValues) => {
    setError("");

    const requiredAudioFields: AudioFieldKey[] = ["audio_url_ko", "audio_url_en"];
    if (mode === "create") {
      const hasMissingAudio = requiredAudioFields.some(
        (key) => values[key].trim().length === 0,
      );
      if (hasMissingAudio) {
        setError("생성 시 오디오 2개 파일을 모두 업로드해야 합니다.");
        return;
      }
    }

    const normalizedImageUrls = imageDrafts.map((image) => image.image_url.trim());

    if (normalizedImageUrls.some((imageUrl) => imageUrl.length === 0)) {
      setError("이미지 URL이 비어 있는 항목이 있습니다.");
      return;
    }

    const hasInvalidImage = normalizedImageUrls.some(
      (imageUrl) => !z.string().url().safeParse(imageUrl).success,
    );
    if (hasInvalidImage) {
      setError("유효하지 않은 이미지 URL이 있습니다.");
      return;
    }

    if (normalizedImageUrls.length === 0) {
      setError("작품 이미지는 최소 1장 필요합니다.");
      return;
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
        audio_url_ko: values.audio_url_ko.trim() || undefined,
        audio_url_en: values.audio_url_en.trim() || undefined,
        images: normalizedImageUrls.map((imageUrl) => ({
          image_url: imageUrl,
        })),
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
      <Card className="border-blue-300 bg-blue-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-blue-900">미디어 입력 정책</CardTitle>
          <CardDescription className="text-blue-800">
            {mode === "create"
              ? "생성 시 작품 이미지는 최소 1장, 오디오 2개(ko/en)는 필수입니다."
              : "수정 시 오디오는 필요한 파일만 교체하세요. 이미지는 현재 목록 기준으로 전체 저장됩니다."}
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>기본 정보</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="title_ko">title_ko</Label>
              <Input id="title_ko" {...register("title_ko")} />
              {errors.title_ko ? <p className="text-sm text-red-500">필수 입력입니다.</p> : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="title_en">title_en</Label>
              <Input id="title_en" {...register("title_en")} />
              {errors.title_en ? <p className="text-sm text-red-500">필수 입력입니다.</p> : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="artist_id">artist_id</Label>
              <select
                id="artist_id"
                className={selectClassName}
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
              <Label htmlFor="place_id">place_id</Label>
              <select
                id="place_id"
                className={selectClassName}
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
              <Label htmlFor="category">category</Label>
              <select id="category" className={selectClassName} {...register("category")}>
                <option value="STEEL_ART">STEEL_ART</option>
                <option value="PUBLIC_ART">PUBLIC_ART</option>
              </select>
              {errors.category ? <p className="text-sm text-red-500">필수 입력입니다.</p> : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="production_year">production_year</Label>
              <Input
                id="production_year"
                type="number"
                {...register("production_year", { valueAsNumber: true })}
              />
              {errors.production_year ? (
                <p className="text-sm text-red-500">필수 입력입니다.</p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="size_text_ko">size_text_ko</Label>
              <Input id="size_text_ko" {...register("size_text_ko")} />
              {errors.size_text_ko ? <p className="text-sm text-red-500">필수 입력입니다.</p> : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="size_text_en">size_text_en</Label>
              <Input id="size_text_en" {...register("size_text_en")} />
              {errors.size_text_en ? <p className="text-sm text-red-500">필수 입력입니다.</p> : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="description_ko">description_ko</Label>
              <Textarea id="description_ko" rows={4} {...register("description_ko")} />
              {errors.description_ko ? (
                <p className="text-sm text-red-500">필수 입력입니다.</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="description_en">description_en</Label>
              <Textarea id="description_en" rows={4} {...register("description_en")} />
              {errors.description_en ? (
                <p className="text-sm text-red-500">필수 입력입니다.</p>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>작품 이미지</CardTitle>
          <CardDescription>여러 장 이미지를 추가하고 순서를 조정할 수 있습니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {imageDrafts.map((draft, index) => (
            <div key={draft.key} className="space-y-3 rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="secondary">이미지 {index + 1}</Badge>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => moveImage(index, index - 1)}
                    disabled={index === 0}
                  >
                    위로
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => moveImage(index, index + 1)}
                    disabled={index === imageDrafts.length - 1}
                  >
                    아래로
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() =>
                      setImageDrafts((previous) =>
                        previous.length <= 1
                          ? previous
                          : previous.filter((item) => item.key !== draft.key),
                      )
                    }
                    disabled={imageDrafts.length <= 1}
                  >
                    삭제
                  </Button>
                </div>
              </div>

              <FileUploadField
                label={`image_url #${index + 1}`}
                value={draft.image_url}
                folder="artworks/images"
                accept="image/*"
                required={mode === "create"}
                imagePreviewClassName="h-24 w-40 max-w-full rounded-md"
                imagePreviewImageClassName="object-cover"
                onChange={(nextValue) =>
                  setImageDrafts((previous) =>
                    previous.map((item) =>
                      item.key === draft.key
                        ? {
                            ...item,
                            image_url: nextValue,
                          }
                        : item,
                    ),
                  )
                }
              />
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setImageDrafts((previous) => [...previous, createImageDraft()])
            }
          >
            이미지 행 추가
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>오디오</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "저장 중..." : "저장"}
      </Button>
    </form>
  );
}
