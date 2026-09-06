"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Info, Loader2, RotateCcw } from "lucide-react";
import type { Difficulty, OfferStatus, ValueSource } from "@/generated/prisma";
import { cn } from "@/lib/utils";
import { formatEta } from "@/lib/format";
import { DIFFICULTY, DIFFICULTY_ORDER, VALUE_SOURCE } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { SectionTitle } from "@/components/ui/misc";
import {
  resetAutoAction,
  setApprovalEtaAction,
  setDifficultyAction,
  setOfferStatusAction,
} from "@/server/actions";

/** Готовые значения ETA — админ выставляет типовое время одним тапом. */
const ETA_PRESETS = [
  { label: "15 мин", minutes: 15 },
  { label: "1 час", minutes: 60 },
  { label: "3 часа", minutes: 180 },
  { label: "12 часов", minutes: 720 },
  { label: "1 день", minutes: 1440 },
  { label: "3 дня", minutes: 4320 },
  { label: "7 дней", minutes: 10080 },
];

const STATUSES: { value: OfferStatus; label: string }[] = [
  { value: "DRAFT", label: "Черновик" },
  { value: "ACTIVE", label: "Активен" },
  { value: "PAUSED", label: "Пауза" },
  { value: "ARCHIVED", label: "Архив" },
];

export function OfferControls({
  offerId,
  difficulty,
  difficultySource,
  approvalEtaMinutes,
  approvalEtaSource,
  actualEtaMinutes,
  status,
}: {
  offerId: string;
  difficulty: Difficulty;
  difficultySource: ValueSource;
  approvalEtaMinutes: number;
  approvalEtaSource: ValueSource;
  actualEtaMinutes: number | null;
  status: OfferStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [etaInput, setEtaInput] = useState(String(approvalEtaMinutes));
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => {
    startTransition(async () => {
      const result = await fn();
      setToast({
        ok: result.ok,
        text: result.ok ? (result.message ?? "Готово") : (result.error ?? "Ошибка"),
      });
      setTimeout(() => setToast(null), 3000);
      router.refresh();
    });
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2.5">
        <SectionTitle>Публикация</SectionTitle>
        <Card className="p-4">
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((item) => (
              <button
                key={item.value}
                type="button"
                disabled={pending || item.value === status}
                onClick={() => run(() => setOfferStatusAction(offerId, item.value))}
                className={cn(
                  "rounded-pill px-3.5 py-1.5 text-[12.5px] font-medium ring-1 ring-inset transition disabled:opacity-100",
                  item.value === status
                    ? "bg-brand-500/14 text-brand-300 ring-brand-500/28"
                    : "bg-surface-input text-content-secondary ring-border-strong hover:text-content-primary",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div className="space-y-2.5">
        <SectionTitle>Сложность</SectionTitle>
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            {DIFFICULTY_ORDER.map((value) => {
              const meta = DIFFICULTY[value];
              const active = value === difficulty;
              return (
                <button
                  key={value}
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => setDifficultyAction(offerId, value))}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-pill px-3.5 py-1.5 text-[12.5px] font-medium ring-1 ring-inset transition",
                    active
                      ? meta.className
                      : "bg-surface-input text-content-secondary ring-border-strong hover:text-content-primary",
                  )}
                >
                  <span className={cn("size-1.5 rounded-full", meta.dot)} />
                  {meta.label}
                  {active ? <Check className="size-3" /> : null}
                </button>
              );
            })}
          </div>

          <SourceNote
            source={difficultySource}
            onReset={() => run(() => resetAutoAction(offerId, "difficulty"))}
            pending={pending}
          />
        </Card>
      </div>

      <div className="space-y-2.5">
        <SectionTitle>Время одобрения</SectionTitle>
        <Card className="space-y-3.5 p-4">
          <div className="flex flex-wrap gap-2">
            {ETA_PRESETS.map((preset) => (
              <button
                key={preset.minutes}
                type="button"
                disabled={pending}
                onClick={() => {
                  setEtaInput(String(preset.minutes));
                  run(() => setApprovalEtaAction(offerId, preset.minutes));
                }}
                className={cn(
                  "rounded-pill px-3.5 py-1.5 text-[12.5px] font-medium ring-1 ring-inset transition",
                  preset.minutes === approvalEtaMinutes
                    ? "bg-brand-500/14 text-brand-300 ring-brand-500/28"
                    : "bg-surface-input text-content-secondary ring-border-strong hover:text-content-primary",
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <Field
              label="Своё значение, минут"
              className="min-w-[10rem] flex-1"
              hint={`Пользователь увидит: ${formatEta(Number(etaInput) || approvalEtaMinutes)}`}
            >
              <Input
                value={etaInput}
                inputMode="numeric"
                onChange={(e) => setEtaInput(e.target.value.replace(/\D/g, ""))}
                className="tabular"
              />
            </Field>
            <Button
              variant="primary"
              disabled={pending || !etaInput || Number(etaInput) < 1}
              onClick={() => run(() => setApprovalEtaAction(offerId, Number(etaInput)))}
            >
              {pending ? <Loader2 className="animate-spin" /> : null}
              Применить
            </Button>
          </div>

          {actualEtaMinutes ? (
            <div
              className={cn(
                "flex gap-2.5 rounded-2xl p-3 ring-1 ring-inset",
                actualEtaMinutes > approvalEtaMinutes * 2
                  ? "bg-hard/8 ring-hard/20"
                  : "bg-info/8 ring-info/20",
              )}
            >
              <Info
                className={cn(
                  "size-4 shrink-0",
                  actualEtaMinutes > approvalEtaMinutes * 2 ? "text-hard" : "text-info",
                )}
              />
              <p className="text-[12.5px] leading-relaxed text-content-secondary">
                Фактическая медиана проверки — {formatEta(actualEtaMinutes)}.
                {actualEtaMinutes > approvalEtaMinutes * 2
                  ? " Заявленное время сильно оптимистичнее факта: пользователи ждут дольше обещанного, это главный источник претензий."
                  : " Заявленное время соответствует реальности."}
              </p>
            </div>
          ) : null}

          <SourceNote
            source={approvalEtaSource}
            onReset={() => run(() => resetAutoAction(offerId, "approvalEta"))}
            pending={pending}
          />
        </Card>
      </div>

      {toast ? (
        <div
          className={cn(
            "rounded-card p-3.5 text-[12.5px] ring-1 ring-inset",
            toast.ok
              ? "bg-brand-500/8 text-brand-300 ring-brand-500/20"
              : "bg-hard/8 text-hard ring-hard/20",
          )}
        >
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Показывает происхождение значения. Ключевая часть требования «админ может
 * менять вручную»: без явного индикатора никто не понимает, почему значение
 * то меняется при синхронизации, то нет.
 */
function SourceNote({
  source,
  onReset,
  pending,
}: {
  source: ValueSource;
  onReset: () => void;
  pending: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
      <span
        className={cn(
          "rounded-pill px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
          source === "MANUAL"
            ? "bg-brand-500/14 text-brand-300 ring-brand-500/28"
            : "bg-surface-overlay text-content-muted ring-border-strong",
        )}
      >
        {VALUE_SOURCE[source].label}
      </span>
      <span className="flex-1 text-[12px] text-content-muted">
        {VALUE_SOURCE[source].hint}
      </span>
      {source === "MANUAL" ? (
        <Button variant="ghost" size="sm" onClick={onReset} disabled={pending}>
          <RotateCcw className="size-3.5" />
          Вернуть авто
        </Button>
      ) : null}
    </div>
  );
}
