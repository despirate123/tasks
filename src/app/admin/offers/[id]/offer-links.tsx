"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { SectionTitle } from "@/components/ui/misc";
import { updateOfferLinksAction } from "@/server/actions";

const HOLD_PRESETS = [
  { label: "Без холда", hours: 0 },
  { label: "24 ч", hours: 24 },
  { label: "3 дня", hours: 72 },
  { label: "7 дней", hours: 168 },
  { label: "30 дней", hours: 720 },
  { label: "60 дней", hours: 1440 },
];

export function OfferLinksEditor({
  offerId,
  promoCode,
  trackingUrl,
  holdHours,
}: {
  offerId: string;
  promoCode: string | null;
  trackingUrl: string | null;
  holdHours: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [promo, setPromo] = useState(promoCode ?? "");
  const [url, setUrl] = useState(trackingUrl ?? "");
  const [hold, setHold] = useState(String(holdHours));
  const [toast, setToast] = useState<string | null>(null);

  const save = () => {
    startTransition(async () => {
      const result = await updateOfferLinksAction(offerId, {
        promoCode: promo,
        trackingUrl: url,
        holdHours: Number(hold) || 0,
      });
      setToast(result.ok ? (result.message ?? "Сохранено") : (result.error ?? "Ошибка"));
      setTimeout(() => setToast(null), 2800);
      router.refresh();
    });
  };

  return (
    <div className="space-y-2.5">
      <SectionTitle>Ссылка и промокод</SectionTitle>
      <Card className="space-y-3.5 p-4">
        <Field
          label="Уникальная ссылка оффера"
          hint="Плейсхолдеры {clickId} или {sub_id} заменятся кодом выполнения. Без них мы допишем sub_id сами. Зачёт у сети идёт только по этой ссылке."
        >
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://track.example.com/offer?sub_id={clickId}"
          />
        </Field>
        <Field label="Промокод" hint="Показывается в задании, копируется одним тапом.">
          <Input
            value={promo}
            onChange={(e) => setPromo(e.target.value)}
            placeholder="PROFI500"
            className="font-mono tracking-wider uppercase"
          />
        </Field>
        <Field
          label="Холд до зачисления, часов"
          hint="После одобрения деньги ещё проверяет рекламодатель. У части офферов — до 60 дней."
        >
          <div className="flex flex-wrap gap-2">
            {HOLD_PRESETS.map((preset) => (
              <button
                key={preset.hours}
                type="button"
                onClick={() => setHold(String(preset.hours))}
                className={
                  Number(hold) === preset.hours
                    ? "rounded-pill bg-brand-500/14 px-3 py-1.5 text-[12.5px] font-medium text-brand-300 ring-1 ring-inset ring-brand-500/28"
                    : "rounded-pill bg-surface-input px-3 py-1.5 text-[12.5px] font-medium text-content-secondary ring-1 ring-inset ring-border-strong"
                }
              >
                {preset.label}
              </button>
            ))}
          </div>
          <Input
            value={hold}
            inputMode="numeric"
            onChange={(e) => setHold(e.target.value.replace(/\D/g, ""))}
            className="tabular mt-2"
          />
        </Field>
        <Button variant="primary" onClick={save} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Сохранить
        </Button>
        {toast ? <p className="text-[12.5px] text-content-secondary">{toast}</p> : null}
      </Card>
    </div>
  );
}
