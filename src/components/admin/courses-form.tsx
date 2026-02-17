"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { requestJson } from "@/lib/client/admin-api";

const schema = z.object({
  title_ko: z.string().min(1),
  title_en: z.string().min(1),
  description_ko: z.string().min(1),
  description_en: z.string().min(1),
  is_official: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

export function CoursesForm({
  mode,
  initialData,
  onSaved,
}: {
  mode: "create" | "edit";
  initialData?: Partial<FormValues> & { id?: number };
  onSaved: (courseId?: number) => void;
}) {
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
      description_ko: initialData?.description_ko ?? "",
      description_en: initialData?.description_en ?? "",
      is_official: initialData?.is_official ?? false,
    },
  });

  const onSubmit = async (values: FormValues) => {
    setError("");

    try {
      if (mode === "create") {
        const created = await requestJson<{ id: number }>("/api/admin/courses", {
          method: "POST",
          body: JSON.stringify(values),
        });
        onSaved(created.id);
      } else {
        await requestJson(`/api/admin/courses/${initialData?.id ?? 0}`, {
          method: "PUT",
          body: JSON.stringify(values),
        });
        onSaved(initialData?.id);
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "저장 실패");
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
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

      <div className="space-y-1">
        <label className="text-sm font-medium">description_ko</label>
        <textarea className="w-full rounded-md border px-3 py-2" rows={4} {...register("description_ko")} />
        {errors.description_ko ? <p className="text-sm text-red-500">필수 입력입니다.</p> : null}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">description_en</label>
        <textarea className="w-full rounded-md border px-3 py-2" rows={4} {...register("description_en")} />
        {errors.description_en ? <p className="text-sm text-red-500">필수 입력입니다.</p> : null}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...register("is_official")} />
        is_official
      </label>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "저장 중..." : "저장"}
      </Button>
    </form>
  );
}
