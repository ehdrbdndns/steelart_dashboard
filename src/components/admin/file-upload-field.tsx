"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { requestJson } from "@/lib/client/admin-api";
import { cn } from "@/lib/utils";

type PresignResponse = {
  uploadUrl: string;
  fileUrl: string;
};

export function FileUploadField({
  label,
  value,
  folder,
  accept,
  required = false,
  imagePreviewClassName,
  imagePreviewImageClassName,
  onChange,
}: {
  label: string;
  value: string;
  folder: string;
  accept: string;
  required?: boolean;
  imagePreviewClassName?: string;
  imagePreviewImageClassName?: string;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [imagePreviewError, setImagePreviewError] = useState(false);
  const [audioPreviewError, setAudioPreviewError] = useState(false);
  const isImageField = accept.includes("image");
  const isAudioField = accept.includes("audio");

  useEffect(() => {
    setImagePreviewError(false);
    setAudioPreviewError(false);
  }, [value]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError("");

    try {
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
          void handleUpload(selected);
        }}
      />
      <input
        type="url"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="https://..."
        className="w-full rounded-md border px-3 py-2"
        required={required}
      />
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
