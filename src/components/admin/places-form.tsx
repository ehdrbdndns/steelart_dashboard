"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestJson } from "@/lib/client/admin-api";
import { confirmAction } from "@/lib/client/confirm-action";

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

const schema = z.object({
  name_ko: z.string().trim().min(1, "필수 입력입니다."),
  name_en: z.string().trim().min(1, "필수 입력입니다."),
  address: z.string().optional(),
  zone_id: zoneIdFieldSchema,
  lat: buildCoordinateSchema(-90, 90),
  lng: buildCoordinateSchema(-180, 180),
});

type FormValues = z.infer<typeof schema>;

type ZoneOption = {
  id: number;
  name_ko: string;
};

type GeocodeState = "idle" | "loading" | "success" | "error";

type GeocodeTrigger = "auto" | "manual";

type GeocodeResponse = {
  lat: number;
  lng: number;
  matched_address: string;
};

export type PlaceInitialData = {
  id: number;
  zone_id: number | null;
  name_ko: string;
  name_en: string;
  address: string | null;
  lat: number;
  lng: number;
};

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export function PlacesForm({
  mode,
  initialData,
}: {
  mode: "create" | "edit";
  initialData?: PlaceInitialData;
}) {
  const router = useRouter();
  const [zones, setZones] = useState<ZoneOption[]>([]);
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

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name_ko: initialData?.name_ko ?? "",
      name_en: initialData?.name_en ?? "",
      address: initialData?.address ?? "",
      zone_id: initialData?.zone_id ? String(initialData.zone_id) : "",
      lat: initialData ? initialData.lat.toFixed(7) : "",
      lng: initialData ? initialData.lng.toFixed(7) : "",
    },
  });

  const addressValue = watch("address") ?? "";
  const latValue = watch("lat") ?? "";
  const lngValue = watch("lng") ?? "";

  const parsedLat = useMemo(() => parseCoordinate(latValue), [latValue]);
  const parsedLng = useMemo(() => parseCoordinate(lngValue), [lngValue]);
  const hasValidCoordinates =
    parsedLat !== null &&
    parsedLng !== null &&
    parsedLat >= -90 &&
    parsedLat <= 90 &&
    parsedLng >= -180 &&
    parsedLng <= 180;

  useEffect(() => {
    const fetchZones = async () => {
      try {
        const response = await requestJson<ZoneOption[]>("/api/admin/zones");
        setZones(response);
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "권역 조회 실패");
      }
    };

    void fetchZones();
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

        setValue("lat", result.lat.toFixed(7), {
          shouldDirty: true,
          shouldValidate: true,
        });
        setValue("lng", result.lng.toFixed(7), {
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
    const trimmedAddress = addressValue.trim();
    if (trimmedAddress.length === 0) {
      setGeocodeState("idle");
      setGeocodeMessage("");
      return;
    }

    const timer = window.setTimeout(() => {
      void geocodeAddress(trimmedAddress, "auto");
    }, 600);

    return () => window.clearTimeout(timer);
  }, [addressValue, geocodeAddress]);

  const onSubmit = async (values: FormValues) => {
    setError("");
    const zoneId =
      values.zone_id && values.zone_id.trim().length > 0
        ? Number(values.zone_id)
        : null;

    const payload = {
      name_ko: values.name_ko.trim(),
      name_en: values.name_en.trim(),
      address: values.address?.trim() ? values.address.trim() : null,
      lat: Number(values.lat),
      lng: Number(values.lng),
      zone_id: zoneId,
    };

    if (
      !confirmAction(
        mode === "create"
          ? "장소를 생성하시겠습니까?"
          : "장소 정보를 저장하시겠습니까?",
      )
    ) {
      return;
    }

    try {
      if (mode === "create") {
        await requestJson("/api/admin/places", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      } else {
        await requestJson(`/api/admin/places/${initialData?.id ?? 0}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      }

      router.push("/admin/places");
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "저장 중 오류가 발생했습니다.",
      );
    }
  };

  const latRegister = register("lat", {
    onChange: () => {
      setCoordinatesEdited(true);
      if (geocodeState === "success") {
        setGeocodeMessage("위도를 수동으로 수정했습니다.");
      }
    },
  });
  const lngRegister = register("lng", {
    onChange: () => {
      setCoordinatesEdited(true);
      if (geocodeState === "success") {
        setGeocodeMessage("경도를 수동으로 수정했습니다.");
      }
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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

      <div className="space-y-1">
        <Label htmlFor="name_ko">이름(한글)</Label>
        <Input id="name_ko" {...register("name_ko")} />
        {errors.name_ko ? <p className="text-sm text-red-500">{errors.name_ko.message}</p> : null}
      </div>

      <div className="space-y-1">
        <Label htmlFor="name_en">이름(영문)</Label>
        <Input id="name_en" {...register("name_en")} />
        {errors.name_en ? <p className="text-sm text-red-500">{errors.name_en.message}</p> : null}
      </div>

      <div className="space-y-1">
        <Label htmlFor="zone_id">권역</Label>
        <select id="zone_id" className={selectClassName} {...register("zone_id")}>
          <option value="">권역 없음</option>
          {zones.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.name_ko}
            </option>
          ))}
        </select>
        {errors.zone_id ? <p className="text-sm text-red-500">{errors.zone_id.message}</p> : null}
      </div>

      <div className="space-y-1">
        <Label htmlFor="address">주소</Label>
        <Input
          id="address"
          placeholder="주소를 입력하면 위도/경도가 자동으로 채워집니다."
          {...register("address")}
        />
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!addressValue.trim() || geocodeState === "loading"}
            onClick={() => {
              void geocodeAddress(addressValue, "manual");
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
        {geocodeState === "error" ? <p className="text-sm text-red-500">{geocodeMessage}</p> : null}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="lat">위도</Label>
          <Input id="lat" type="number" step="0.0000001" {...latRegister} />
          {errors.lat ? <p className="text-sm text-red-500">{errors.lat.message}</p> : null}
        </div>
        <div className="space-y-1">
          <Label htmlFor="lng">경도</Label>
          <Input id="lng" type="number" step="0.0000001" {...lngRegister} />
          {errors.lng ? <p className="text-sm text-red-500">{errors.lng.message}</p> : null}
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

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "저장 중..." : "저장"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/admin/places")}
        >
          취소
        </Button>
      </div>
    </form>
  );
}
