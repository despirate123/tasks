"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Check, CircleHelp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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

const HowItWorksContext = createContext<{ open: () => void }>({
  open: () => {},
});

export function HowItWorksProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);

  return (
    <HowItWorksContext.Provider value={{ open }}>
      {children}
      {ready && visible
        ? createPortal(<HowItWorksSheet onClose={close} />, document.body)
        : null}
    </HowItWorksContext.Provider>
  );
}

export function useHowItWorks() {
  return useContext(HowItWorksContext);
}

/** Старая ссылка /?howto=1 — открыть лист, не аккордеон в ленте. */
export function HowItWorksAutoOpen({ active }: { active: boolean }) {
  const { open } = useHowItWorks();
  useEffect(() => {
    if (active) open();
  }, [active, open]);
  return null;
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
        "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium whitespace-nowrap text-brand-300 ring-1 ring-inset ring-white/14 [touch-action:manipulation]",
        className,
      )}
    >
      <CircleHelp className="size-4" />
      <span className="max-[340px]:sr-only">Как это работает?</span>
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
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left [touch-action:manipulation] transition-colors duration-300 ease-soft hover:bg-surface-overlay/50 active:bg-surface-overlay"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-overlay text-content-secondary [&_svg]:size-4">
        <CircleHelp />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">Как это работает?</span>
        <span className="mt-0.5 block truncate text-[12px] text-content-muted">
          Коротко, за минуту
        </span>
      </span>
    </button>
  );
}

function HowItWorksSheet({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-x-0 top-0 z-[80] overflow-hidden overscroll-none"
      style={{ height: "var(--tg-viewport-stable-height, 100dvh)" }}
    >
      <button
        type="button"
        aria-label="Закрыть"
        className="absolute inset-0 bg-black/58"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="how-it-works-title"
        className="absolute inset-x-0 bottom-0 mx-auto flex w-full max-w-[var(--app-max-width)] flex-col rounded-t-[1.6rem] border-t border-border-subtle bg-surface-base"
        style={{
          maxHeight: "calc(var(--tg-viewport-stable-height, 100dvh) - 2.5rem)",
          paddingLeft: "max(1.25rem, var(--safe-left))",
          paddingRight: "max(1.25rem, var(--safe-right))",
          paddingBottom: "max(1.25rem, calc(var(--safe-bottom) + 0.75rem))",
        }}
      >
        <div className="flex shrink-0 justify-center pt-3 pb-2">
          <span className="h-1 w-10 rounded-full bg-white/16" />
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain pb-1">
          <p className="text-[11px] tracking-wide text-content-muted uppercase">
            Как это работает
          </p>
          <h2
            id="how-it-works-title"
            className="mt-1 text-[18px] font-bold leading-tight"
          >
            Берёте задание — деньги на балансе
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-content-secondary">
            Без анкет на старте. Три коротких шага.
          </p>
          <ol className="mt-4 space-y-3">
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
        </div>
        <Button
          variant="primary"
          size="lg"
          block
          className="mt-4 shrink-0"
          onClick={() => {
            haptic("light");
            onClose();
          }}
        >
          <Check />
          Понятно
        </Button>
      </div>
    </div>
  );
}
