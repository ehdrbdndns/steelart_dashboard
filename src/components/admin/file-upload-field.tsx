"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { requestJson } from "@/lib/client/admin-api";
import { confirmAction } from "@/lib/client/confirm-action";
import { cn } from "@/lib/utils";

type PresignResponse = {
  uploadUrl: string;
  fileUrl: string;
};

export type ImageMetadata = {
  width: number;
  height: number;
};

type ImageMetadataValue = {
  width: number | null;
  height: number | null;
};

function hasResolvedImageMetadata(imageMetadata?: ImageMetadataValue | null) {
  const width = imageMetadata?.width;
  const height = imageMetadata?.height;

  return Boolean(
    Number.isInteger(width) &&
      Number.isInteger(height) &&
      typeof width === "number" &&
      typeof height === "number" &&
      width > 0 &&
      height > 0,
  );
}

async function readImageDimensionsFromUrl(imageUrl: string) {
  const image = new Image();

  return new Promise<ImageMetadata>((resolve, reject) => {
    image.onload = () => {
      if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
        reject(new Error("유효하지 않은 이미지 크기입니다."));
        return;
      }

      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };
    image.onerror = () => reject(new Error("이미지 크기를 읽지 못했습니다."));
    image.src = imageUrl;
  });
}

async function readImageDimensionsFromFile(file: File) {
  const objectUrl = URL.createObjectURL(file);

  try {
    return await readImageDimensionsFromUrl(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function FileUploadField({
  label,
  value,
  folder,
  accept,
  required = false,
  imagePreviewClassName,
  imagePreviewImageClassName,
  imageMetadata,
  onImageMetadataChange,
  showImageMetadata = false,
  onChange,
}: {
  label: string;
  value: string;
  folder: string;
  accept: string;
  required?: boolean;
  imagePreviewClassName?: string;
  imagePreviewImageClassName?: string;
  imageMetadata?: ImageMetadataValue | null;
  onImageMetadataChange?: (imageMetadata: ImageMetadata | null) => void;
  showImageMetadata?: boolean;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const onImageMetadataChangeRef = useRef(onImageMetadataChange);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [imagePreviewError, setImagePreviewError] = useState(false);
  const [audioPreviewError, setAudioPreviewError] = useState(false);
  const [imageMetadataLoading, setImageMetadataLoading] = useState(false);
  const [imageMetadataError, setImageMetadataError] = useState("");
  const isImageField = accept.includes("image");
  const isAudioField = accept.includes("audio");

  useEffect(() => {
    setImagePreviewError(false);
    setAudioPreviewError(false);
  }, [value]);

  useEffect(() => {
    onImageMetadataChangeRef.current = onImageMetadataChange;
  }, [onImageMetadataChange]);

  useEffect(() => {
    if (!isImageField) {
      setImageMetadataLoading(false);
      setImageMetadataError("");
      return;
    }

    const trimmedValue = value.trim();
    if (!trimmedValue) {
      setImageMetadataLoading(false);
      setImageMetadataError("");
      return;
    }

    if (!onImageMetadataChangeRef.current) {
      return;
    }

    if (!zodUrlSafeParse(trimmedValue)) {
      setImageMetadataLoading(false);
      setImageMetadataError("");
      return;
    }

    if (hasResolvedImageMetadata(imageMetadata)) {
      setImageMetadataLoading(false);
      setImageMetadataError("");
      return;
    }

    let cancelled = false;

    const resolveMetadata = async () => {
      setImageMetadataLoading(true);
      setImageMetadataError("");

      try {
        const nextImageMetadata = await readImageDimensionsFromUrl(trimmedValue);
        if (cancelled) {
          return;
        }

        setImageMetadataLoading(false);
        onImageMetadataChangeRef.current?.(nextImageMetadata);
      } catch (metadataError) {
        if (cancelled) {
          return;
        }

        setImageMetadataLoading(false);
        setImageMetadataError(
          metadataError instanceof Error
            ? metadataError.message
            : "이미지 크기를 읽지 못했습니다.",
        );
        onImageMetadataChangeRef.current?.(null);
      }
    };

    void resolveMetadata();

    return () => {
      cancelled = true;
    };
  }, [imageMetadata, isImageField, value]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError("");

    try {
      let nextImageMetadata: ImageMetadata | null = null;
      if (isImageField) {
        nextImageMetadata = await readImageDimensionsFromFile(file);
        setImageMetadataError("");
      }

      const presigned = await requestJson<PresignResponse>(
        "/api/admin/uploads/presign",
        {
          method: "POST",
          body: JSON.stringify({
            folder,
            fileName: file.name,
            contentType: file.type,
          }),
        },
      );

      const uploadResponse = await fetch(presigned.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error("파일 업로드에 실패했습니다.");
      }

      onChange(presigned.fileUrl);
      if (nextImageMetadata) {
        onImageMetadataChangeRef.current?.(nextImageMetadata);
      }
    } catch (uploadError) {
      const message =
        uploadError instanceof Error
          ? uploadError.message
          : "파일 업로드 중 오류가 발생했습니다.";
      setError(message);
    } finally {
      setUploading(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{label}</label>
        <Button
          type="button"
          variant="outline"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? "업로드 중..." : "파일 업로드"}
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(event) => {
          const selected = event.target.files?.[0];
          if (!selected) return;
          if (!confirmAction(`"${selected.name}" 파일을 업로드하시겠습니까?`)) {
            event.target.value = "";
            return;
          }
          void handleUpload(selected);
        }}
      />
      <input
        type="url"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          if (isImageField) {
            setImageMetadataError("");
            onImageMetadataChangeRef.current?.(null);
          }
        }}
        placeholder="https://..."
        className="w-full rounded-md border px-3 py-2"
        required={required}
      />
      {isImageField && showImageMetadata && value.trim().length > 0 ? (
        <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          {imageMetadataLoading ? (
            <p>이미지 크기를 읽는 중입니다...</p>
          ) : hasResolvedImageMetadata(imageMetadata) ? (
            <p>
              이미지 크기: {imageMetadata?.width} x {imageMetadata?.height}px
            </p>
          ) : imageMetadataError ? (
            <p className="text-red-500">{imageMetadataError}</p>
          ) : (
            <p>이미지 크기 정보를 확인하는 중입니다.</p>
          )}
        </div>
      ) : null}
      {isImageField && value.trim().length > 0 ? (
        <div className="space-y-2 rounded-md border bg-muted/20 p-2">
          <p className="text-xs text-muted-foreground">이미지 미리보기</p>
          {imagePreviewError ? (
            <p className="text-xs text-red-500">이미지를 불러오지 못했습니다.</p>
          ) : (
            <div
              className={cn(
                "aspect-square w-full overflow-hidden rounded-md border bg-muted/40",
                imagePreviewClassName,
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={value}
                alt={`${label} preview`}
                className={cn(
                  "h-full w-full object-contain",
                  imagePreviewImageClassName,
                )}
                onError={() => setImagePreviewError(true)}
              />
            </div>
          )}
        </div>
      ) : null}
      {isAudioField && value.trim().length > 0 ? (
        <div className="space-y-2 rounded-md border bg-muted/20 p-2">
          <p className="text-xs text-muted-foreground">오디오 미리보기</p>
          {audioPreviewError ? (
            <p className="text-xs text-red-500">오디오를 불러오지 못했습니다.</p>
          ) : (
            <audio
              controls
              className="w-full"
              src={value}
              onError={() => setAudioPreviewError(true)}
            >
              브라우저가 오디오 재생을 지원하지 않습니다.
            </audio>
          )}
        </div>
      ) : null}
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
    </div>
  );
}

function zodUrlSafeParse(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}
