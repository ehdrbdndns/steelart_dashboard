"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { requestJson } from "@/lib/client/admin-api";

type PresignResponse = {
  uploadUrl: string;
  fileUrl: string;
};

export function FileUploadField({
  label,
  value,
  folder,
  accept,
  onChange,
}: {
  label: string;
  value: string;
  folder: string;
  accept: string;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

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
        required
      />
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
    </div>
  );
}
