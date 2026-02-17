import { ArtistsForm } from "@/components/admin/artists-form";
import { PageTitle } from "@/components/admin/page-title";

export default function NewArtistPage() {
  return (
    <div>
      <PageTitle title="새 작가" description="작가를 생성합니다." />
      <ArtistsForm mode="create" />
    </div>
  );
}
