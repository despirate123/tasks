"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, ClipboardCheck, Handshake, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/components/telegram-init";

const ITEMS = [
  {
    href: "/",
    label: "Задания",
    icon: Compass,
    match: (p: string) => p === "/" || p.startsWith("/tasks"),
  },
  {
    href: "/my-tasks",
    label: "Мои",
    icon: ClipboardCheck,
    match: (p: string) => p.startsWith("/my-tasks") || p.startsWith("/submissions"),
  },
  {
    href: "/referrals",
    label: "Друзья",
    icon: Handshake,
    match: (p: string) => p.startsWith("/referrals"),
  },
  {
    href: "/profile",
    label: "Профиль",
    icon: UserRound,
    match: (p: string) => p.startsWith("/profile"),
  },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-3"
      style={{
        paddingBottom: "calc(var(--safe-bottom) + 0.55rem)",
        paddingLeft: "max(0.75rem, var(--safe-left))",
        paddingRight: "max(0.75rem, var(--safe-right))",
      }}
    >
      <div className="pointer-events-auto glass mx-auto flex max-w-[var(--app-max-width)] items-center justify-between rounded-[28px] px-1.5 py-1.5 ring-1 ring-inset ring-white/15">
        {ITEMS.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => haptic(active ? "medium" : "light")}
              className={cn(
                "relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-[22px] px-1 py-1.5 transition-transform duration-200 active:scale-95",
              )}
            >
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-full transition-all duration-300",
                  active
                    ? "bg-[var(--acid)] text-black shadow-[0_0_22px_rgba(200,255,0,0.45)]"
                    : "text-content-muted",
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
                  "text-[10px] font-semibold tracking-wide transition-colors",
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
