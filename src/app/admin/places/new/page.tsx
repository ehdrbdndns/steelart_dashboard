import { PlacesForm } from "@/components/admin/places-form";
import { PageTitle } from "@/components/admin/page-title";

export default function NewPlacePage() {
  return (
    <div>
      <PageTitle title="새 장소" description="장소를 생성합니다." />
      <PlacesForm mode="create" />
    </div>
  );
}
