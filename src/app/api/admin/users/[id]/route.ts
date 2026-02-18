import type { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { fail, handleRouteError, ok } from "@/lib/server/api-response";
import { query } from "@/lib/server/db";
import { idParamSchema } from "@/lib/server/validators/admin";

export const dynamic = "force-dynamic";

type UserProfileRow = RowDataPacket & {
  id: number;
  nickname: string;
  residency: "POHANG" | "NON_POHANG";
  age_group: "TEEN" | "20S" | "30S" | "40S" | "50S" | "60S" | "70_PLUS";
  language: "ko" | "en";
  notifications_enabled: number;
  created_at: string;
  updated_at: string;
};

type CreatedCourseRow = RowDataPacket & {
  id: number;
  title_ko: string;
  title_en: string;
  is_official: number;
  likes_count: number;
  created_at: string;
  deleted_at: string | null;
};

type LikedCourseRow = RowDataPacket & {
  id: number;
  title_ko: string;
  title_en: string;
  is_official: number;
  likes_count: number;
  liked_at: string;
  deleted_at: string | null;
};

type LikedArtworkRow = RowDataPacket & {
  id: number;
  title_ko: string;
  title_en: string;
  category: "STEEL_ART" | "PUBLIC_ART";
  likes_count: number;
  liked_at: string;
  deleted_at: string | null;
};

type StampRow = RowDataPacket & {
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

type SelectedCourseRow = RowDataPacket & {
  course_id: number;
  selected_at: string;
  title_ko: string;
  title_en: string;
  is_official: number;
  deleted_at: string | null;
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: userId } = idParamSchema.parse(await params);

    const userRows = await query<UserProfileRow[]>(
      `SELECT id, nickname, residency, age_group, language, notifications_enabled, created_at, updated_at
       FROM users
       WHERE id = ?`,
      [userId],
    );

    const user = userRows[0];
    if (!user) {
      return fail(404, "NOT_FOUND", "사용자를 찾을 수 없습니다.");
    }

    const [createdCourses, likedCourses, likedArtworks, stamps, selectedCourses] =
      await Promise.all([
        query<CreatedCourseRow[]>(
          `SELECT c.id, c.title_ko, c.title_en, c.is_official, c.likes_count, c.created_at, c.deleted_at
           FROM courses c
           WHERE c.created_by_user_id = ?
           ORDER BY c.created_at DESC, c.id DESC`,
          [userId],
        ),
        query<LikedCourseRow[]>(
          `SELECT c.id, c.title_ko, c.title_en, c.is_official, c.likes_count, cl.created_at AS liked_at, c.deleted_at
           FROM course_likes cl
           INNER JOIN courses c ON c.id = cl.course_id
           WHERE cl.user_id = ?
           ORDER BY cl.created_at DESC, c.id DESC`,
          [userId],
        ),
        query<LikedArtworkRow[]>(
          `SELECT a.id, a.title_ko, a.title_en, a.category, a.likes_count, al.created_at AS liked_at, a.deleted_at
           FROM artwork_likes al
           INNER JOIN artworks a ON a.id = al.artwork_id
           WHERE al.user_id = ?
           ORDER BY al.created_at DESC, a.id DESC`,
          [userId],
        ),
        query<StampRow[]>(
          `SELECT cc.id AS checkin_id, cc.created_at AS stamped_at,
                  c.id AS course_id, c.title_ko AS course_title_ko, c.title_en AS course_title_en,
                  ci.id AS course_item_id, ci.seq AS course_item_seq,
                  a.id AS artwork_id, a.title_ko AS artwork_title_ko, a.title_en AS artwork_title_en
           FROM course_checkins cc
           INNER JOIN courses c ON c.id = cc.course_id
           INNER JOIN course_items ci ON ci.id = cc.course_item_id
           INNER JOIN artworks a ON a.id = ci.artwork_id
           WHERE cc.user_id = ?
           ORDER BY cc.created_at DESC, cc.id DESC`,
          [userId],
        ),
        query<SelectedCourseRow[]>(
          `SELECT usc.course_id, usc.created_at AS selected_at,
                  c.title_ko, c.title_en, c.is_official, c.deleted_at
           FROM user_selected_courses usc
           INNER JOIN courses c ON c.id = usc.course_id
           WHERE usc.user_id = ?`,
          [userId],
        ),
      ]);

    return ok({
      user,
      summary: {
        createdCourses: createdCourses.length,
        likedCourses: likedCourses.length,
        likedArtworks: likedArtworks.length,
        stamps: stamps.length,
      },
      selectedCourse: selectedCourses[0] ?? null,
      createdCourses,
      likedCourses,
      likedArtworks,
      stamps,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
