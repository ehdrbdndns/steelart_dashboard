"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CourseItemsEditor } from "@/components/admin/course-items-editor";
import { CoursesForm } from "@/components/admin/courses-form";
import { PageTitle } from "@/components/admin/page-title";
import { requestJson } from "@/lib/client/admin-api";

type Course = {
  id: number;
  title_ko: string;
  title_en: string;
  description_ko: string;
  description_en: string;
  is_official: boolean;
};

export default function EditCoursePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [course, setCourse] = useState<Course | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const id = Array.isArray(params.id) ? params.id[0] : params.id;
    if (!id) return;

    const fetchCourse = async () => {
      try {
        const response = await requestJson<Course>(`/api/admin/courses/${id}`);
        setCourse(response);
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "조회 실패");
      }
    };

    void fetchCourse();
  }, [params.id]);

  return (
    <div className="space-y-6">
      <PageTitle title="코스 수정" description="코스 기본 정보와 아이템을 관리합니다." />
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      {course ? (
        <>
          <CoursesForm
            mode="edit"
            initialData={course}
            onSaved={() => router.push("/admin/courses")}
          />
          <CourseItemsEditor courseId={course.id} />
        </>
      ) : (
        <p>로딩 중...</p>
      )}
    </div>
  );
}
