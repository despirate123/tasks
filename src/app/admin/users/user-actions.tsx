"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { UserStatus } from "@/generated/prisma";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adjustBalanceAction, setUserStatusAction } from "@/server/actions";

const STATUSES: { value: UserStatus; label: string }[] = [
  { value: "ACTIVE", label: "Активен" },
  { value: "LIMITED", label: "Ограничен" },
  { value: "BLOCKED", label: "Блок" },
];

export function UserActions({
  userId,
  status,
}: {
  userId: string;
  status: UserStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState("");
  const [comment, setComment] = useState("");
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => {
    startTransition(async () => {
      const result = await fn();
      setFeedback({
        ok: result.ok,
        text: result.ok ? (result.message ?? "Готово") : (result.error ?? "Ошибка"),
      });
      if (result.ok) {
        setAmount("");
        setComment("");
        setReason("");
      }
      setTimeout(() => setFeedback(null), 3500);
      router.refresh();
    });
  };

  return (
    <div className="space-y-3 rounded-2xl bg-surface-input/50 p-3 ring-1 ring-inset ring-border-subtle">
      <div>
        <p className="mb-1.5 text-[11px] tracking-wide text-content-muted uppercase">
          Корректировка баланса
        </p>
        <div className="flex gap-2">
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,-]/g, ""))}
            placeholder="+500 или -200"
            inputMode="decimal"
            className="tabular h-9 flex-1 text-[13px]"
          />
        </div>
        <Input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Основание (обязательно)"
          className="mt-2 h-9 text-[12.5px]"
        />
        <Button
          variant="secondary"
          size="sm"
          block
          className="mt-2"
          disabled={
            pending || !amount || !comment.trim() || !Number.isFinite(parseAmount(amount))
          }
          onClick={() =>
            run(() => adjustBalanceAction(userId, parseAmount(amount), comment))
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : null}
          Применить
        </Button>
        <p className="mt-1.5 text-[10.5px] leading-relaxed text-content-muted">
          Операция попадёт в леджер и журнал аудита с вашим именем.
        </p>
      </div>

      <div className="border-t border-border-subtle pt-3">
        <p className="mb-1.5 text-[11px] tracking-wide text-content-muted uppercase">
          Статус
        </p>
        <div className="flex gap-1.5">
          {STATUSES.map((item) => (
            <button
              key={item.value}
              type="button"
              disabled={pending || item.value === status}
              onClick={() => run(() => setUserStatusAction(userId, item.value, reason))}
              className={cn(
                "flex-1 rounded-xl px-2 py-1.5 text-[11.5px] font-medium ring-1 ring-inset transition disabled:opacity-100",
                item.value === status
                  ? "bg-brand-500/14 text-brand-300 ring-brand-500/28"
                  : "bg-surface-overlay text-content-secondary ring-border-strong hover:text-content-primary",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Причина — увидит участник"
          className="mt-2 h-9 text-[12.5px]"
        />
      </div>

      {feedback ? (
        <p
          className={cn(
            "text-[11.5px] leading-relaxed",
            feedback.ok ? "text-money-400" : "text-hard",
          )}
        >
          {feedback.text}
        </p>
      ) : null}
    </div>
  );
}

function parseAmount(value: string): number {
  return Number.parseFloat(value.replace(",", ".").replace(/\s/g, ""));
}
