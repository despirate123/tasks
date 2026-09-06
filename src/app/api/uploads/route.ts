import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { getCurrentUser } from "@/server/auth";
import {
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
  LOCAL_UPLOAD_DIR,
  MAX_PHOTO_BYTES,
  MAX_VIDEO_BYTES,
} from "@/lib/storage";

/**
 * Загрузка доказательств.
 *
 * ВАЖНО про продакшн: здесь файл идёт через Node-процесс, и это допустимо
 * только для локальной разработки. В продакшене клиент получает presigned PUT
 * и загружает напрямую в S3 — иначе первое же 100-мегабайтное видео займёт
 * воркер Next.js на всё время передачи, а десяток параллельных загрузок
 * положит сервер.
 *
 * Что здесь делается всегда, независимо от способа хранения:
 *  - валидация mime и размера до записи в БД;
 *  - checksum (SHA-256) — мгновенно ловит повторную отправку того же файла.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Требуется авторизация" } },
      { status: 401 },
    );
  }

  const form = await request.formData();
  const file = form.get("file");
  const submissionId = form.get("submissionId");

  if (!(file instanceof File) || typeof submissionId !== "string") {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Файл не передан" } },
      { status: 400 },
    );
  }

  const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
  const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);
  if (!isImage && !isVideo) {
    return NextResponse.json(
      {
        error: {
          code: "UNSUPPORTED_TYPE",
          message: "Поддерживаются JPEG, PNG, WebP, HEIC, MP4, MOV и WebM",
        },
      },
      { status: 415 },
    );
  }

  const limit = isVideo ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES;
  if (file.size > limit) {
    return NextResponse.json(
      {
        error: {
          code: "TOO_LARGE",
          message: `Файл больше ${Math.round(limit / 1024 / 1024)} МБ`,
        },
      },
      { status: 413 },
    );
  }

  const submission = await db.taskSubmission.findFirst({
    where: { id: submissionId, userId: user.id },
    include: { offer: true, proofs: true },
  });
  if (!submission) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Выполнение не найдено" } },
      { status: 404 },
    );
  }
  if (!["DRAFT", "NEEDS_REVISION"].includes(submission.status)) {
    return NextResponse.json(
      {
        error: {
          code: "BAD_STATUS",
          message: "Выполнение уже отправлено на проверку",
        },
      },
      { status: 409 },
    );
  }

  const photos = submission.proofs.filter((p) => p.kind === "PHOTO").length;
  if (isImage && photos >= submission.offer.maxPhotos) {
    return NextResponse.json(
      {
        error: {
          code: "TOO_MANY_PHOTOS",
          message: `Можно приложить не больше ${submission.offer.maxPhotos} фото`,
        },
      },
      { status: 409 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const checksum = createHash("sha256").update(buffer).digest("hex");

  // Дедупликация. Совпадение у другого участника — сигнал фрода,
  // у того же — просто повторная загрузка, поэтому формулировки разные.
  const duplicate = await db.mediaAsset.findFirst({
    where: { checksum, status: "READY" },
    include: {
      proofs: { include: { submission: { select: { userId: true } } } },
    },
  });
  if (duplicate) {
    const foreign = duplicate.proofs.some((p) => p.submission.userId !== user.id);
    return NextResponse.json(
      {
        error: {
          code: "DUPLICATE_PROOF",
          message: foreign
            ? "Этот файл уже использовался как доказательство другим участником"
            : "Вы уже загружали этот файл",
        },
      },
      { status: 409 },
    );
  }

  const rawExt = file.name.includes(".") ? file.name.split(".").pop() : null;
  const ext = (rawExt ?? (isVideo ? "mp4" : "jpg")).toLowerCase().slice(0, 5);
  const storageKey = `proofs/${submission.id}/${checksum.slice(0, 16)}.${ext}`;

  await mkdir(path.join(LOCAL_UPLOAD_DIR, path.dirname(storageKey)), {
    recursive: true,
  });
  await writeFile(path.join(LOCAL_UPLOAD_DIR, storageKey), buffer);

  const media = await db.$transaction(async (tx) => {
    const asset = await tx.mediaAsset.create({
      data: {
        storageKey,
        bucket: process.env.S3_BUCKET ?? "local",
        mimeType: file.type,
        sizeBytes: file.size,
        checksum,
        status: "READY",
        uploadedById: user.id,
        meta: { originalName: file.name },
      },
    });

    await tx.submissionProof.create({
      data: {
        submissionId: submission.id,
        kind: isVideo ? "VIDEO" : "PHOTO",
        mediaId: asset.id,
        order: submission.proofs.length,
      },
    });

    return asset;
  });

  return NextResponse.json({
    mediaId: media.id,
    url: `/api/media/${media.id}`,
    kind: isVideo ? "VIDEO" : "PHOTO",
  });
}
