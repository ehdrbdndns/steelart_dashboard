import type { NextRequest } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { fail, handleRouteError, ok } from "@/lib/server/api-response";
import { withTransaction } from "@/lib/server/tx";
import {
  courseItemAddSchema,
  idParamSchema,
} from "@/lib/server/validators/admin";

export const dynamic = "force-dynamic";

type CourseItemRow = RowDataPacket & {
  id: number;
  course_id: number;
  seq: number;
  artwork_id: number;
  title_ko: string;
  title_en: string;
  photo_day_url: string;
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: courseId } = idParamSchema.parse(await params);

    const rows = await withTransaction(async (connection) => {
      const [result] = await connection.query<CourseItemRow[]>(
        `SELECT ci.id, ci.course_id, ci.seq, ci.artwork_id,
                a.title_ko, a.title_en, a.photo_day_url
         FROM course_items ci
         INNER JOIN artworks a ON a.id = ci.artwork_id
         WHERE ci.course_id = ?
         ORDER BY ci.seq ASC`,
        [courseId],
      );

      return result;
    });

    return ok(rows);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: courseId } = idParamSchema.parse(await params);
    const payload = courseItemAddSchema.parse(await request.json());

    const created = await withTransaction(async (connection) => {
      const [existing] = await connection.query<(RowDataPacket & { id: number; seq: number })[]>(
        `SELECT id, seq FROM course_items WHERE course_id = ? ORDER BY seq ASC FOR UPDATE`,
        [courseId],
      );

      const requestedSeq = payload.seq ?? existing.length + 1;
      if (requestedSeq < 1 || requestedSeq > existing.length + 1) {
        throw new Error("INVALID_SEQ");
      }

      await connection.query(
        `UPDATE course_items SET seq = seq + 1000 WHERE course_id = ?`,
        [courseId],
      );

      let currentSeq = 1;
      for (const row of existing) {
        if (currentSeq === requestedSeq) {
          currentSeq += 1;
        }

        await connection.query(
          `UPDATE course_items SET seq = ? WHERE course_id = ? AND id = ?`,
          [currentSeq, courseId, row.id],
        );

        currentSeq += 1;
      }

      const [inserted] = await connection.query<ResultSetHeader>(
        `INSERT INTO course_items (course_id, seq, artwork_id, created_at)
         VALUES (?, ?, ?, NOW())`,
        [courseId, requestedSeq, payload.artwork_id],
      );

      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT * FROM course_items WHERE id = ?`,
        [inserted.insertId],
      );

      return rows[0];
    });

    return ok(created);
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_SEQ") {
      return fail(400, "VALIDATION_ERROR", "유효하지 않은 seq 값입니다.");
    }

    return handleRouteError(error);
  }
}
