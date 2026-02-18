"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { FileUploadField } from "@/components/admin/file-upload-field";
import { Button } from "@/components/ui/button";
import { requestJson } from "@/lib/client/admin-api";
import { artistTypeSchema } from "@/lib/server/validators/admin";

const schema = z.object({
  name_ko: z.string().min(1, "필수 입력입니다."),
  name_en: z.string().min(1, "필수 입력입니다."),
  type: artistTypeSchema,
  profile_image_url: z
    .string()
    .optional()
    .refine(
      (value) => {
        if (!value || value.trim().length === 0) {
          return true;
        }
        return z.string().url().safeParse(value.trim()).success;
      },
      {
        message: "유효한 URL을 입력해주세요.",
      },
    ),
});

type FormValues = z.infer<typeof schema>;
type ArtistType = z.infer<typeof artistTypeSchema>;

export function ArtistsForm({
  mode,
  initialData,
}: {
  mode: "create" | "edit";
  initialData?: {
    id: number;
    name_ko: string;
    name_en: string;
    type: ArtistType;
    profile_image_url: string | null;
  };
}) {
  const router = useRouter();
  const [error, setError] = useState("");

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
      type: initialData?.type ?? "COMPANY",
      profile_image_url: initialData?.profile_image_url ?? "",
    },
  });

  const profileImageUrl = watch("profile_image_url") ?? "";

  const onSubmit = async (values: FormValues) => {
    setError("");
    const normalizedProfileImageUrl = values.profile_image_url?.trim();

    if (mode === "create" && !normalizedProfileImageUrl) {
      setError("프로필 이미지는 필수입니다.");
      return;
    }

    const payload = {
      name_ko: values.name_ko,
      name_en: values.name_en,
      type: values.type,
      ...(normalizedProfileImageUrl
        ? { profile_image_url: normalizedProfileImageUrl }
        : {}),
    };

    try {
      if (mode === "create") {
        await requestJson("/api/admin/artists", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      } else {
        await requestJson(`/api/admin/artists/${initialData?.id ?? 0}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      }

      router.push("/admin/artists");
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "저장 중 오류가 발생했습니다.",
      );
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1">
        <label className="text-sm font-medium">이름(한글)</label>
        <input className="w-full rounded-md border px-3 py-2" {...register("name_ko")} />
        {errors.name_ko ? <p className="text-sm text-red-500">{errors.name_ko.message}</p> : null}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">이름(영문)</label>
        <input className="w-full rounded-md border px-3 py-2" {...register("name_en")} />
        {errors.name_en ? <p className="text-sm text-red-500">{errors.name_en.message}</p> : null}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">타입</label>
        <select className="w-full rounded-md border px-3 py-2" {...register("type")}>
          <option value="COMPANY">COMPANY</option>
          <option value="INDIVIDUAL">INDIVIDUAL</option>
        </select>
        {errors.type ? <p className="text-sm text-red-500">{errors.type.message}</p> : null}
      </div>

      <div className="space-y-1">
        <input type="hidden" {...register("profile_image_url")} />
        <FileUploadField
          label="프로필 이미지"
          value={profileImageUrl}
          folder="artists/profile"
          accept="image/*"
          required={mode === "create"}
          imagePreviewClassName="max-w-64 rounded-full"
          imagePreviewImageClassName="object-cover"
          onChange={(value) =>
            setValue("profile_image_url", value, {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
        />
        {errors.profile_image_url ? (
          <p className="text-sm text-red-500">{errors.profile_image_url.message}</p>
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "저장 중..." : "저장"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/admin/artists")}>취소</Button>
      </div>
    </form>
  );
}
