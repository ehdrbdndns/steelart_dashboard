"use client";

import { useRouter } from "next/navigation";
import { ArtworksForm } from "@/components/admin/artworks-form";
import { PageTitle } from "@/components/admin/page-title";

export default function NewArtworkPage() {
  const router = useRouter();

  return (
    <div>
      <PageTitle title="새 작품" description="작품을 생성합니다." />
      <ArtworksForm mode="create" onSaved={() => router.push("/admin/artworks")} />
    </div>
  );
}
