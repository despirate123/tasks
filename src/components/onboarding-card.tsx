"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { completeOnboardingAction } from "@/server/actions";
import { haptic } from "@/components/telegram-init";

const STEPS = [
  {
    title: "Берёте задание",
    text: "В каталоге выбираете оффер и нажимаете «Взять». Появится уникальная ссылка — переход только по ней.",
  },
  {
    title: "Делаете и сдаёте пруф",
    text: "Выполняете шаги, загружаете скрины или видео, отправляете на проверку.",
  },
  {
    title: "Деньги после проверки",
    text: "Сначала модерация, потом холд рекламодателя. Обычно часы или дни. У части офферов проверка занимает до 60 дней.",
  },
];

export function OnboardingCard() {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const [pending, startTransition] = useTransition();

  if (hidden) return null;

  return (
    <Card className="space-y-3.5 p-4">
      <div>
        <p className="text-[11px] tracking-wide text-content-muted uppercase">
          Как это работает
        </p>
        <h2 className="mt-1 text-[16px] font-bold leading-tight">Три шага до выплаты</h2>
      </div>
      <ol className="space-y-3">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex gap-3">
            <span className="tabular mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-brand-500/16 text-[12px] font-bold text-brand-300">
              {index + 1}
            </span>
            <div className="min-w-0">
              <p className="text-[13.5px] font-medium leading-snug">{step.title}</p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-content-secondary">
                {step.text}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <Button
        variant="primary"
        size="md"
        block
        disabled={pending}
        onClick={() => {
          haptic("light");
          startTransition(async () => {
            await completeOnboardingAction();
            setHidden(true);
            router.refresh();
          });
        }}
      >
        <Check />
        Понятно
      </Button>
    </Card>
  );
}
