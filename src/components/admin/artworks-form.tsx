"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Script from "next/script";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import {
  FileUploadField,
  type ImageMetadata,
} from "@/components/admin/file-upload-field";
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

const FESTIVAL_YEAR_PATTERN = /^\d{4}$/;

const zoneIdFieldSchema = z
  .string()
  .optional()
  .refine((value) => {
    if (!value || value.trim().length === 0) {
      return true;
    }

    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0;
  }, "올바른 권역을 선택해주세요.");

function buildCoordinateSchema(min: number, max: number) {
  return z
    .string()
    .trim()
    .min(1, "필수 입력입니다.")
    .refine((value) => !Number.isNaN(Number(value)), "숫자를 입력해주세요.")
    .refine((value) => {
      const numeric = Number(value);
      return numeric >= min && numeric <= max;
    }, `${min} ~ ${max} 범위의 값을 입력해주세요.`);
}

function parseCoordinate(rawValue: string) {
  const trimmed = rawValue.trim();

  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasResolvedImageDimensions(image: {
  image_width: number | null;
  image_height: number | null;
}) {
  return Boolean(
    Number.isInteger(image.image_width) &&
      Number.isInteger(image.image_height) &&
      image.image_width &&
      image.image_height &&
      image.image_width > 0 &&
      image.image_height > 0,
  );
}

const schema = z.object({
  title_ko: z.string().min(1),
  title_en: z.string().min(1),
  artist_id: z.number().int().positive(),
  category: artworkCategorySchema,
  production_year: z.number().int().positive(),
  size_text_ko: z.string().min(1),
  size_text_en: z.string().min(1),
  description_ko: z.string().min(1),
  description_en: z.string().min(1),
  audio_url_ko: optionalUrlSchema,
  audio_url_en: optionalUrlSchema,
  place: z.object({
    name_ko: z.string().trim().min(1, "필수 입력입니다."),
    name_en: z.string().trim().min(1, "필수 입력입니다."),
    address: z.string().optional(),
    zone_id: zoneIdFieldSchema,
    lat: buildCoordinateSchema(-90, 90),
    lng: buildCoordinateSchema(-180, 180),
  }),
});

type FormValues = z.infer<typeof schema>;
type AudioFieldKey = "audio_url_ko" | "audio_url_en";

type ArtworkImage = {
  id: number;
  artwork_id: number;
  image_url: string;
  image_width: number | null;
  image_height: number | null;
  created_at: string | null;
};

type ArtworkPlace = {
  id: number;
  zone_id: number | null;
  zone_name_ko: string | null;
  name_ko: string;
  name_en: string;
  address: string | null;
  lat: number;
  lng: number;
};

type ArtworkInitialData = {
  id?: number;
  title_ko?: string;
  title_en?: string;
  artist_id?: number;
  place_id?: number;
  place?: ArtworkPlace | null;
  category?: "STEEL_ART" | "PUBLIC_ART";
  production_year?: number;
  size_text_ko?: string;
  size_text_en?: string;
  description_ko?: string;
  description_en?: string;
  audio_url_ko?: string | null;
  audio_url_en?: string | null;
  festival_years?: string[];
  images?: ArtworkImage[];
};

type SelectOption = {
  id: number;
  name_ko: string;
};

type ArtworkImageDraft = {
  key: string;
  image_url: string;
  image_width: number | null;
  image_height: number | null;
};

type FestivalYearDraft = {
  key: string;
  year: string;
};

type GeocodeState = "idle" | "loading" | "success" | "error";

type GeocodeTrigger = "auto" | "manual";

type GeocodeResponse = {
  lat: number;
  lng: number;
  matched_address: string;
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
  const [zones, setZones] = useState<SelectOption[]>([]);
  const [error, setError] = useState("");
  const [kakaoSdkReady, setKakaoSdkReady] = useState(false);
  const [kakaoLoadError, setKakaoLoadError] = useState("");
  const [geocodeState, setGeocodeState] = useState<GeocodeState>("idle");
  const [geocodeMessage, setGeocodeMessage] = useState("");
  const [coordinatesEdited, setCoordinatesEdited] = useState(false);
  const geocodeRequestIdRef = useRef(0);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const markerRef = useRef<KakaoMarker | null>(null);
  const imageDraftIndex = useRef(0);
  const festivalYearDraftIndex = useRef(0);

  const kakaoSdkKey = (
    process.env.NEXT_PUBLIC_KAKAO_MAP_SDK_KEY ??
    process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY ??
    ""
  ).trim();
  const isKakaoSdkEnabled = kakaoSdkKey.length > 0;

  const kakaoScriptSrc = useMemo(() => {
    if (!isKakaoSdkEnabled) {
      return "";
    }

    return `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(kakaoSdkKey)}&autoload=false&libraries=services`;
  }, [isKakaoSdkEnabled, kakaoSdkKey]);

  const createImageDraft = (
    imageUrl = "",
    imageWidth: number | null = null,
    imageHeight: number | null = null,
  ): ArtworkImageDraft => {
    imageDraftIndex.current += 1;
    return {
      key: `image-draft-${Date.now()}-${imageDraftIndex.current}`,
      image_url: imageUrl,
      image_width: imageWidth,
      image_height: imageHeight,
    };
  };

  const createFestivalYearDraft = (year = ""): FestivalYearDraft => {
    festivalYearDraftIndex.current += 1;
    return {
      key: `festival-year-${Date.now()}-${festivalYearDraftIndex.current}`,
      year,
    };
  };

  const [imageDrafts, setImageDrafts] = useState<ArtworkImageDraft[]>(() => {
    const existingImages = initialData?.images ?? [];
    if (existingImages.length > 0) {
      return existingImages.map((image, index) => ({
        key: `existing-image-${image.id}-${index}`,
        image_url: image.image_url,
        image_width: image.image_width,
        image_height: image.image_height,
      }));
    }
    return [createImageDraft()];
  });

  const [festivalYearDrafts, setFestivalYearDrafts] = useState<FestivalYearDraft[]>(
    () => {
      const existingFestivalYears = initialData?.festival_years ?? [];
      if (existingFestivalYears.length > 0) {
        return existingFestivalYears.map((year, index) => ({
          key: `existing-festival-year-${year}-${index}`,
          year,
        }));
      }
      return [createFestivalYearDraft()];
    },
  );

  const {
    control,
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title_ko: initialData?.title_ko ?? "",
      title_en: initialData?.title_en ?? "",
      artist_id: Number(initialData?.artist_id ?? 0),
      category: initialData?.category ?? "STEEL_ART",
      production_year: Number(initialData?.production_year ?? new Date().getFullYear()),
      size_text_ko: initialData?.size_text_ko ?? "",
      size_text_en: initialData?.size_text_en ?? "",
      description_ko: initialData?.description_ko ?? "",
      description_en: initialData?.description_en ?? "",
      audio_url_ko: initialData?.audio_url_ko ?? "",
      audio_url_en: initialData?.audio_url_en ?? "",
      place: {
        name_ko: initialData?.place?.name_ko ?? "",
        name_en: initialData?.place?.name_en ?? "",
        address: initialData?.place?.address ?? "",
        zone_id: initialData?.place?.zone_id ? String(initialData.place.zone_id) : "",
        lat: initialData?.place ? initialData.place.lat.toFixed(7) : "",
        lng: initialData?.place ? initialData.place.lng.toFixed(7) : "",
      },
    },
  });

  const placeAddressValue = watch("place.address") ?? "";
  const placeLatValue = watch("place.lat") ?? "";
  const placeLngValue = watch("place.lng") ?? "";

  const parsedLat = useMemo(() => parseCoordinate(placeLatValue), [placeLatValue]);
  const parsedLng = useMemo(() => parseCoordinate(placeLngValue), [placeLngValue]);
  const hasValidCoordinates =
    parsedLat !== null &&
    parsedLng !== null &&
    parsedLat >= -90 &&
    parsedLat <= 90 &&
    parsedLng >= -180 &&
    parsedLng <= 180;

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const [artistsResponse, zonesResponse] = await Promise.all([
          requestJsonWithMeta<SelectOption[]>(
            "/api/admin/artists?deleted=exclude&page=1&size=100",
          ),
          requestJson<SelectOption[]>("/api/admin/zones"),
        ]);

        setArtists(artistsResponse.data);
        setZones(zonesResponse);
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "옵션 조회 실패");
      }
    };

    void fetchOptions();
  }, []);

  useEffect(() => {
    if (!isKakaoSdkEnabled || typeof window === "undefined") {
      return;
    }

    if (!window.kakao?.maps?.load) {
      return;
    }

    window.kakao.maps.load(() => {
      setKakaoSdkReady(true);
      setKakaoLoadError("");
    });
  }, [isKakaoSdkEnabled]);

  useEffect(() => {
    if (
      !isKakaoSdkEnabled ||
      !kakaoSdkReady ||
      kakaoLoadError ||
      typeof window === "undefined" ||
      !window.kakao?.maps ||
      !mapContainerRef.current
    ) {
      return;
    }

    const mapCenterLat = hasValidCoordinates && parsedLat !== null ? parsedLat : 37.5665;
    const mapCenterLng = hasValidCoordinates && parsedLng !== null ? parsedLng : 126.978;
    const center = new window.kakao.maps.LatLng(mapCenterLat, mapCenterLng);

    if (!mapRef.current) {
      mapRef.current = new window.kakao.maps.Map(mapContainerRef.current, {
        center,
        level: 3,
      });
    } else {
      mapRef.current.setCenter(center);
    }

    if (!hasValidCoordinates || parsedLat === null || parsedLng === null) {
      if (markerRef.current) {
        markerRef.current.setMap(null);
        markerRef.current = null;
      }
      return;
    }

    const position = new window.kakao.maps.LatLng(parsedLat, parsedLng);

    if (!markerRef.current) {
      markerRef.current = new window.kakao.maps.Marker({
        map: mapRef.current,
        position,
      });
      return;
    }

    markerRef.current.setMap(mapRef.current);
    markerRef.current.setPosition(position);
  }, [
    hasValidCoordinates,
    isKakaoSdkEnabled,
    kakaoLoadError,
    kakaoSdkReady,
    parsedLat,
    parsedLng,
  ]);

  useEffect(() => {
    return () => {
      if (markerRef.current) {
        markerRef.current.setMap(null);
      }
      markerRef.current = null;
      mapRef.current = null;
    };
  }, []);

  const geocodeAddress = useCallback(
    async (rawAddress: string, trigger: GeocodeTrigger) => {
      const address = rawAddress.trim();

      if (!address) {
        setGeocodeState("idle");
        setGeocodeMessage("");
        return;
      }

      const requestId = geocodeRequestIdRef.current + 1;
      geocodeRequestIdRef.current = requestId;
      setGeocodeState("loading");
      setGeocodeMessage("주소로 좌표를 찾는 중입니다...");

      try {
        const result = await requestJson<GeocodeResponse>("/api/admin/places/geocode", {
          method: "POST",
          body: JSON.stringify({ address }),
        });

        if (requestId !== geocodeRequestIdRef.current) {
          return;
        }

        if (!Number.isFinite(result.lat) || !Number.isFinite(result.lng)) {
          setGeocodeState("error");
          setGeocodeMessage("좌표 형식이 올바르지 않습니다. 직접 입력해주세요.");
          return;
        }

        setValue("place.lat", result.lat.toFixed(7), {
          shouldDirty: true,
          shouldValidate: true,
        });
        setValue("place.lng", result.lng.toFixed(7), {
          shouldDirty: true,
          shouldValidate: true,
        });
        setCoordinatesEdited(false);
        setGeocodeState("success");
        setGeocodeMessage(
          trigger === "auto"
            ? "주소 기반으로 좌표를 자동 입력했습니다."
            : "좌표를 다시 조회해 반영했습니다.",
        );
      } catch (geocodeError) {
        if (requestId !== geocodeRequestIdRef.current) {
          return;
        }

        setGeocodeState("error");
        setGeocodeMessage(
          geocodeError instanceof Error
            ? geocodeError.message
            : "주소에 대한 좌표를 찾지 못했습니다. 직접 입력해주세요.",
        );
      }
    },
    [setValue],
  );

  useEffect(() => {
    const trimmedAddress = placeAddressValue.trim();
    if (trimmedAddress.length === 0) {
      setGeocodeState("idle");
      setGeocodeMessage("");
      return;
    }

    const timer = window.setTimeout(() => {
      void geocodeAddress(trimmedAddress, "auto");
    }, 600);

    return () => window.clearTimeout(timer);
  }, [geocodeAddress, placeAddressValue]);

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

    if (imageDrafts.some((image) => !hasResolvedImageDimensions(image))) {
      setError("모든 작품 이미지의 가로/세로 크기를 확인해주세요.");
      return;
    }

    const normalizedFestivalYears = festivalYearDrafts
      .map((item) => item.year.trim())
      .filter((year) => year.length > 0);
    const hasInvalidFestivalYear = normalizedFestivalYears.some(
      (year) => !FESTIVAL_YEAR_PATTERN.test(year),
    );

    if (hasInvalidFestivalYear) {
      setError("축제 연도는 4자리 숫자(예: 2024)만 입력할 수 있습니다.");
      return;
    }

    const deduplicatedFestivalYears = Array.from(new Set(normalizedFestivalYears));

    const zoneId =
      values.place.zone_id && values.place.zone_id.trim().length > 0
        ? Number(values.place.zone_id)
        : null;

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
        title_ko: values.title_ko,
        title_en: values.title_en,
        artist_id: values.artist_id,
        category: values.category,
        production_year: values.production_year,
        size_text_ko: values.size_text_ko,
        size_text_en: values.size_text_en,
        description_ko: values.description_ko,
        description_en: values.description_en,
        place: {
          name_ko: values.place.name_ko.trim(),
          name_en: values.place.name_en.trim(),
          address: values.place.address?.trim() ? values.place.address.trim() : null,
          lat: Number(values.place.lat),
          lng: Number(values.place.lng),
          zone_id: zoneId,
        },
        audio_url_ko: values.audio_url_ko.trim() || undefined,
        audio_url_en: values.audio_url_en.trim() || undefined,
        images: imageDrafts.map((image, index) => ({
          image_url: normalizedImageUrls[index],
          image_width: image.image_width,
          image_height: image.image_height,
        })),
        festival_years: deduplicatedFestivalYears,
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

  const placeLatRegister = register("place.lat", {
    onChange: () => {
      setCoordinatesEdited(true);
      if (geocodeState === "success") {
        setGeocodeMessage("위도를 수동으로 수정했습니다.");
      }
    },
  });

  const placeLngRegister = register("place.lng", {
    onChange: () => {
      setCoordinatesEdited(true);
      if (geocodeState === "success") {
        setGeocodeMessage("경도를 수동으로 수정했습니다.");
      }
    },
  });

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
      {isKakaoSdkEnabled ? (
        <Script
          src={kakaoScriptSrc}
          strategy="afterInteractive"
          onLoad={() => {
            if (!window.kakao?.maps?.load) {
              setKakaoLoadError("카카오 지도 SDK를 초기화하지 못했습니다.");
              return;
            }

            window.kakao.maps.load(() => {
              setKakaoSdkReady(true);
              setKakaoLoadError("");
            });
          }}
          onError={() => {
            setKakaoSdkReady(false);
            setKakaoLoadError("카카오 지도 SDK 로드에 실패했습니다.");
          }}
        />
      ) : null}

      <Card className="border-blue-300 bg-blue-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-blue-900">미디어 입력 정책</CardTitle>
          <CardDescription className="text-blue-800">
            {mode === "create"
              ? "생성 시 작품 이미지는 최소 1장, 오디오는 한국어/영어 각각 1개가 필수입니다."
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
              <Label htmlFor="title_ko">작품명(한국어)</Label>
              <Input id="title_ko" {...register("title_ko")} />
              {errors.title_ko ? <p className="text-sm text-red-500">필수 입력입니다.</p> : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="title_en">작품명(영어)</Label>
              <Input id="title_en" {...register("title_en")} />
              {errors.title_en ? <p className="text-sm text-red-500">필수 입력입니다.</p> : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="artist_id">작가</Label>
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
              <Label htmlFor="category">작품 유형</Label>
              <select id="category" className={selectClassName} {...register("category")}>
                <option value="STEEL_ART">스틸아트</option>
                <option value="PUBLIC_ART">공공미술</option>
              </select>
              {errors.category ? <p className="text-sm text-red-500">필수 입력입니다.</p> : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="production_year">제작 연도</Label>
              <Input
                id="production_year"
                type="number"
                {...register("production_year", { valueAsNumber: true })}
              />
              {errors.production_year ? (
                <p className="text-sm text-red-500">필수 입력입니다.</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="size_text_ko">작품 크기(한국어)</Label>
              <Input id="size_text_ko" {...register("size_text_ko")} />
              {errors.size_text_ko ? <p className="text-sm text-red-500">필수 입력입니다.</p> : null}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="size_text_en">작품 크기(영어)</Label>
            <Input id="size_text_en" {...register("size_text_en")} />
            {errors.size_text_en ? <p className="text-sm text-red-500">필수 입력입니다.</p> : null}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="description_ko">작품 설명(한국어)</Label>
              <Textarea id="description_ko" rows={4} {...register("description_ko")} />
              {errors.description_ko ? (
                <p className="text-sm text-red-500">필수 입력입니다.</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="description_en">작품 설명(영어)</Label>
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
          <CardTitle>설치 장소 정보</CardTitle>
          <CardDescription>
            작품과 함께 저장될 장소 정보를 입력합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="place_name_ko">이름(한글)</Label>
              <Input id="place_name_ko" {...register("place.name_ko")} />
              {errors.place?.name_ko ? (
                <p className="text-sm text-red-500">{errors.place.name_ko.message}</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="place_name_en">이름(영문)</Label>
              <Input id="place_name_en" {...register("place.name_en")} />
              {errors.place?.name_en ? (
                <p className="text-sm text-red-500">{errors.place.name_en.message}</p>
              ) : null}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="place_zone_id">권역</Label>
            <select
              id="place_zone_id"
              className={selectClassName}
              {...register("place.zone_id")}
            >
              <option value="">권역 없음</option>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name_ko}
                </option>
              ))}
            </select>
            {errors.place?.zone_id ? (
              <p className="text-sm text-red-500">{errors.place.zone_id.message}</p>
            ) : null}
          </div>

          <div className="space-y-1">
            <Label htmlFor="place_address">주소(도로명)</Label>
            <Input
              id="place_address"
              placeholder="주소(도로명)를 입력하면 위도/경도가 자동으로 채워집니다."
              {...register("place.address")}
            />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!placeAddressValue.trim() || geocodeState === "loading"}
                onClick={() => {
                  void geocodeAddress(placeAddressValue, "manual");
                }}
              >
                좌표 다시 찾기
              </Button>
              {coordinatesEdited ? (
                <span className="text-xs text-amber-600">좌표를 수동으로 수정했습니다.</span>
              ) : null}
            </div>
            {kakaoLoadError ? <p className="text-sm text-red-500">{kakaoLoadError}</p> : null}
            {!isKakaoSdkEnabled ? (
              <p className="text-sm text-muted-foreground">
                지도 SDK 키가 없어 지도 기능이 비활성화되었습니다.
              </p>
            ) : null}
            {isKakaoSdkEnabled && !kakaoSdkReady && !kakaoLoadError ? (
              <p className="text-sm text-muted-foreground">카카오 지도 SDK를 로드 중입니다.</p>
            ) : null}
            {geocodeState === "loading" ? (
              <p className="text-sm text-muted-foreground">{geocodeMessage}</p>
            ) : null}
            {geocodeState === "success" ? (
              <p className="text-sm text-emerald-600">{geocodeMessage}</p>
            ) : null}
            {geocodeState === "error" ? (
              <p className="text-sm text-red-500">{geocodeMessage}</p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="place_lat">위도</Label>
              <Input id="place_lat" type="number" step="0.0000001" {...placeLatRegister} />
              {errors.place?.lat ? (
                <p className="text-sm text-red-500">{errors.place.lat.message}</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="place_lng">경도</Label>
              <Input id="place_lng" type="number" step="0.0000001" {...placeLngRegister} />
              {errors.place?.lng ? (
                <p className="text-sm text-red-500">{errors.place.lng.message}</p>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <Label>지도 미리보기</Label>
            {isKakaoSdkEnabled && kakaoSdkReady && !kakaoLoadError ? (
              <div className="overflow-hidden rounded-md border border-input">
                <div ref={mapContainerRef} className="h-72 w-full" />
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
                지도 SDK가 준비되면 좌표 위치를 지도에서 확인할 수 있습니다.
              </div>
            )}
            {hasValidCoordinates ? (
              <p className="text-xs text-muted-foreground">
                현재 위도/경도 좌표를 기준으로 마커를 표시합니다.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                위도/경도 값을 입력하면 지도에 위치 마커가 표시됩니다.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>축제 연도</CardTitle>
          <CardDescription>
            작품이 출품된 축제 연도를 여러 개 입력할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {festivalYearDrafts.map((draft, index) => (
            <div key={draft.key} className="space-y-3 rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="secondary">연도 {index + 1}</Badge>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() =>
                    setFestivalYearDrafts((previous) =>
                      previous.length <= 1
                        ? previous
                        : previous.filter((item) => item.key !== draft.key),
                    )
                  }
                  disabled={festivalYearDrafts.length <= 1}
                >
                  삭제
                </Button>
              </div>
              <Input
                value={draft.year}
                onChange={(event) =>
                  setFestivalYearDrafts((previous) =>
                    previous.map((item) =>
                      item.key === draft.key
                        ? {
                            ...item,
                            year: event.target.value,
                          }
                        : item,
                    ),
                  )
                }
                placeholder="2024"
              />
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setFestivalYearDrafts((previous) => [
                ...previous,
                createFestivalYearDraft(),
              ])
            }
          >
            연도 행 추가
          </Button>
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
                label={`이미지 파일 #${index + 1}`}
                value={draft.image_url}
                folder="artworks/images"
                accept="image/*"
                required={mode === "create"}
                imagePreviewClassName="h-24 w-40 max-w-full rounded-md"
                imagePreviewImageClassName="object-cover"
                imageMetadata={{
                  width: draft.image_width,
                  height: draft.image_height,
                }}
                onImageMetadataChange={(nextMetadata: ImageMetadata | null) =>
                  setImageDrafts((previous) =>
                    previous.map((item) =>
                      item.key === draft.key
                        ? {
                            ...item,
                            image_width: nextMetadata?.width ?? null,
                            image_height: nextMetadata?.height ?? null,
                          }
                        : item,
                    ),
                  )
                }
                showImageMetadata
                onChange={(nextValue) =>
                  setImageDrafts((previous) =>
                    previous.map((item) =>
                      item.key === draft.key
                        ? {
                            ...item,
                            image_url: nextValue,
                            image_width: nextValue === item.image_url ? item.image_width : null,
                            image_height: nextValue === item.image_url ? item.image_height : null,
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
                  label="오디오(한국어)"
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
                  label="오디오(영어)"
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
