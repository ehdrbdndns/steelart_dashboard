import { Buffer } from "node:buffer";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createDbConnection } from "./lib/db-connection.mjs";
import {
  fetchImageDimensions,
  getImageDimensions,
} from "./lib/image-dimensions.mjs";

const connection = await createDbConnection();
const s3Client = process.env.AWS_REGION
  ? new S3Client({
      region: process.env.AWS_REGION,
      credentials:
        process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            }
          : undefined,
    })
  : null;

function parseS3Url(imageUrl) {
  const parsed = new URL(imageUrl);
  const virtualHostedMatch = parsed.hostname.match(/^(.+)\.s3[.-][^.]+\.amazonaws\.com$/);

  if (virtualHostedMatch) {
    return {
      bucket: virtualHostedMatch[1],
      key: decodeURIComponent(parsed.pathname.replace(/^\/+/, "")),
    };
  }

  const pathParts = parsed.pathname.replace(/^\/+/, "").split("/");
  if (parsed.hostname.startsWith("s3.") && pathParts.length > 1) {
    const [bucket, ...rest] = pathParts;
    return {
      bucket,
      key: decodeURIComponent(rest.join("/")),
    };
  }

  return null;
}

async function fetchImageDimensionsFromS3(imageUrl) {
  if (!s3Client) {
    throw new Error("S3 fallback을 위한 AWS 설정이 없습니다.");
  }

  const s3Ref = parseS3Url(imageUrl);
  if (!s3Ref) {
    throw new Error("S3 URL을 해석할 수 없습니다.");
  }

  const keyCandidates = [s3Ref.key];
  if (s3Ref.key.includes("+")) {
    keyCandidates.push(s3Ref.key.replace(/\+/g, " "));
  }

  let lastError;
  for (const key of keyCandidates) {
    try {
      const response = await s3Client.send(
        new GetObjectCommand({
          Bucket: s3Ref.bucket,
          Key: key,
        }),
      );

      const bytes = await response.Body?.transformToByteArray?.();
      if (!bytes) {
        throw new Error("S3 object body를 읽지 못했습니다.");
      }

      return getImageDimensions(Buffer.from(bytes));
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("S3 fallback에 실패했습니다.");
}

try {
  const [rows] = await connection.query(
    `SELECT id, artwork_id, image_url
     FROM artwork_images
     WHERE image_width IS NULL OR image_height IS NULL
     ORDER BY id ASC`,
  );

  let updatedRows = 0;
  let failedRows = 0;

  for (const row of rows) {
    try {
      let dimensions;

      try {
        dimensions = await fetchImageDimensions(row.image_url);
      } catch (fetchError) {
        dimensions = await fetchImageDimensionsFromS3(row.image_url);
      }

      await connection.query(
        `UPDATE artwork_images
         SET image_width = ?, image_height = ?
         WHERE id = ?`,
        [dimensions.width, dimensions.height, row.id],
      );

      updatedRows += 1;
      console.log(
        `[updated] id=${row.id} artwork_id=${row.artwork_id} width=${dimensions.width} height=${dimensions.height}`,
      );
    } catch (error) {
      failedRows += 1;
      const message = error instanceof Error ? error.message : "unknown error";
      console.error(
        `[failed] id=${row.id} artwork_id=${row.artwork_id} url=${row.image_url} error=${message}`,
      );
    }
  }

  const [remainingRows] = await connection.query(
    `SELECT COUNT(*) AS total
     FROM artwork_images
     WHERE image_width IS NULL OR image_height IS NULL`,
  );

  console.log("Artwork image dimension backfill completed.");
  console.log(`target_rows=${rows.length}`);
  console.log(`updated_rows=${updatedRows}`);
  console.log(`failed_rows=${failedRows}`);
  console.log(`remaining_null_rows=${remainingRows[0]?.total ?? 0}`);
} finally {
  await connection.end();
}
