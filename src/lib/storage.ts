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

export const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

export function isS3Configured() {
  return Boolean(
    process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY &&
      process.env.S3_BUCKET,
  );
}

/** Путь к локальному файлу пруфа. `null`, если ключ пытается выйти из каталога. */
export function resolveLocalUploadPath(storageKey: string): string | null {
  if (!storageKey || storageKey.includes("\0") || storageKey.includes("..")) {
    return null;
  }
  if (path.isAbsolute(storageKey) || storageKey.includes("\\")) return null;

  const root = path.resolve(LOCAL_UPLOAD_DIR);
  const resolved = path.resolve(root, storageKey);
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (resolved !== root && !resolved.startsWith(prefix)) return null;
  return resolved;
}
