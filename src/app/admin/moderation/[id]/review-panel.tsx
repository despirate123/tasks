"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, PencilLine, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { SectionTitle } from "@/components/ui/misc";
import {
  approveSubmissionAction,
  claimSubmissionAction,
  rejectSubmissionAction,
  requestRevisionAction,
} from "@/server/actions";

type Reason = { id: string; title: string; allowsRevision: boolean };

/**
 * Рабочая панель модератора.
 *
 * Модератор — узкое место экономики продукта: если он обрабатывает 40 заявок
 * в час вместо 240, стоимость пропускной способности вырастает в шесть раз.
 * Поэтому здесь горячие клавиши, автоматический переход к следующему
 * выполнению и три исхода вместо двух. Мышь нужна только для просмотра пруфов.
 *
 * Клавиши: A — одобрить, R — отклонить, V — на доработку, 1..9 — причина.
 */
export function ReviewPanel({
  submissionId,
  nextId,
  reasons,
  lockedBy,
}: {
  submissionId: string;
  nextId: string | null;
  reasons: Reason[];
  lockedBy: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"idle" | "reject" | "revision">("idle");
  const [reasonId, setReasonId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Лок за модератором при открытии карточки: двое не должны проверять
  // одно и то же выполнение и принимать противоположные решения.
  useEffect(() => {
    void claimSubmissionAction(submissionId);
  }, [submissionId]);

  const advance = useCallback(() => {
    if (nextId) router.push(`/admin/moderation/${nextId}`);
    else router.push("/admin/moderation");
  }, [nextId, router]);

  const approve = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const result = await approveSubmissionAction(submissionId, comment || undefined);
      if (result.ok) advance();
      else setError(result.error);
    });
  }, [submissionId, comment, advance]);

  const reject = useCallback(() => {
    if (!reasonId) {
      setError("Выберите причину отказа");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await rejectSubmissionAction(
        submissionId,
        reasonId,
        comment || undefined,
      );
      if (result.ok) advance();
      else setError(result.error);
    });
  }, [submissionId, reasonId, comment, advance]);

  const revise = useCallback(() => {
    if (!comment.trim()) {
      setError("Напишите, что именно нужно доработать");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await requestRevisionAction(submissionId, reasonId, comment);
      if (result.ok) advance();
      else setError(result.error);
    });
  }, [submissionId, reasonId, comment, advance]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Не перехватываем клавиши, когда модератор пишет комментарий.
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const key = event.key.toLowerCase();
      if (key === "a") {
        event.preventDefault();
        approve();
      } else if (key === "r") {
        event.preventDefault();
        setMode("reject");
      } else if (key === "v") {
        event.preventDefault();
        setMode("revision");
      } else if (/^[1-9]$/.test(key)) {
        const index = Number(key) - 1;
        if (reasons[index]) {
          event.preventDefault();
          setReasonId(reasons[index].id);
          if (mode === "idle") setMode("reject");
        }
      } else if (key === "escape") {
        setMode("idle");
        setReasonId(null);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [approve, reasons, mode]);

  const visibleReasons =
    mode === "revision" ? reasons.filter((r) => r.allowsRevision) : reasons;

  return (
    <div className="space-y-2.5">
      <SectionTitle>Решение</SectionTitle>

      <Card className="space-y-3.5 p-4">
        {lockedBy ? (
          <p className="rounded-2xl bg-info/8 p-3 text-[12px] leading-relaxed text-content-secondary ring-1 ring-inset ring-info/20">
            Выполнение уже открыто модератором {lockedBy}. Лок снимается
            автоматически через 10 минут.
          </p>
        ) : null}

        <div className="hidden lg:grid lg:grid-cols-3 lg:gap-2">
          <DecisionButtons
            pending={pending}
            mode={mode}
            onApprove={approve}
            onRevision={() => setMode(mode === "revision" ? "idle" : "revision")}
            onReject={() => setMode(mode === "reject" ? "idle" : "reject")}
          />
        </div>

        <p className="hidden text-[11px] text-content-muted lg:block">
          Горячие клавиши: <kbd className="font-mono">A</kbd> одобрить ·{" "}
          <kbd className="font-mono">V</kbd> доработка ·{" "}
          <kbd className="font-mono">R</kbd> отклонить ·{" "}
          <kbd className="font-mono">1–9</kbd> причина
        </p>

        {mode !== "idle" ? (
          <div className="space-y-3 border-t border-border-subtle pt-3.5">
            <div>
              <p className="mb-2 text-[12px] font-medium text-content-secondary">
                {mode === "reject" ? "Причина отказа" : "Что доработать"}
              </p>
              <div className="space-y-1.5">
                {visibleReasons.map((reason, index) => (
                  <button
                    key={reason.id}
                    type="button"
                    onClick={() => setReasonId(reason.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[12.5px] ring-1 ring-inset transition",
                      reasonId === reason.id
                        ? "bg-brand-500/12 text-brand-300 ring-brand-500/30"
                        : "bg-surface-input text-content-secondary ring-border-strong hover:text-content-primary",
                    )}
                  >
                    <span className="tabular w-4 shrink-0 text-[11px] text-content-muted">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">{reason.title}</span>
                    {reasonId === reason.id ? (
                      <Check className="size-3.5 shrink-0" />
                    ) : null}
                  </button>
                ))}
              </div>
            </div>

            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={
                mode === "reject"
                  ? "Пояснение для участника (необязательно)"
                  : "Что именно нужно дозагрузить или исправить"
              }
              className="min-h-20 text-[13px]"
            />

            <Button
              variant={mode === "reject" ? "danger" : "primary"}
              block
              onClick={mode === "reject" ? reject : revise}
              disabled={pending}
            >
              {pending ? <Loader2 className="animate-spin" /> : null}
              {mode === "reject"
                ? "Подтвердить отказ"
                : "Отправить на доработку"}
            </Button>
          </div>
        ) : null}

        {error ? (
          <p className="rounded-2xl bg-hard/8 p-3 text-[12px] leading-relaxed text-hard ring-1 ring-inset ring-hard/20">
            {error}
          </p>
        ) : null}

        <p className="border-t border-border-subtle pt-3 text-[11px] leading-relaxed text-content-muted">
          {nextId
            ? "После решения автоматически откроется следующее выполнение из очереди."
            : "Это последнее выполнение в очереди."}
        </p>
      </Card>

      <div
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 gap-2 border-t border-border-subtle bg-surface-base px-3 pt-2 lg:hidden"
        style={{
          paddingBottom: "max(0.65rem, var(--safe-bottom))",
          paddingLeft: "max(0.75rem, var(--safe-left))",
          paddingRight: "max(0.75rem, var(--safe-right))",
        }}
      >
        <DecisionButtons
          pending={pending}
          mode={mode}
          compact
          onApprove={approve}
          onRevision={() => setMode(mode === "revision" ? "idle" : "revision")}
          onReject={() => setMode(mode === "reject" ? "idle" : "reject")}
        />
      </div>
    </div>
  );
}

function DecisionButtons({
  pending,
  mode,
  compact,
  onApprove,
  onRevision,
  onReject,
}: {
  pending: boolean;
  mode: "idle" | "reject" | "revision";
  compact?: boolean;
  onApprove: () => void;
  onRevision: () => void;
  onReject: () => void;
}) {
  return (
    <>
      <Button
        variant="success"
        size={compact ? "sm" : "md"}
        onClick={onApprove}
        disabled={pending}
        title="Одобрить (A)"
        className={compact ? "px-2" : undefined}
      >
        {pending ? <Loader2 className="animate-spin" /> : <Check />}
        Одобрить
      </Button>
      <Button
        variant={mode === "revision" ? "primary" : "secondary"}
        size={compact ? "sm" : "md"}
        onClick={onRevision}
        disabled={pending}
        title="На доработку (V)"
        className={compact ? "px-2" : undefined}
      >
        <PencilLine />
        Доработка
      </Button>
      <Button
        variant={mode === "reject" ? "danger" : "secondary"}
        size={compact ? "sm" : "md"}
        onClick={onReject}
        disabled={pending}
        title="Отклонить (R)"
        className={compact ? "px-2" : undefined}
      >
        <X />
        Отклонить
      </Button>
    </>
  );
}
