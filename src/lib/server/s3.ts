import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuid } from "uuid";
import { getAwsEnv } from "@/lib/server/env";

let cachedClient: S3Client | null = null;

function getS3Client() {
  if (cachedClient) {
    return cachedClient;
  }

  const env = getAwsEnv();

  cachedClient = new S3Client({
    region: env.AWS_REGION,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  });

  return cachedClient;
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function createPresignedUploadUrl({
  folder,
  fileName,
  contentType,
}: {
  folder: string;
  fileName: string;
  contentType: string;
}) {
  const env = getAwsEnv();
  const safeFileName = sanitizeFileName(fileName);
  const key = `${folder.replace(/^\/+|\/+$/g, "")}/${uuid()}-${safeFileName}`;

  const command = new PutObjectCommand({
    Bucket: env.AWS_S3_BUCKET,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(getS3Client(), command, {
    expiresIn: 60 * 5,
  });

  const fileUrl = `https://${env.AWS_S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${key}`;

  return { uploadUrl, fileUrl };
}
