"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, ListChecks, Users, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/components/telegram-init";

const ITEMS = [
  { href: "/", label: "Задания", icon: LayoutGrid, match: (p: string) => p === "/" || p.startsWith("/tasks") },
  {
    href: "/my-tasks",
    label: "Мои",
    icon: ListChecks,
    match: (p: string) => p.startsWith("/my-tasks") || p.startsWith("/submissions"),
  },
  {
    href: "/referrals",
    label: "Друзья",
    icon: Users,
    match: (p: string) => p.startsWith("/referrals"),
  },
  {
    href: "/profile",
    label: "Профиль",
    icon: Wallet,
    match: (p: string) => p.startsWith("/profile"),
  },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border-subtle bg-surface-base/92 backdrop-blur-xl">
      <div
        className="mx-auto flex max-w-[var(--app-max-width)] items-stretch"
        style={{
          paddingBottom: "var(--safe-bottom)",
          paddingLeft: "var(--safe-left)",
          paddingRight: "var(--safe-right)",
        }}
      >
        {ITEMS.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => haptic("light")}
              className="flex flex-1 flex-col items-center gap-1 py-2.5 transition"
            >
              <span
                className={cn(
                  "flex h-7 items-center justify-center rounded-pill px-4 transition",
                  active ? "bg-brand-500/16" : "bg-transparent",
                )}
              >
                <Icon
                  className={cn(
                    "size-[18px] transition",
                    active ? "text-brand-300" : "text-content-muted",
                  )}
                />
              </span>
              <span
                className={cn(
                  "text-[10.5px] font-medium transition",
                  active ? "text-brand-300" : "text-content-muted",
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
