import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { getCurrentUser, hasRole } from "@/server/auth";
import { LOCAL_UPLOAD_DIR } from "@/lib/storage";

/**
 * Выдача доказательства.
 *
 * Пруфы не бывают публичными: доступ есть только у владельца выполнения и
 * у персонала от MODERATOR и выше. В продакшене вместо чтения с диска здесь
 * выдаётся 302 на presigned GET со сроком жизни 5 минут — сам файл лежит
 * в приватном S3-бакете и не отдаётся по прямой ссылке никогда.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const viewer = await getCurrentUser();
  if (!viewer) return new NextResponse("Unauthorized", { status: 401 });

  const media = await db.mediaAsset.findUnique({
    where: { id },
    include: { proofs: { include: { submission: { select: { userId: true } } } } },
  });
  if (!media || media.status !== "READY") {
    return new NextResponse("Not found", { status: 404 });
  }

  const isOwner =
    media.uploadedById === viewer.id ||
    media.proofs.some((p) => p.submission.userId === viewer.id);

  if (!isOwner && !hasRole(viewer, "MODERATOR")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  try {
    const data = await readFile(path.join(LOCAL_UPLOAD_DIR, media.storageKey));
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": media.mimeType,
        "Content-Length": String(media.sizeBytes),
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
