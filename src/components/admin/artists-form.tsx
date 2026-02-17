"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { requestJson } from "@/lib/client/admin-api";
import { artistTypeSchema } from "@/lib/server/validators/admin";

const schema = z.object({
  name_ko: z.string().min(1, "필수 입력입니다."),
  name_en: z.string().min(1, "필수 입력입니다."),
  type: artistTypeSchema,
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
  };
}) {
  const router = useRouter();
  const [error, setError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name_ko: initialData?.name_ko ?? "",
      name_en: initialData?.name_en ?? "",
      type: initialData?.type ?? "COMPANY",
    },
  });

  const onSubmit = async (values: FormValues) => {
    setError("");

    try {
      if (mode === "create") {
        await requestJson("/api/admin/artists", {
          method: "POST",
          body: JSON.stringify(values),
        });
      } else {
        await requestJson(`/api/admin/artists/${initialData?.id ?? 0}`, {
          method: "PUT",
          body: JSON.stringify(values),
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
