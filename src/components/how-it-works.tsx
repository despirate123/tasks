"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronDown, CircleHelp } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/components/telegram-init";

const STEPS = [
  {
    title: "Выбираете задание",
    text: "В каталоге, под своё время. Нажали «Взять» — можно делать.",
  },
  {
    title: "Делаете и отправляете скрины",
    text: "Шаги написаны в задании. Фото или видео, кнопка «Отправить».",
  },
  {
    title: "Деньги на балансе",
    text: "Мы смотрим работу и зачисляем. Обычно в тот же день или за пару дней.",
  },
];

export function HowItWorks({
  title,
  defaultOpen = false,
}: {
  title: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  useEffect(() => {
    if (!defaultOpen) return;
    document.getElementById("how-it-works")?.scrollIntoView({
      block: "start",
    });
  }, [defaultOpen]);

  return (
    <div id="how-it-works" className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        {title}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => {
            haptic("light");
            setOpen((current) => !current);
          }}
          className="liquid-glass clip-frame clip-pill inline-flex h-8 shrink-0 items-center gap-1.5 px-2.5 text-[12px] font-medium text-brand-300"
        >
          <CircleHelp className="size-3.5" />
          Как это работает?
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform duration-300 ease-soft",
              open && "rotate-180",
            )}
          />
        </button>
      </div>

      {open ? (
        <div
          id={panelId}
          className="clip-frame rounded-card glass-thin px-3.5 py-3 ring-1 ring-inset ring-white/[0.07]"
        >
          <p className="text-[13px] leading-relaxed text-content-secondary">
            Берёте задание, отправляете скрины — деньги приходят на баланс.
          </p>
          <ol className="mt-3 space-y-2.5">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-2.5">
                <span className="tabular mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-brand-500/16 text-[11px] font-bold text-brand-300">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium leading-snug">{step.title}</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-content-muted">
                    {step.text}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
