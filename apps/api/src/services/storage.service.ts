import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';
import { logger } from '../lib/logger';

// ── Check if R2 is configured ──
const isR2Configured = !!(
  env.R2_ACCOUNT_ID &&
  env.R2_ACCESS_KEY_ID &&
  env.R2_SECRET_ACCESS_KEY
);

let s3Client: S3Client | null = null;

if (isR2Configured) {
  logger.info('📦 Storage: Initializing Cloudflare R2 client');
  s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    },
  });
} else {
  logger.info('📦 Storage: R2 credentials missing; falling back to Local Disk Storage');
  // Ensure the local uploads directory exists
  const uploadDir = path.join(__dirname, '../../uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
}

export interface UploadedFile {
  url: string;
  key: string;
}

/**
 * Upload file to storage (R2 or Local disk fallback)
 */
export async function uploadFile(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<UploadedFile> {
  const fileExtension = path.extname(fileName);
  const uniqueKey = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}${fileExtension}`;

  if (isR2Configured && s3Client) {
    try {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: env.R2_BUCKET_NAME,
          Key: uniqueKey,
          Body: fileBuffer,
          ContentType: mimeType,
        })
      );

      // Return public R2 URL or placeholder url if R2_PUBLIC_URL is not set
      const url = env.R2_PUBLIC_URL
        ? `${env.R2_PUBLIC_URL}/${uniqueKey}`
        : `/api/files/download/${uniqueKey}`;

      return { url, key: uniqueKey };
    } catch (err) {
      logger.error({ err }, 'R2 upload failed, falling back to local');
    }
  }

  // Fallback to local storage
  const uploadDir = path.join(__dirname, '../../uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const localPath = path.join(uploadDir, uniqueKey);
  await fs.promises.writeFile(localPath, fileBuffer);

  // Return local static endpoint url
  const url = `/uploads/${uniqueKey}`;
  return { url, key: uniqueKey };
}

/**
 * Generate a signed url or static fallback url for file download
 */
export async function getDownloadUrl(key: string): Promise<string> {
  if (isR2Configured && s3Client) {
    try {
      const command = new GetObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: key,
      });
      return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    } catch (err) {
      logger.error({ err }, 'Failed to generate S3 pre-signed URL');
    }
  }

  return `/uploads/${key}`;
}
