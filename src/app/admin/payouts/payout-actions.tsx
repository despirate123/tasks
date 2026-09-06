"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Send, X } from "lucide-react";
import type { WithdrawalStatus } from "@/generated/prisma";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  approvePayoutAction,
  completePayoutAction,
  markPayoutSentAction,
  rejectPayoutAction,
} from "@/server/actions";

export function PayoutActions({
  withdrawalId,
  status,
  isCrypto,
}: {
  withdrawalId: string;
  status: WithdrawalStatus;
  isCrypto: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"idle" | "reject" | "send">("idle");
  const [reason, setReason] = useState("");
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        setMode("idle");
        setReason("");
        setTxHash("");
        router.refresh();
      } else {
        setError(result.error ?? "Ошибка");
      }
    });
  };

  return (
    <div className="space-y-2 rounded-2xl bg-surface-input/50 p-3 ring-1 ring-inset ring-border-subtle">
      {status === "PENDING_REVIEW" ? (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="success"
            size="sm"
            disabled={pending}
            onClick={() => run(() => approvePayoutAction(withdrawalId))}
          >
            {pending ? <Loader2 className="animate-spin" /> : <Check />}
            Одобрить
          </Button>
          <Button
            variant={mode === "reject" ? "danger" : "secondary"}
            size="sm"
            disabled={pending}
            onClick={() => setMode(mode === "reject" ? "idle" : "reject")}
          >
            <X />
            Отклонить
          </Button>
        </div>
      ) : null}

      {status === "APPROVED" || status === "PROCESSING" ? (
        <div className="space-y-2">
          <Button
            variant={mode === "send" ? "primary" : "secondary"}
            size="sm"
            block
            disabled={pending}
            onClick={() => setMode(mode === "send" ? "idle" : "send")}
          >
            <Send />
            Отметить отправленной
          </Button>
          <Button
            variant="secondary"
            size="sm"
            block
            disabled={pending}
            onClick={() => setMode(mode === "reject" ? "idle" : "reject")}
          >
            Не прошло — вернуть средства
          </Button>
        </div>
      ) : null}

      {status === "SENT" ? (
        <div className="space-y-2">
          <Button
            variant="success"
            size="sm"
            block
            disabled={pending}
            onClick={() => run(() => completePayoutAction(withdrawalId))}
          >
            {pending ? <Loader2 className="animate-spin" /> : <Check />}
            Подтвердить получение
          </Button>
          <p className="text-[11px] leading-relaxed text-content-muted">
            {isCrypto
              ? "В продакшене статус переводит вебхук провайдера после нужного числа подтверждений в сети."
              : "Подтверждается после успешного зачисления в банке."}
          </p>
        </div>
      ) : null}

      {mode === "send" ? (
        <div className="space-y-2 border-t border-border-subtle pt-2">
          <Input
            value={txHash}
            onChange={(e) => setTxHash(e.target.value)}
            placeholder={isCrypto ? "Хэш транзакции" : "Референс платежа"}
            className="h-9 font-mono text-[12px]"
          />
          <Button
            variant="primary"
            size="sm"
            block
            disabled={pending || !txHash.trim()}
            onClick={() => run(() => markPayoutSentAction(withdrawalId, txHash))}
          >
            Сохранить
          </Button>
        </div>
      ) : null}

      {mode === "reject" ? (
        <div className="space-y-2 border-t border-border-subtle pt-2">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Причина — увидит участник"
            className="h-9 text-[12.5px]"
          />
          <Button
            variant="danger"
            size="sm"
            block
            disabled={pending || !reason.trim()}
            onClick={() => run(() => rejectPayoutAction(withdrawalId, reason))}
          >
            Отклонить и вернуть {formatHint()}
          </Button>
        </div>
      ) : null}

      {error ? (
        <p className={cn("text-[11.5px] leading-relaxed text-hard")}>{error}</p>
      ) : null}
    </div>
  );
}

function formatHint() {
  return "средства";
}
