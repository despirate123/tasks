"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bitcoin,
  Check,
  CreditCard,
  Info,
  Loader2,
  Plus,
  Smartphone,
  Trash2,
} from "lucide-react";
import type { PayoutMethodKind } from "@/generated/prisma";
import { cn } from "@/lib/utils";
import { formatCrypto, formatMoney } from "@/lib/format";
import { PAYOUT_METHOD } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { DetailRow, SectionTitle } from "@/components/ui/misc";
import {
  addPayoutMethodAction,
  createWithdrawalAction,
  deletePayoutMethodAction,
} from "@/server/actions";
import { haptic, hapticNotify } from "@/components/telegram-init";

type Method = {
  id: string;
  kind: PayoutMethodKind;
  maskedValue: string;
  holderName: string | null;
  isDefault: boolean;
};

type Config = {
  minRub: number;
  minUsdt: number;
  feeRub: number;
  feeUsdt: number;
  spread: number;
  dailyLimit: number;
};

const KIND_OPTIONS: {
  kind: PayoutMethodKind;
  icon: React.ComponentType<{ className?: string }>;
  placeholder: string;
  inputHint: string;
}[] = [
  {
    kind: "CARD_RUB",
    icon: CreditCard,
    placeholder: "0000 0000 0000 0000",
    inputHint: "Карта российского банка. Проверяем номер до создания заявки.",
  },
  {
    kind: "SBP_RUB",
    icon: Smartphone,
    placeholder: "+7 900 000-00-00",
    inputHint: "Номер телефона, привязанный к СБП.",
  },
  {
    kind: "USDT_TRC20",
    icon: Bitcoin,
    placeholder: "T...",
    inputHint: "Адрес TRON (TRC-20). Начинается с T, 34 символа.",
  },
  {
    kind: "USDT_TON",
    icon: Bitcoin,
    placeholder: "UQ... / EQ...",
    inputHint: "Адрес TON. Мгновенно и почти без комиссии.",
  },
];

export function WithdrawForm({
  available,
  methods,
  rate,
  config,
  hasActiveRequest,
  activeRequestCode,
}: {
  available: number;
  methods: Method[];
  rate: number;
  config: Config;
  hasActiveRequest: boolean;
  activeRequestCode: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState(methods[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [adding, setAdding] = useState(methods.length === 0);
  const [newKind, setNewKind] = useState<PayoutMethodKind>("CARD_RUB");
  const [newValue, setNewValue] = useState("");
  const [newHolder, setNewHolder] = useState("");

  const selected = methods.find((m) => m.id === selectedId);
  const isCrypto = selected
    ? PAYOUT_METHOD[selected.kind].currency === "USDT"
    : false;

  const quote = useMemo(() => {
    const gross = Number.parseFloat(amount.replace(",", ".")) || 0;
    const feePercent = isCrypto ? config.feeUsdt : config.feeRub;
    const fee = Math.ceil(gross * feePercent) / 100;
    const net = Math.max(gross - fee, 0);
    const effectiveRate = rate * (1 + config.spread / 100);
    const crypto = isCrypto ? Math.floor((net / effectiveRate) * 100) / 100 : null;
    const min = isCrypto ? config.minUsdt : config.minRub;

    return { gross, feePercent, fee, net, crypto, effectiveRate, min };
  }, [amount, isCrypto, config, rate]);

  const validationError = (() => {
    if (!selected) return "Добавьте реквизиты для выплаты";
    if (quote.gross <= 0) return null;
    if (quote.gross < quote.min)
      return `Минимальная сумма — ${formatMoney(quote.min)}`;
    if (quote.gross > available)
      return `Доступно только ${formatMoney(available)}`;
    if (quote.gross > config.dailyLimit)
      return `Суточный лимит — ${formatMoney(config.dailyLimit)}`;
    return null;
  })();

  const canSubmit =
    Boolean(selected) &&
    quote.gross > 0 &&
    !validationError &&
    !hasActiveRequest &&
    !pending;

  const addMethod = () => {
    setError(null);
    haptic("light");
    startTransition(async () => {
      const result = await addPayoutMethodAction({
        kind: newKind,
        value: newValue,
        holderName: newHolder || undefined,
      });
      if (result.ok) {
        setNewValue("");
        setNewHolder("");
        setAdding(false);
        hapticNotify("success");
        router.refresh();
      } else {
        setError(result.error);
        hapticNotify("error");
      }
    });
  };

  const submit = () => {
    setError(null);
    setSuccess(null);
    haptic("medium");
    startTransition(async () => {
      const result = await createWithdrawalAction(selectedId, quote.gross);
      if (result.ok) {
        setAmount("");
        setSuccess(result.message ?? "Заявка создана");
        hapticNotify("success");
        router.refresh();
      } else {
        setError(result.error);
        hapticNotify("error");
      }
    });
  };

  const kindMeta = KIND_OPTIONS.find((o) => o.kind === newKind) ?? KIND_OPTIONS[0];

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="text-[11px] tracking-wide text-content-muted uppercase">
          Доступно к выводу
        </p>
        <p className="tabular mt-1 text-[28px] leading-none font-bold text-money-400">
          {formatMoney(available)}
        </p>
      </Card>

      {hasActiveRequest ? (
        <div className="flex gap-2.5 rounded-card bg-info/8 p-3.5 ring-1 ring-inset ring-info/20">
          <Info className="size-4 shrink-0 text-info" />
          <p className="text-[12.5px] leading-relaxed text-content-secondary">
            Заявка {activeRequestCode} ещё в обработке. Новую можно создать после её
            завершения — так мы исключаем двойные выплаты.
          </p>
        </div>
      ) : null}

      <div className="space-y-2.5">
        <SectionTitle
          action={
            methods.length > 0 ? (
              <button
                type="button"
                onClick={() => setAdding((v) => !v)}
                className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-300"
              >
                <Plus className="size-3.5" />
                Добавить
              </button>
            ) : null
          }
        >
          Реквизиты
        </SectionTitle>

        {methods.length > 0 ? (
          <div className="space-y-2">
            {methods.map((method) => {
              const meta = PAYOUT_METHOD[method.kind];
              const active = method.id === selectedId;
              const Icon =
                KIND_OPTIONS.find((o) => o.kind === method.kind)?.icon ?? CreditCard;
              return (
                <button
                  key={method.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(method.id);
                    haptic("light");
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-card p-3.5 text-left ring-1 ring-inset transition",
                    active
                      ? "bg-brand-500/10 ring-brand-500/35"
                      : "bg-surface-raised/70 ring-border-subtle",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-xl",
                      active
                        ? "bg-brand-500/16 text-brand-300"
                        : "bg-surface-overlay text-content-secondary",
                    )}
                  >
                    <Icon className="size-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold">
                      {meta.short}
                    </span>
                    <span className="mt-0.5 block font-mono text-[12px] text-content-muted">
                      {method.maskedValue}
                      {method.holderName ? ` · ${method.holderName}` : ""}
                    </span>
                  </span>
                  {active ? (
                    <Check className="size-4 shrink-0 text-brand-300" />
                  ) : (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        startTransition(async () => {
                          await deletePayoutMethodAction(method.id);
                          router.refresh();
                        });
                      }}
                      onKeyDown={(e) => e.stopPropagation()}
                      className="shrink-0 p-1 text-content-muted"
                      aria-label="Удалить реквизиты"
                    >
                      <Trash2 className="size-3.5" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : null}

        {adding ? (
          <Card className="space-y-3.5 p-4">
            <div className="grid grid-cols-2 gap-2">
              {KIND_OPTIONS.map((option) => {
                const Icon = option.icon;
                const active = option.kind === newKind;
                return (
                  <button
                    key={option.kind}
                    type="button"
                    onClick={() => setNewKind(option.kind)}
                    className={cn(
                      "flex items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-[12.5px] font-medium ring-1 ring-inset transition",
                      active
                        ? "bg-brand-500/12 text-brand-300 ring-brand-500/30"
                        : "bg-surface-input text-content-secondary ring-border-strong",
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="min-w-0 truncate">
                      {PAYOUT_METHOD[option.kind].short}
                    </span>
                  </button>
                );
              })}
            </div>

            <Field
              label={
                newKind === "CARD_RUB"
                  ? "Номер карты"
                  : newKind === "SBP_RUB"
                    ? "Номер телефона"
                    : "Адрес кошелька"
              }
              hint={kindMeta.inputHint}
            >
              <Input
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder={kindMeta.placeholder}
                inputMode={newKind === "CARD_RUB" ? "numeric" : "text"}
                className={newKind.startsWith("USDT") ? "font-mono text-[13px]" : ""}
              />
            </Field>

            {newKind === "CARD_RUB" || newKind === "SBP_RUB" ? (
              <Field label="Имя владельца" hint="Как указано в банке">
                <Input
                  value={newHolder}
                  onChange={(e) => setNewHolder(e.target.value)}
                  placeholder="Иван Иванов"
                />
              </Field>
            ) : null}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="primary"
                block
                onClick={addMethod}
                disabled={pending || !newValue.trim()}
              >
                {pending ? <Loader2 className="animate-spin" /> : null}
                Сохранить реквизиты
              </Button>
              {methods.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setAdding(false)}
                >
                  Отмена
                </Button>
              ) : null}
            </div>
          </Card>
        ) : null}
      </div>

      {selected ? (
        <div className="space-y-2.5">
          <SectionTitle>Сумма</SectionTitle>
          <Card className="space-y-3.5 p-4">
            <Field
              label="Сколько списать с баланса"
              error={validationError ?? undefined}
              hint={
                validationError
                  ? undefined
                  : `Минимум ${formatMoney(quote.min)}, доступно ${formatMoney(available)}`
              }
            >
              <div className="flex gap-2">
                <Input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
                  placeholder="0"
                  inputMode="decimal"
                  className="tabular text-lg font-semibold"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setAmount(String(Math.floor(available)))}
                >
                  Всё
                </Button>
              </div>
            </Field>

            {quote.gross > 0 ? (
              <div className="divide-y divide-border-subtle rounded-2xl bg-surface-input/60 px-3.5">
                <DetailRow
                  label="Списывается с баланса"
                  value={formatMoney(quote.gross)}
                />
                <DetailRow
                  label={`Комиссия ${quote.feePercent} %`}
                  value={quote.fee > 0 ? `− ${formatMoney(quote.fee)}` : "нет"}
                />
                {isCrypto ? (
                  <DetailRow
                    label="Курс"
                    value={`1 USDT ≈ ${quote.effectiveRate.toFixed(2)} ₽`}
                  />
                ) : null}
                <DetailRow
                  label="К получению"
                  value={
                    <span className="text-money-400">
                      {isCrypto && quote.crypto != null
                        ? formatCrypto(quote.crypto)
                        : formatMoney(quote.net)}
                    </span>
                  }
                />
              </div>
            ) : null}

            {isCrypto ? (
              <div className="flex gap-2.5 rounded-2xl bg-medium/8 p-3 ring-1 ring-inset ring-medium/20">
                <AlertTriangle className="size-4 shrink-0 text-medium" />
                <p className="text-[12px] leading-relaxed text-content-secondary">
                  Курс фиксируется в момент создания заявки. Проверьте сеть адреса —
                  перевод в другой сети вернуть невозможно.
                </p>
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-card bg-hard/8 p-3.5 ring-1 ring-inset ring-hard/20">
          <p className="text-[12.5px] leading-relaxed text-hard">{error}</p>
        </div>
      ) : null}

      {success ? (
        <div className="rounded-card bg-money-500/8 p-3.5 ring-1 ring-inset ring-money-500/20">
          <p className="text-[12.5px] leading-relaxed text-money-400">{success}</p>
        </div>
      ) : null}

      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border-subtle bg-surface-base/94 px-4 pt-3 backdrop-blur-xl"
        style={{
          paddingBottom: "calc(var(--safe-bottom) + 0.75rem)",
          paddingLeft: "max(1rem, var(--safe-left))",
          paddingRight: "max(1rem, var(--safe-right))",
        }}
      >
        <div className="mx-auto max-w-[var(--app-max-width)]">
          <Button
            variant={canSubmit ? "money" : "secondary"}
            size="lg"
            block
            onClick={submit}
            disabled={!canSubmit}
          >
            {pending ? <Loader2 className="animate-spin" /> : null}
            {quote.gross > 0
              ? `Вывести ${isCrypto && quote.crypto != null ? formatCrypto(quote.crypto) : formatMoney(quote.net)}`
              : "Вывести средства"}
          </Button>
        </div>
      </div>
      <div className="h-16" />
    </div>
  );
}
