"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PageTitle } from "@/components/admin/page-title";
import { requestJson } from "@/lib/client/admin-api";
import { Button } from "@/components/ui/button";

type UserProfile = {
  id: number;
  nickname: string;
  residency: "POHANG" | "NON_POHANG";
  age_group: "TEEN" | "20S" | "30S" | "40S" | "50S" | "60S" | "70_PLUS";
  language: "ko" | "en";
  notifications_enabled: number;
  created_at: string;
  updated_at: string;
};

type CreatedCourse = {
  id: number;
  title_ko: string;
  title_en: string;
  is_official: number;
  likes_count: number;
  created_at: string;
  deleted_at: string | null;
};

type LikedCourse = {
  id: number;
  title_ko: string;
  title_en: string;
  is_official: number;
  likes_count: number;
  liked_at: string;
  deleted_at: string | null;
};

type LikedArtwork = {
  id: number;
  title_ko: string;
  title_en: string;
  category: "STEEL_ART" | "PUBLIC_ART";
  likes_count: number;
  liked_at: string;
  deleted_at: string | null;
};

type Stamp = {
  checkin_id: number;
  stamped_at: string;
  course_id: number;
  course_title_ko: string;
  course_title_en: string;
  course_item_id: number;
  course_item_seq: number;
  artwork_id: number;
  artwork_title_ko: string;
  artwork_title_en: string;
};

type UserDetail = {
  user: UserProfile;
  summary: {
    createdCourses: number;
    likedCourses: number;
    likedArtworks: number;
    stamps: number;
  };
  createdCourses: CreatedCourse[];
  likedCourses: LikedCourse[];
  likedArtworks: LikedArtwork[];
  stamps: Stamp[];
};

const residencyLabelMap: Record<UserProfile["residency"], string> = {
  POHANG: "포항",
  NON_POHANG: "포항 외",
};

const ageGroupLabelMap: Record<UserProfile["age_group"], string> = {
  TEEN: "10대",
  "20S": "20대",
  "30S": "30대",
  "40S": "40대",
  "50S": "50대",
  "60S": "60대",
  "70_PLUS": "70대 이상",
};

const languageLabelMap: Record<UserProfile["language"], string> = {
  ko: "한국어",
  en: "영어",
};

const artworkCategoryLabelMap: Record<LikedArtwork["category"], string> = {
  STEEL_ART: "스틸아트",
  PUBLIC_ART: "공공미술",
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ko-KR");
}

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const id = Array.isArray(params.id) ? params.id[0] : params.id;
    if (!id) return;

    const fetchDetail = async () => {
      try {
        const response = await requestJson<UserDetail>(`/api/admin/users/${id}`);
        setDetail(response);
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "조회 실패");
      }
    };

    void fetchDetail();
  }, [params.id]);

  if (error) {
    return (
      <div>
        <PageTitle title="사용자" description="사용자 상세 조회 중 오류가 발생했습니다." />
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div>
        <PageTitle title="사용자" description="사용자 상세를 조회합니다." />
        <p>로딩 중...</p>
      </div>
    );
  }

  const { user, summary, createdCourses, likedCourses, likedArtworks, stamps } = detail;

  return (
    <div className="space-y-6">
      <PageTitle title={`사용자 #${user.id}`} description={`${user.nickname} 상세 정보`} />

      <div className="rounded-md border p-4">
        <h2 className="mb-3 text-lg font-semibold">기본 정보</h2>
        <dl className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">닉네임</dt>
            <dd>{user.nickname}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">거주지</dt>
            <dd>{residencyLabelMap[user.residency]}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">연령대</dt>
            <dd>{ageGroupLabelMap[user.age_group]}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">언어</dt>
            <dd>{languageLabelMap[user.language]}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">알림 수신 여부</dt>
            <dd>{user.notifications_enabled ? "예" : "아니오"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">가입 일시</dt>
            <dd>{formatDateTime(user.created_at)}</dd>
          </div>
        </dl>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">만든 코스</p>
          <p className="text-xl font-semibold">{summary.createdCourses}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">좋아요 코스</p>
          <p className="text-xl font-semibold">{summary.likedCourses}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">좋아요 작품</p>
          <p className="text-xl font-semibold">{summary.likedArtworks}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">스탬프</p>
          <p className="text-xl font-semibold">{summary.stamps}</p>
        </div>
      </div>

      <div className="rounded-md border p-4">
        <h2 className="mb-3 text-lg font-semibold">이 사용자가 만든 코스</h2>
        {createdCourses.length === 0 ? (
          <p className="text-sm text-muted-foreground">생성한 코스가 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {createdCourses.map((course) => (
              <li key={course.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{course.title_ko}</p>
                  <p className="text-xs text-muted-foreground">
                    좋아요 수: {course.likes_count} / 생성일: {formatDateTime(course.created_at)} / 삭제 여부:{" "}
                    {course.deleted_at ? "예" : "아니오"}
                  </p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/admin/courses/${course.id}`}>코스 보기</Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-md border p-4">
        <h2 className="mb-3 text-lg font-semibold">좋아요한 코스</h2>
        {likedCourses.length === 0 ? (
          <p className="text-sm text-muted-foreground">좋아요한 코스가 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {likedCourses.map((course) => (
              <li key={course.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{course.title_ko}</p>
                  <p className="text-xs text-muted-foreground">
                    좋아요 시각: {formatDateTime(course.liked_at)} / 좋아요 수: {course.likes_count}
                  </p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/admin/courses/${course.id}`}>코스 보기</Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-md border p-4">
        <h2 className="mb-3 text-lg font-semibold">좋아요한 작품</h2>
        {likedArtworks.length === 0 ? (
          <p className="text-sm text-muted-foreground">좋아요한 작품이 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {likedArtworks.map((artwork) => (
              <li key={artwork.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{artwork.title_ko}</p>
                  <p className="text-xs text-muted-foreground">
                    좋아요 시각: {formatDateTime(artwork.liked_at)} / 작품 유형:{" "}
                    {artworkCategoryLabelMap[artwork.category]} / 좋아요 수: {artwork.likes_count}
                  </p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/admin/artworks/${artwork.id}`}>작품 보기</Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-md border p-4">
        <h2 className="mb-3 text-lg font-semibold">스탬프(체크인) 내역</h2>
        {stamps.length === 0 ? (
          <p className="text-sm text-muted-foreground">스탬프 내역이 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {stamps.map((stamp) => (
              <li key={stamp.checkin_id} className="rounded-md border px-3 py-2">
                <p className="text-sm font-medium">
                  {stamp.course_title_ko} / #{stamp.course_item_seq} / {stamp.artwork_title_ko}
                </p>
                <p className="text-xs text-muted-foreground">
                  스탬프 시각: {formatDateTime(stamp.stamped_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
