import path from "node:path";

/**
 * Локальное хранилище доказательств для разработки.
 *
 * В продакшене здесь S3: клиент получает presigned PUT и загружает файл
 * напрямую в приватный бакет, минуя наш сервер. Модератору файл отдаётся
 * по presigned GET со сроком жизни 5 минут — прямых публичных ссылок
 * на доказательства не существует.
 */
export const LOCAL_UPLOAD_DIR = path.join(process.cwd(), ".uploads");

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
];

export const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

export function isS3Configured() {
  return Boolean(
    process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY &&
      process.env.S3_BUCKET,
  );
}
