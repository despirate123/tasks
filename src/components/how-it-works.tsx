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
    title: "Берёте задание",
    text: "В каталоге выбираете то, что подходит по времени и сумме, и нажимаете «Взять».",
  },
  {
    title: "Отправляете скрин",
    text: "Делаете как написано в задании и присылаете фото или видео — что там просят.",
  },
  {
    title: "Получаете деньги",
    text: "Мы смотрим работу и зачисляем на баланс. Обычно в тот же день или на следующий.",
  },
];

const HowItWorksContext = createContext<{ open: () => void }>({
  open: () => {},
});

export function HowItWorksProvider({ children }: { children: React.ReactNode }) {
  const [present, setPresent] = useState(false);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  const show = useCallback(() => {
    setPresent(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setOpen(true));
    });
  }, []);

  const hide = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!present) return;
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => setOpen(true));
    });
    return () => cancelAnimationFrame(frame);
  }, [present]);

  useEffect(() => {
    if (open || !present) return;
    const timer = window.setTimeout(() => setPresent(false), 340);
    return () => window.clearTimeout(timer);
  }, [open, present]);

  return (
    <HowItWorksContext.Provider value={{ open: show }}>
      {children}
      {ready && present
        ? createPortal(
            <HowItWorksSheet open={open} onClose={hide} />,
            document.body,
          )
        : null}
    </HowItWorksContext.Provider>
  );
}

export function useHowItWorks() {
  return useContext(HowItWorksContext);
}

/** Старая ссылка /?howto=1 — открыть лист. */
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
          Берёте, делаете, получаете
        </span>
      </span>
    </button>
  );
}

function HowItWorksSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden overscroll-none">
      <button
        type="button"
        aria-label="Закрыть"
        data-open={open}
        className="pb-backdrop absolute inset-0 bg-black/62"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="how-it-works-title"
        data-open={open}
        className="pb-sheet absolute inset-x-0 bottom-0 mx-auto flex w-full max-w-[var(--app-max-width)] flex-col rounded-t-[1.6rem] border-t border-border-subtle bg-surface-base shadow-[0_48px_0_0_#121212]"
        style={{
          maxHeight: "min(34rem, calc(100svh - 2.75rem))",
          paddingLeft: "max(1.25rem, var(--safe-left))",
          paddingRight: "max(1.25rem, var(--safe-right))",
          paddingBottom:
            "max(1.25rem, calc(var(--safe-bottom) + env(safe-area-inset-bottom, 0px) + 0.75rem))",
        }}
      >
        <div className="flex shrink-0 justify-center pt-3 pb-2">
          <span className="h-1 w-10 rounded-full bg-white/16" />
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain pb-1">
          <h2
            id="how-it-works-title"
            className="text-[18px] font-bold leading-tight"
          >
            Как это работает
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-content-secondary">
            Три шага: берёте задание, отправляете скрин, получаете деньги.
          </p>
          <ol className="mt-4 space-y-3.5">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-3">
                <span className="tabular mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-brand-500/16 text-[12px] font-bold text-brand-300">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-[14px] font-medium leading-snug">{step.title}</p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-content-secondary">
                    {step.text}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <Button variant="primary" size="lg" block className="mt-5 shrink-0" onClick={onClose}>
          <Check />
          Понятно
        </Button>
      </div>
    </div>
  );
}
