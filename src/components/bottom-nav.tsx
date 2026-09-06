"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Compass, Handshake, UserRound } from "lucide-react";
import { APP_TABS, appTabIndex } from "@/lib/app-tabs";
import { cn } from "@/lib/utils";
import { haptic } from "@/components/telegram-init";

const ICONS = {
  "/": Compass,
  "/referrals": Handshake,
  "/profile": UserRound,
} as const;

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const activeIndex = appTabIndex(pathname);

  useEffect(() => {
    for (const tab of APP_TABS) {
      router.prefetch(tab.href);
    }
  }, [router]);

  return (
    <nav
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-3"
      style={{
        paddingBottom: "calc(var(--safe-bottom) + 0.55rem)",
        paddingLeft: "max(0.75rem, var(--safe-left))",
        paddingRight: "max(0.75rem, var(--safe-right))",
      }}
    >
      <div className="clip-frame clip-dock liquid-glass pointer-events-auto relative mx-auto flex max-w-[var(--app-max-width)] items-start overflow-hidden rounded-[28px] px-2 py-2 glass-dock">
        <div
          aria-hidden
          className="pointer-events-none absolute top-2 right-2 left-2 grid h-9 grid-cols-3"
        >
          <div
            className="flex justify-center transition-transform duration-[420ms] ease-soft"
            style={{
              transform: `translate3d(${Math.max(activeIndex, 0) * 100}%, 0, 0)`,
              opacity: activeIndex >= 0 ? 1 : 0,
            }}
          >
            <span className="size-9 rounded-full bg-[var(--acid)]" />
          </div>
        </div>

        {APP_TABS.map((item, index) => {
          const active = index === activeIndex;
          const Icon = ICONS[item.href];
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              onClick={() => haptic(active ? "medium" : "light")}
              className="relative z-10 flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 transition-transform duration-300 ease-soft active:scale-95"
            >
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-full transition-[color,transform] duration-300 ease-soft",
                  active ? "text-[var(--ink)] scale-105" : "text-content-muted",
                )}
              >
                <Icon
                  className="size-[19px]"
                  strokeWidth={active ? 2.25 : 1.75}
                  absoluteStrokeWidth
                />
              </span>
              <span
                className={cn(
                  "pb-0.5 text-[10px] font-semibold tracking-wide transition-colors duration-300 ease-soft",
                  active ? "text-[var(--acid)]" : "text-content-muted",
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
