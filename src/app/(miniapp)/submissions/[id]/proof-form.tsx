"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Camera,
  Check,
  Loader2,
  Send,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/input";
import { SectionTitle } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import {
  removeProofAction,
  saveProofCommentAction,
  submitForReviewAction,
} from "@/server/actions";
import { haptic, hapticNotify } from "@/components/telegram-init";

type Proof = {
  id: string;
  kind: "PHOTO" | "VIDEO";
  url: string | null;
  mimeType: string;
};

type Requirements = {
  requirePhoto: boolean;
  requireVideo: boolean;
  requireComment: boolean;
  minPhotos: number;
  maxPhotos: number;
  hint: string | null;
};

/** Сжатие на клиенте: 4-мегабайтный скриншот с iPhone → ~400 КБ без потери
 *  читаемости. Экономит трафик пользователя и время загрузки на мобильной сети. */
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/heic") return file;

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;

  const maxSide = 1920;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 1_500_000) return file;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.85),
  );
  if (!blob || blob.size >= file.size) return file;

  return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), {
    type: "image/jpeg",
  });
}

export function ProofForm({
  submissionId,
  comment: initialComment,
  proofs,
  requirements,
  missing,
  isRevision,
}: {
  submissionId: string;
  comment: string;
  proofs: Proof[];
  requirements: Requirements;
  missing: string[];
  isRevision: boolean;
}) {
  const router = useRouter();
  const [comment, setComment] = useState(initialComment);
  const [uploading, setUploading] = useState<{ name: string; progress: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  const photoCount = proofs.filter((p) => p.kind === "PHOTO").length;
  const videoCount = proofs.filter((p) => p.kind === "VIDEO").length;

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);

    for (const raw of Array.from(files)) {
      const file = await compressImage(raw);
      setUploading((prev) => [...prev, { name: file.name, progress: 0 }]);

      try {
        const body = new FormData();
        body.append("file", file);
        body.append("submissionId", submissionId);

        const res = await fetch("/api/uploads", { method: "POST", body });
        const data = (await res.json()) as
          | { mediaId: string }
          | { error: { message: string } };

        if (!res.ok || "error" in data) {
          setError("error" in data ? data.error.message : "Не удалось загрузить файл");
          hapticNotify("error");
        } else {
          haptic("light");
        }
      } catch {
        setError("Не удалось загрузить файл. Проверьте соединение");
      } finally {
        setUploading((prev) => prev.filter((u) => u.name !== file.name));
      }
    }

    router.refresh();
  };

  const saveComment = () => {
    startTransition(async () => {
      const result = await saveProofCommentAction(submissionId, comment);
      if (result.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  const remove = (proofId: string) => {
    haptic("light");
    startTransition(async () => {
      await removeProofAction(submissionId, proofId);
      router.refresh();
    });
  };

  const submit = () => {
    setError(null);
    haptic("medium");
    startTransition(async () => {
      // Комментарий сохраняем перед отправкой: пользователь мог набрать
      // текст и сразу нажать «Отправить», не нажимая «Сохранить».
      if (comment !== initialComment) {
        await saveProofCommentAction(submissionId, comment);
      }
      const result = await submitForReviewAction(submissionId);
      if (result.ok) {
        hapticNotify("success");
        router.refresh();
      } else {
        setError(result.error);
        hapticNotify("error");
      }
    });
  };

  const canSubmit = missing.length === 0 || comment.trim().length >= 10;

  return (
    <div className="space-y-4">
      <div className="space-y-2.5">
        <SectionTitle>
          {isRevision ? "Доработайте доказательства" : "Загрузите доказательства"}
        </SectionTitle>

        <Card className="space-y-3.5 p-4">
          {requirements.hint ? (
            <div className="flex gap-2.5 rounded-2xl bg-info/8 p-3 ring-1 ring-inset ring-info/20">
              <AlertTriangle className="size-4 shrink-0 text-info" />
              <p className="text-[12.5px] leading-relaxed text-content-secondary">
                {requirements.hint}
              </p>
            </div>
          ) : null}

          {proofs.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {proofs.map((proof) => (
                <div
                  key={proof.id}
                  className="group relative aspect-square overflow-hidden rounded-xl bg-surface-overlay ring-1 ring-border-subtle"
                >
                  {proof.kind === "PHOTO" && proof.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={proof.url}
                      alt="Доказательство"
                      className="size-full object-cover"
                    />
                  ) : (
                    <span className="flex size-full flex-col items-center justify-center gap-1 text-content-muted">
                      <Video className="size-5" />
                      <span className="text-[10px]">видео</span>
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(proof.id)}
                    aria-label="Удалить доказательство"
                    className="absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-lg bg-surface-base/85 text-content-secondary backdrop-blur transition-transform duration-300 ease-soft hover:scale-105 active:scale-90"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}

              {uploading.map((item) => (
                <div
                  key={item.name}
                  className="flex aspect-square items-center justify-center rounded-xl bg-surface-overlay ring-1 ring-border-subtle"
                >
                  <Loader2 className="size-5 animate-spin text-brand-300" />
                </div>
              ))}
            </div>
          ) : uploading.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {uploading.map((item) => (
                <div
                  key={item.name}
                  className="flex aspect-square items-center justify-center rounded-xl bg-surface-overlay ring-1 ring-border-subtle"
                >
                  <Loader2 className="size-5 animate-spin text-brand-300" />
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {requirements.requirePhoto || photoCount > 0 ? (
              <>
                <input
                  ref={photoInput}
                  type="file"
                  accept="image/*"
                  multiple
                  capture="environment"
                  className="hidden"
                  onChange={(e) => void upload(e.target.files)}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => photoInput.current?.click()}
                  disabled={photoCount >= requirements.maxPhotos}
                >
                  <Camera />
                  Фото
                  <span className="tabular text-content-muted">
                    {photoCount}/{requirements.maxPhotos}
                  </span>
                </Button>
              </>
            ) : null}

            {requirements.requireVideo || videoCount > 0 ? (
              <>
                <input
                  ref={videoInput}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => void upload(e.target.files)}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => videoInput.current?.click()}
                  disabled={videoCount >= 1}
                >
                  <Video />
                  Видео
                  <span className="tabular text-content-muted">{videoCount}/1</span>
                </Button>
              </>
            ) : null}
          </div>

          <Field
            label={
              requirements.requireComment
                ? "Комментарий (обязательно)"
                : "Комментарий"
            }
            hint={`${comment.trim().length} из 2000 символов`}
          >
            <Textarea
              value={comment}
              maxLength={2000}
              onChange={(e) => setComment(e.target.value)}
              onBlur={() => {
                if (comment !== initialComment) saveComment();
              }}
              placeholder="Опишите, что именно вы сделали: номер заказа, дата, имя аккаунта — всё, что поможет быстро подтвердить выполнение."
            />
          </Field>

          {saved ? (
            <p className="inline-flex items-center gap-1.5 text-[12px] text-money-400">
              <Check className="size-3.5" />
              Комментарий сохранён
            </p>
          ) : null}
        </Card>
      </div>

      {missing.length > 0 ? (
        <div className="flex gap-2.5 rounded-card bg-medium/8 p-3.5 ring-1 ring-inset ring-medium/20">
          <AlertTriangle className="size-4 shrink-0 text-medium" />
          <div className="min-w-0 text-[12.5px] leading-relaxed">
            <p className="font-medium text-medium">Чтобы отправить, нужно:</p>
            <ul className="mt-1 space-y-0.5 text-content-secondary">
              {missing.map((item) => (
                <li key={item}>— {item}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="flex items-start gap-2.5 rounded-card bg-hard/8 p-3.5 ring-1 ring-inset ring-hard/20">
          <X className="size-4 shrink-0 text-hard" />
          <p className="text-[12.5px] leading-relaxed text-content-secondary">{error}</p>
        </div>
      ) : null}

      <Button
        variant={canSubmit && missing.length === 0 ? "money" : "secondary"}
        size="lg"
        block
        onClick={submit}
        disabled={pending || uploading.length > 0 || missing.length > 0}
        className={cn(pending && "opacity-70")}
      >
        {pending ? <Loader2 className="animate-spin" /> : <Send />}
        Отправить на проверку
      </Button>
    </div>
  );
}
