"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/components/telegram-init";

const SHOW_AFTER_PX = 560;

function scrollTop() {
  return window.scrollY || document.documentElement.scrollTop || 0;
}

export function ScrollToTop() {
  const pathname = usePathname();
  const onHome = pathname === "/";
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!onHome) {
      setVisible(false);
      return;
    }

    const sync = () => setVisible(scrollTop() > SHOW_AFTER_PX);
    sync();
    window.addEventListener("scroll", sync, { passive: true });
    return () => window.removeEventListener("scroll", sync);
  }, [onHome]);

  if (!onHome) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-40"
      style={{
        bottom: "calc(var(--nav-height) + 0.65rem)",
        paddingLeft: "max(1rem, var(--safe-left))",
        paddingRight: "max(1rem, var(--safe-right))",
      }}
    >
      <div className="mx-auto flex max-w-[var(--app-max-width)] justify-end">
        <button
          type="button"
          aria-label="Наверх"
          tabIndex={visible ? 0 : -1}
          onClick={() => {
            haptic("light");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          className={cn(
            "liquid-glass pointer-events-auto flex size-12 items-center justify-center rounded-full glass text-[var(--acid)] shadow-[0_10px_28px_rgba(0,0,0,0.35)] transition-[opacity,transform] duration-300 ease-soft",
            visible
              ? "scale-100 opacity-100"
              : "pointer-events-none scale-90 opacity-0",
          )}
        >
          <ArrowUp className="size-5" strokeWidth={2.25} />
        </button>
      </div>
    </div>
  );
}
