"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * Липкая кнопка над нижней навигацией.
 * Рендерится в document.body, чтобы анимация вкладок (transform)
 * не превращала position:fixed в привязку к карточке задания.
 */
export function StickyActionBar({
  children,
  className,
  spacerClassName,
}: {
  children: React.ReactNode;
  className?: string;
  spacerClassName?: string;
}) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setTarget(document.body);
  }, []);

  const bar = (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40">
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 bg-[#050505]"
        style={{ height: "calc(var(--nav-height) + 7.25rem)" }}
      />
      <div
        aria-hidden
        className="absolute inset-x-0 bg-gradient-to-t from-[#050505] to-transparent"
        style={{
          bottom: "calc(var(--nav-height) + 7.25rem)",
          height: "2rem",
        }}
      />
      <div
        className="relative mx-auto w-full max-w-[var(--app-max-width)] px-4"
        style={{
          paddingBottom: "calc(var(--nav-height) + 0.75rem)",
          paddingLeft: "max(1rem, var(--safe-left))",
          paddingRight: "max(1rem, var(--safe-right))",
        }}
      >
        <div
          className={cn(
            "pointer-events-auto rounded-[22px] border border-white/10 bg-[#0a0a0a] px-3 py-3 shadow-[0_-18px_48px_rgba(0,0,0,0.8)]",
            className,
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {target ? createPortal(bar, target) : bar}
      <div aria-hidden className={cn("h-36", spacerClassName)} />
    </>
  );
}
