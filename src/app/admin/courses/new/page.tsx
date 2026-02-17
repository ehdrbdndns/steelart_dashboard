"use client";

import { useRouter } from "next/navigation";
import { CoursesForm } from "@/components/admin/courses-form";
import { PageTitle } from "@/components/admin/page-title";

export default function NewCoursePage() {
  const router = useRouter();

  return (
    <div>
      <PageTitle title="새 코스" description="코스를 생성합니다." />
      <CoursesForm mode="create" onSaved={() => router.push("/admin/courses")} />
    </div>
  );
}
