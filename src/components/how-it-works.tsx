"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, CircleHelp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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

const HowItWorksContext = createContext<{ open: () => void }>({
  open: () => {},
});

export function HowItWorksProvider({ children }: { children: React.ReactNode }) {
  // Тестовый режим: всплывашка на каждом запуске Mini App.
  const [visible, setVisible] = useState(true);

  return (
    <HowItWorksContext.Provider value={{ open: () => setVisible(true) }}>
      {children}
      {visible ? <HowItWorksSheet onClose={() => setVisible(false)} /> : null}
    </HowItWorksContext.Provider>
  );
}

export function useHowItWorks() {
  return useContext(HowItWorksContext);
}

export function HowItWorksButton({ className }: { className?: string }) {
  const { open } = useHowItWorks();
  return (
    <button
      type="button"
      onClick={() => {
        haptic("light");
        open();
      }}
      className={cn(
        "liquid-glass clip-frame clip-pill inline-flex h-8 shrink-0 items-center gap-1.5 px-2.5 text-[12px] font-medium text-brand-300",
        className,
      )}
    >
      <CircleHelp className="size-3.5" />
      Как это работает?
    </button>
  );
}

export function HowItWorksMenuRow() {
  const { open } = useHowItWorks();
  return (
    <button
      type="button"
      onClick={() => {
        haptic("light");
        open();
      }}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-300 ease-soft hover:bg-surface-overlay/50 active:bg-surface-overlay"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-overlay text-content-secondary [&_svg]:size-4">
        <CircleHelp />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">Как это работает?</span>
        <span className="mt-0.5 block truncate text-[12px] text-content-muted">
          Три шага до выплаты
        </span>
      </span>
    </button>
  );
}

function HowItWorksSheet({ onClose }: { onClose: () => void }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80]">
      <button
        type="button"
        aria-label="Закрыть"
        className="absolute inset-0 bg-black/62"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="how-it-works-title"
        className="absolute inset-x-0 bottom-0 max-h-[min(36rem,88dvh)] overflow-y-auto rounded-t-[1.6rem] border-t border-border-subtle bg-surface-base px-5 pt-4"
        style={{
          paddingBottom: "max(1.25rem, var(--safe-bottom))",
          paddingLeft: "max(1.25rem, var(--safe-left))",
          paddingRight: "max(1.25rem, var(--safe-right))",
        }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/14" />
        <p className="text-[11px] tracking-wide text-content-muted uppercase">
          Как это работает
        </p>
        <h2
          id="how-it-works-title"
          className="mt-1 text-[18px] font-bold leading-tight"
        >
          Три шага до выплаты
        </h2>
        <ol className="mt-4 space-y-3.5">
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
          size="lg"
          block
          className="mt-5"
          onClick={() => {
            haptic("light");
            onClose();
          }}
        >
          <Check />
          Понятно
        </Button>
      </div>
    </div>,
    document.body,
  );
}
